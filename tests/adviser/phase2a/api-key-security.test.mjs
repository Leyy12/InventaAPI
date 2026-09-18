import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issueCredential, authenticateCredential, parseCredential, publicKeyMetadata } from '../../../services/api-key-security.js';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { createDaaSSecurity, requirePlan } from '../../../services/daas-security.js';
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { authorizedProductIds } from '../../../services/daas-catalog.js';
import { memoryFirestore, invoke } from './memory-firestore.mjs';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const clock = () => new Date(NOW);
const legacy = { key: 'daas_old_credential', name: 'Existing integration', userId: 'owner', status: 'active', linkedProductIds: [] };
const account = { plan: 'Free', apiRequestLimit: 3, selectedSegment: 'Grocery' };
const product = { name: 'Rice', segment: 'Grocery', category: 'Grains', status: 'Active' };
function setup(extra = {}, metadata = {}) {
  const db = memoryFirestore({ 'users/owner': account, 'users/other': account,
    'api_keys/key-a': legacy, 'products/rice': product, ...extra }, metadata);
  const handlers = createApiKeyHandlers({ getDb: () => db, clock, verifyIdToken: async (token, checkRevoked) => {
    assert.equal(checkRevoked, true);
    if (token === 'owner-token') return { uid: 'owner', email: 'owner@example.test' };
    if (token === 'other-token') return { uid: 'other' };
    throw new Error('Invalid token');
  } });
  return { db, handlers };
}
const consume = (db, keyId = 'key-a', credential = legacy.key, extra = {}) => consumeAccountQuota(db, {
  keyId, userId: 'owner', credential, clock, ...extra,
});

// Existing quota tests start with an already-authoritative zero balance. Tests
// below explicitly exercise absent-state cutover rather than assuming zero.
async function activate(db, uid = 'owner') {
  await db.collection('account_api_usage').doc(uid).set({ window: '2026-09-17', used: 0 });
}

for (const operation of ['create', 'list', 'view', 'rename', 'products', 'revoke']) {
  test(`${operation}: unauthenticated and invalid-token requests fail before accessing data`, async () => {
    let accesses = 0;
    const handlers = createApiKeyHandlers({ getDb: () => { accesses += 1; throw new Error('must not access'); },
      verifyIdToken: async () => { throw new Error('invalid'); } });
    for (const token of [null, 'invalid']) {
      assert.equal((await invoke(handlers[operation], { token })).statusCode, 401);
    }
    assert.equal(accesses, 0);
  });
}

for (const operation of ['view', 'rename', 'products', 'revoke']) {
  test(`${operation}: owner succeeds, another user with a forged owner ID is denied`, async () => {
    const { db, handlers } = setup();
    const body = operation === 'rename' ? { name: 'Renamed' } : { linkedProductIds: ['rice'] };
    const foreign = await invoke(handlers[operation], { token: 'other-token', body: { ...body, userId: 'owner' } });
    assert.equal(foreign.statusCode, 403);
    assert.deepEqual(db.read('api_keys/key-a'), legacy);
    const own = await invoke(handlers[operation], { body: { ...body, userId: 'other' } });
    assert.equal(own.statusCode, 200);
  });
}

test('list ignores a forged query identity and returns only safe owner metadata', async () => {
  const { handlers } = setup({ 'api_keys/foreign': { ...legacy, userId: 'other', key: 'daas_other_secret' } });
  const response = await invoke(handlers.list, { query: { userId: 'other' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.keys.map(key => key.id), ['key-a']);
  assert.equal(JSON.stringify(response.body).includes(legacy.key), false);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('new credentials use the secure versioned format and independent random values', () => {
  const values = Array.from({ length: 64 }, () => issueCredential());
  assert.equal(new Set(values.map(value => value.credential)).size, 64);
  assert.equal(new Set(values.map(value => value.id)).size, 64);
  for (const value of values) {
    assert.match(value.credential, /^daas_v2_[a-f0-9]{32}\.[a-f0-9]{64}$/u);
    assert.equal(value.stored.credentialVersion, 2);
    assert.equal(Object.hasOwn(value.stored, 'key'), false);
  }
});

test('create uses verified identity and account entitlement; only creation returns the raw secret', async () => {
  const { db, handlers } = setup();
  const created = await invoke(handlers.create, { body: { keyName: 'New integration', userId: 'other',
    userEmail: 'forged@example.test', plan: 'Enterprise', requestLimit: 99999, status: 'revoked',
    key: 'daas_attacker_plaintext', credentialVersion: 1, credentialHash: 'attacker-hash' } });
  assert.equal(created.statusCode, 200);
  const stored = db.read(`api_keys/${created.body.id}`);
  assert.equal(stored.userId, 'owner');
  assert.equal(stored.userEmail, 'owner@example.test');
  assert.equal(stored.plan, 'Free');
  assert.equal(stored.requestLimit, 3);
  assert.equal(stored.status, 'active');
  assert.equal(JSON.stringify(stored).includes(created.body.key), false);
  assert.equal(Object.hasOwn(stored, 'key'), false);
  assert.equal(stored.credentialVersion, 2);
  assert.notEqual(stored.credentialHash, 'attacker-hash');
  assert.equal(JSON.stringify(db.read('audit_logs/auto-1')).includes(created.body.key), false);
  assert.equal((await authenticateCredential(db, created.body.key, NOW)).id, created.body.id);
  for (const operation of ['list', 'view']) {
    const response = await invoke(handlers[operation], { id: created.body.id });
    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes(created.body.key), false);
    assert.equal(serialized.includes(stored.credentialHash), false);
  }
});

test('legacy credentials still authenticate without migration', async () => {
  const { db } = setup();
  assert.equal((await authenticateCredential(db, legacy.key, NOW)).id, 'key-a');
  assert.deepEqual(db.read('api_keys/key-a'), legacy);
});

test('secure credentials reject a wrong secret and never fall back to plaintext', async () => {
  const { db } = setup();
  const issued = issueCredential();
  await db.collection('api_keys').doc(issued.id).create({ ...legacy, ...issued.stored });
  await db.collection('api_keys').doc('plaintext-decoy').create({ ...legacy, key: issued.credential });
  const wrong = `${issued.credential.slice(0, -1)}${issued.credential.endsWith('a') ? 'b' : 'a'}`;
  await assert.rejects(authenticateCredential(db, wrong, NOW), error => error.status === 401);
  await db.collection('api_keys').doc(issued.id).delete();
  await assert.rejects(authenticateCredential(db, issued.credential, NOW), error => error.status === 401);
  assert.equal(db.queries, 0);
  assert.equal(parseCredential('daas_v2_malformed'), null);
  assert.equal(parseCredential('daas_v3_unknown'), null);
});

test('secure documents cannot authenticate through a leftover legacy plaintext field', async () => {
  const { db } = setup({ 'api_keys/key-a': { ...legacy, ...issueCredential().stored } });
  await assert.rejects(authenticateCredential(db, legacy.key, NOW), error => error.status === 401);
});

test('duplicate legacy credentials fail closed instead of selecting an arbitrary owner', async () => {
  const { db } = setup({ 'api_keys/duplicate': { ...legacy, userId: 'other' } });
  await assert.rejects(authenticateCredential(db, legacy.key, NOW), error => error.status === 401);
});

for (const status of ['revoked', 'disabled', 'inactive', '', null, 'ACTIVE']) {
  test(`${String(status)} keys cannot authenticate in either credential format`, async () => {
    const { db } = setup({ 'api_keys/key-a': { ...legacy, status } });
    const secure = issueCredential();
    await db.collection('api_keys').doc(secure.id).create({ userId: 'owner', status, ...secure.stored });
    for (const credential of [legacy.key, secure.credential]) {
      await assert.rejects(authenticateCredential(db, credential, NOW), error => error.status === 401);
    }
  });
}

test('credential expiry is enforced independently of subscription expiry', async () => {
  for (const expiresAt of ['2026-09-17T11:59:59Z', NOW, 'invalid']) {
    const { db } = setup({ 'api_keys/key-a': { ...legacy, expiresAt } });
    await assert.rejects(authenticateCredential(db, legacy.key, NOW), error => error.status === 401);
  }
  const { db } = setup({ 'api_keys/key-a': { ...legacy, expiresAt: '2026-09-18T00:00:00Z',
    subscriptionExpiresAt: '2000-01-01' } });
  assert.equal((await authenticateCredential(db, legacy.key, NOW)).id, 'key-a');
});

test('metadata cannot leak unknown secret fields', () => {
  const metadata = publicKeyMetadata('key-a', { ...legacy, credentialHash: 'hash', recoverySecret: 'hidden' },
    { plan: 'Free', limit: 3 }, { used: 2, resetsAt: 'tomorrow' });
  for (const field of ['key', 'credentialHash', 'recoverySecret']) assert.equal(Object.hasOwn(metadata, field), false);
  assert.equal(metadata.requestsUsed, 2);
});

test('status and ownership cannot be changed through the name metadata endpoint', async () => {
  const { db, handlers } = setup();
  for (const field of ['status', 'credentialHash', 'plan', 'requestLimit', 'requestsUsed', 'resetAt', 'linkedProductIds', 'expiresAt']) {
    const response = await invoke(handlers.rename, { body: { name: 'New name', [field]: 'forged' } });
    assert.equal(response.statusCode, 400);
  }
  assert.deepEqual(db.read('api_keys/key-a'), legacy);
});

test('product-scope replacement removes stale legacy authorization without replacing credentials', async () => {
  const { db, handlers } = setup({ 'api_keys/key-a': { ...legacy, linkedProducts: [{ id: 'old-product', name: 'stale' }] } });
  const response = await invoke(handlers.products, { body: { linkedProductIds: ['rice'] } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(authorizedProductIds(db.read('api_keys/key-a')), ['rice']);
  assert.equal(db.read('api_keys/key-a').key, legacy.key);
  assert.equal(db.read('api_keys/key-a').productAvailability.rice.availableSince.toISOString(), NOW.toISOString());
});

test('scope validates identifiers and enforces the server account segment on creation and update', async () => {
  const { handlers } = setup({ 'products/hammer': { ...product, segment: 'Hardware' } });
  for (const operation of ['create', 'products']) {
    const base = { keyName: 'Scoped key' };
    assert.equal((await invoke(handlers[operation], { body: { ...base, linkedProductIds: ['hammer'] } })).statusCode, 403);
    assert.equal((await invoke(handlers[operation], { body: { ...base, linkedProducts: [{ id: 'products/rice' }] } })).statusCode, 400);
    assert.equal((await invoke(handlers[operation], { body: { ...base, linkedVariantSelections: { rice: [] } } })).statusCode, 400);
    assert.equal((await invoke(handlers[operation], { body: { ...base, linkedProducts: [{ id: 'rice', name: 'untrusted' }] } })).statusCode, 200);
  }
});

test('all keys consume one allowance; creating, revoking, and replacing keys never resets usage', async () => {
  const { db, handlers } = setup({ 'api_keys/key-b': { ...legacy, key: 'daas_second_credential', requestsUsed: 0 } });
  await activate(db);
  assert.equal((await consume(db)).usage.remaining, 2);
  assert.equal((await consume(db, 'key-b', 'daas_second_credential')).usage.remaining, 1);
  const created = await invoke(handlers.create, { body: { keyName: 'Key C' } });
  assert.equal(created.body.requestsUsed, 2);
  assert.equal((await invoke(handlers.revoke)).statusCode, 200);
  assert.equal((await consume(db, created.body.id, created.body.key)).usage.remaining, 0);
  const replacement = await invoke(handlers.create, { body: { keyName: 'Replacement key' } });
  await assert.rejects(consume(db, replacement.body.id, replacement.body.key), error => error.status === 429);
  await db.collection('api_keys').doc('key-b').delete();
  assert.equal(db.read('account_api_usage/owner').used, 3);
});

test('competing keys at the last remaining unit cannot both succeed', async () => {
  const { db } = setup({ 'account_api_usage/owner': { window: '2026-09-17', used: 2 },
    'api_keys/key-b': { ...legacy, key: 'daas_second_credential' } });
  const results = await Promise.allSettled([consume(db), consume(db, 'key-b', 'daas_second_credential')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 1);
  assert.equal(db.read('account_api_usage/owner').used, 3);
  assert.ok(db.retries > 0, 'concurrent conflict must replay the transaction');
});

test('many simultaneous requests cannot exceed account allowance', async () => {
  const { db } = setup({ 'users/owner': { ...account, apiRequestLimit: 7 } });
  await activate(db);
  const results = await Promise.allSettled(Array.from({ length: 25 }, () => consume(db)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 7);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 18);
  assert.equal(db.read('account_api_usage/owner').used, 7);
});

test('quota ignores key snapshots, per-key counter manipulation, and subscription flags', async () => {
  const { db } = setup({ 'api_keys/key-a': { ...legacy, plan: 'Enterprise', requestLimit: 999999, requestsUsed: 0, resetAt: '2100-01-01' },
    'users/owner': { ...account, subscription_status: 'active' },
    'account_api_usage/owner': { window: '2026-09-17', used: 3 } });
  await assert.rejects(consume(db), error => error.status === 429);
});

test('daily rollover uses UTC server time and ignores stored reset timestamp claims', async () => {
  const { db } = setup({ 'account_api_usage/owner': { window: '2026-09-16', used: 3, resetsAt: '2100-01-01' } });
  const result = await consume(db);
  assert.equal(result.usage.used, 1);
  assert.equal(result.usage.resetsAt, '2026-09-18T00:00:00.000Z');
  await db.collection('account_api_usage').doc('owner').update({ resetsAt: '2000-01-01' });
  assert.equal((await consume(db)).usage.used, 2);
});

test('missing accounts, malformed entitlement, and malformed usage fail closed', async () => {
  for (const value of [null, {}, { plan: 'Free' }, { plan: 'Free', apiRequestLimit: null }, { plan: 'Free', apiRequestLimit: -1 },
    { plan: 'Free', apiRequestLimit: '5000' }, { plan: 'Unknown', apiRequestLimit: 3 },
    { plan: 'constructor', apiRequestLimit: 3 }, { plan: '__proto__', apiRequestLimit: 3 }]) {
    const { db } = setup({ 'users/owner': value });
    await assert.rejects(consume(db), error => [401, 503].includes(error.status));
    assert.equal(db.read('account_api_usage/owner'), undefined);
  }
  for (const usage of [{ window: '2026-09-17', used: -1 }, { window: '2099-01-01', used: 0 }, { used: 0 },
    { window: '2026-09-17', used: '0' }, { window: '2026-02-30', used: 0 }, { window: '2026-00-01', used: 0 }]) {
    const { db } = setup({ 'account_api_usage/owner': usage });
    await assert.rejects(consume(db), error => error.status === 503);
  }
});

test('zero allowance is enforced; explicit unlimited enterprise usage is still recorded', async () => {
  const zero = setup({ 'users/owner': { ...account, apiRequestLimit: 0 } });
  await activate(zero.db);
  await assert.rejects(consume(zero.db), error => error.status === 429);
  const enterprise = setup({ 'users/owner': { plan: 'Enterprise', apiRequestLimit: null } });
  await activate(enterprise.db);
  assert.equal((await consume(enterprise.db)).usage.used, 1);
  assert.equal((await consume(enterprise.db)).usage.remaining, null);
});

test('existing Enterprise and Unlimited plan semantics are preserved without changing entitlement data', async () => {
  for (const plan of ['Enterprise', 'Unlimited']) {
    const entitlement = { plan, apiRequestLimit: 1 };
    const { db } = setup({ 'users/owner': entitlement });
    await activate(db);
    await consume(db);
    const result = await consume(db);
    assert.equal(result.usage.limit, null);
    assert.equal(result.usage.used, 2);
    assert.deepEqual(db.read('users/owner'), entitlement);
  }
});

test('different accounts have separate counters while secure and legacy keys share their owner counter', async () => {
  const { db, handlers } = setup({ 'api_keys/foreign': { ...legacy, userId: 'other', key: 'daas_other_secret' } });
  await activate(db);
  await activate(db, 'other');
  const secure = await invoke(handlers.create, { body: { keyName: 'Secure key' } });
  await consume(db);
  assert.equal((await consume(db, secure.body.id, secure.body.key)).usage.used, 2);
  assert.equal((await consume(db, 'foreign', 'daas_other_secret', { userId: 'other' })).usage.used, 1);
  assert.equal(db.read('account_api_usage/owner').used, 2);
});

test('secure credentials are revalidated after revocation and hash changes, not only at initial lookup', async () => {
  for (const change of [{ status: 'revoked' }, { credentialHash: '0'.repeat(64) }]) {
    const { db, handlers } = setup();
    const created = await invoke(handlers.create, { body: { keyName: 'Secure key' } });
    await authenticateCredential(db, created.body.key, NOW);
    await db.collection('api_keys').doc(created.body.id).update(change);
    await assert.rejects(consume(db, created.body.id, created.body.key), error => error.status === 401);
    assert.equal(db.read('account_api_usage/owner'), undefined);
  }
});

test('revocation, ownership changes, and deleted credentials are rechecked before consuming', async () => {
  for (const change of [{ status: 'revoked' }, { userId: 'other' }, { key: 'daas_replaced_secret' }]) {
    const { db } = setup();
    await authenticateCredential(db, legacy.key, NOW);
    await db.collection('api_keys').doc('key-a').update(change);
    await assert.rejects(consume(db), error => error.status === 401);
    assert.equal(db.read('account_api_usage/owner'), undefined);
  }
  const { db } = setup();
  await db.collection('api_keys').doc('key-a').delete();
  await assert.rejects(consume(db), error => error.status === 401);
});

test('failed transaction commits do not grant access or partially increment usage', async () => {
  const { db } = setup();
  await activate(db);
  db.failCommit = true;
  await assert.rejects(consume(db));
  assert.equal(db.read('account_api_usage/owner').used, 0);
  assert.equal(db.read('api_keys/key-a').lastUsed, undefined);
});

test('DaaS middleware consumes once and returns authoritative account data', async () => {
  const { db } = setup();
  await activate(db);
  const security = createDaaSSecurity({ getDb: () => db, clock });
  const authentication = await invoke(security.authenticateApiKey, { headers: { 'x-api-key': legacy.key } });
  assert.equal(authentication.nextCalled, true);
  const consumed = await invoke(security.enforceRequestLimit, authentication.req);
  assert.equal(consumed.nextCalled, true);
  assert.equal(consumed.req.requestUsage.used, 1);
  assert.equal(consumed.req.userPlan, 'Free');
  assert.equal(consumed.req.apiCredential, undefined);
  assert.equal(db.read('account_api_usage/owner').used, 1);
});

test('paid endpoint eligibility is checked atomically with the account counter', async () => {
  const { db } = setup();
  const security = createDaaSSecurity({ getDb: () => db, clock });
  const auth = await invoke(security.authenticateApiKey, { query: { apiKey: legacy.key } });
  const gated = await invoke(requirePlan(['pro', 'enterprise']), auth.req);
  const denied = await invoke(security.enforceRequestLimit, gated.req);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.nextCalled, false);
  assert.equal(db.read('account_api_usage/owner'), undefined);
});

test('authentication errors never echo credential-bearing database diagnostics', async () => {
  const credential = 'daas_sensitive_value';
  const security = createDaaSSecurity({ getDb: () => { throw new Error(`Failure querying ${credential}`); }, clock });
  const result = await invoke(security.authenticateApiKey, { headers: { 'x-api-key': credential } });
  assert.equal(result.statusCode, 503);
  assert.equal(JSON.stringify(result.body).includes(credential), false);
  assert.equal(result.nextCalled, false);
});

const CUTOVER = '2026-09-17T08:00:00.000Z';
const BOUNDARY = '2026-09-18T00:00:00.000Z';
const held = error => error.code === 'QUOTA_CUTOVER_PENDING' && error.details.quota.resetsAt === BOUNDARY;

test('pre-cutover accounts hold until next UTC midnight regardless of legacy counter/reset claims', async () => {
  const { db, handlers } = setup({ 'api_keys/key-a': { ...legacy, requestsUsed: 0, resetAt: '2099-01-01' },
    'api_keys/old-revoked': { ...legacy, status: 'revoked', requestsUsed: 500 } },
  { creationTimes: { 'users/owner': '2026-09-01T00:00:00.000Z' } });
  await assert.rejects(consume(db, 'key-a', legacy.key, { cutoverAt: CUTOVER }), held);
  assert.equal(db.read('account_api_usage/owner').holdUntil, BOUNDARY);
  assert.equal(db.read('api_keys/key-a').lastUsed, undefined);
  const replacement = await invoke(handlers.create, { body: { keyName: 'Replacement', requestsUsed: 0, cutoverAt: CUTOVER } });
  await db.collection('api_keys').doc('old-revoked').delete();
  await assert.rejects(consume(db, replacement.body.id, replacement.body.key, { cutoverAt: CUTOVER }), held);
  await assert.rejects(consume(db, 'key-a', legacy.key, { clock: () => new Date('2026-09-17T23:59:59.999Z') }), held);
});

test('a clean UTC boundary activates once and multiple keys share the new allowance', async () => {
  for (const at of [BOUNDARY, '2026-09-18T06:00:00.000Z']) {
    const { db } = setup({ 'api_keys/key-b': { ...legacy, key: 'daas_second' } });
    await assert.rejects(consume(db), held);
    const nextDay = { clock: () => new Date(at) };
    assert.equal((await consume(db, 'key-a', legacy.key, nextDay)).usage.used, 1);
    assert.equal((await consume(db, 'key-b', 'daas_second', nextDay)).usage.used, 2);
    assert.equal(db.read('account_api_usage/owner').holdUntil, undefined);
  }
});

test('concurrent first requests share one committed hold and cannot initialize a lower balance', async () => {
  const { db } = setup({ 'api_keys/key-b': { ...legacy, key: 'daas_second' } });
  const results = await Promise.allSettled([consume(db), consume(db, 'key-b', 'daas_second')]);
  assert.ok(results.every(result => result.status === 'rejected' && held(result.reason)));
  assert.ok(db.retries > 0);
  assert.equal(db.read('account_api_usage/owner').used, 0);
  assert.equal(db.read('account_api_usage/owner').holdUntil, BOUNDARY);
  await db.collection('users').doc('owner').update({ apiRequestLimit: 1 });
  const atBoundary = { clock: () => new Date(BOUNDARY) };
  const activated = await Promise.allSettled([consume(db, 'key-a', legacy.key, atBoundary), consume(db, 'key-b', 'daas_second', atBoundary)]);
  assert.equal(activated.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(activated.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 1);
  assert.equal(db.read('account_api_usage/owner').used, 1);
});

test('provably post-cutover server-created accounts initialize immediately and atomically', async () => {
  const { db } = setup({ 'users/owner': { ...account, apiRequestLimit: 1 }, 'api_keys/key-b': { ...legacy, key: 'daas_second' } },
    { creationTimes: { 'users/owner': '2026-09-17T09:00:00.000Z' } });
  const results = await Promise.allSettled([consume(db, 'key-a', legacy.key, { cutoverAt: CUTOVER }),
    consume(db, 'key-b', 'daas_second', { cutoverAt: CUTOVER })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.status === 429).length, 1);
  assert.equal(db.read('account_api_usage/owner').holdUntil, undefined);
  assert.equal(db.read('account_api_usage/owner').used, 1);
});

test('missing, client-writable, same-instant, future, or invalid creation/cutover evidence stays held', async () => {
  for (const [created, cutoverAt] of [[null, CUTOVER], [CUTOVER, CUTOVER], ['invalid', CUTOVER],
    ['2099-01-01', CUTOVER], ['2026-09-17T09:00:00.000Z', null], ['2026-09-17T09:00:00.000Z', 'invalid'],
    ['2026-09-17T09:00:00.000Z', '2026-09-18T00:00:00.000Z']]) {
    const { db } = setup({ 'users/owner': { ...account, createdAt: '2026-09-17T10:00:00.000Z',
      createTime: '2026-09-17T10:00:00.000Z', quotaActivated: true } }, { creationTimes: { 'users/owner': created } });
    await assert.rejects(consume(db, 'key-a', legacy.key, { cutoverAt }), held);
  }
});

test('malformed pending-window state fails closed rather than activating early', async () => {
  for (const holdUntil of [null, '2026-09-17T13:00:00.000Z', 'invalid']) {
    const { db } = setup({ 'account_api_usage/owner': { window: '2026-09-17', used: 0, holdUntil } });
    await assert.rejects(consume(db), error => error.code === 'USAGE_UNAVAILABLE');
  }
});

test('a failed hold commit never admits a request, and retry establishes the same boundary', async () => {
  const { db } = setup();
  db.failCommit = true;
  await assert.rejects(consume(db));
  assert.equal(db.read('account_api_usage/owner'), undefined);
  db.failCommit = false;
  await assert.rejects(consume(db), held);
});

test('the middleware reports pending cutover without granting downstream access', async () => {
  const { db } = setup();
  const security = createDaaSSecurity({ getDb: () => db, clock });
  const auth = await invoke(security.authenticateApiKey, { headers: { 'x-api-key': legacy.key } });
  const response = await invoke(security.enforceRequestLimit, auth.req);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, 'QUOTA_CUTOVER_PENDING');
  assert.equal(response.nextCalled, false);
});

test('a transaction conflict rechecks changed account entitlement before granting capacity', async () => {
  const { db } = setup();
  await activate(db);
  const original = db.runTransaction;
  let changed = false;
  db.runTransaction = callback => original(async tx => {
    const result = await callback(tx);
    if (!changed) {
      changed = true;
      await db.collection('users').doc('owner').update({ apiRequestLimit: 0 });
    }
    return result;
  });
  await assert.rejects(consume(db), error => error.status === 429);
  assert.ok(db.retries > 0);
  assert.equal(db.read('account_api_usage/owner').used, 0);
});

test('credential expiry is rechecked inside quota consumption', async () => {
  const { db } = setup({ 'api_keys/key-a': { ...legacy, expiresAt: '2026-09-17T12:01:00.000Z' } });
  await authenticateCredential(db, legacy.key, NOW);
  await assert.rejects(consume(db, 'key-a', legacy.key, { clock: () => new Date('2026-09-17T12:01:00.000Z') }),
    error => error.code === 'EXPIRED_API_KEY');
  assert.equal(db.read('account_api_usage/owner'), undefined);
});
