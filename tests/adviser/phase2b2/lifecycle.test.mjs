import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEntitlement, normalizeExpiredAccount } from '../../../functions/subscription-lifecycle.mjs';
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { authenticateCredential, issueCredential } from '../../../services/api-key-security.js';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { createPaymentHandlers } from '../../../services/payment-checkout.js';
import { fulfillPayment } from '../../../services/payment-webhook.js';
import { PRO_PURCHASE } from '../../../services/payment-contract.js';
import { beginAccountDeletion, completeAccountDeletion, createAccountDeletionHandler } from '../../../services/account-deletion.js';
import { createAdminEntitlements } from '../../../services/admin-entitlements.js';
import { memoryFirestore, invoke } from '../phase2b1/memory-firestore.mjs';

const NOW = new Date('2026-09-20T10:00:00.000Z');
const END = '2026-09-20T10:00:01.000Z';
const owner = { uid: 'owner', role: 'Developer', plan: 'Pro', subscription_status: 'active', apiRequestLimit: 5000,
  subscriptionStartedAt: '2026-08-21T10:00:01.000Z', subscriptionExpiresAt: END, selectedSegment: 'Grocery' };
const free = { ...owner, plan: 'Free', subscription_status: 'inactive', apiRequestLimit: 50, subscriptionExpiresAt: '2026-09-19T10:00:00.000Z' };
const key = { userId: 'owner', status: 'active', key: 'daas_one', plan: 'Pro', requestLimit: 5000 };
const verifyIdToken = async (token, revoked) => { assert.equal(revoked, true); if (token !== 'owner-token') throw Error('invalid'); return { uid: 'owner' }; };
function setup(account = owner) {
  const db = memoryFirestore({ 'users/owner': account, 'users/stranger': { ...free, uid: 'stranger' },
    'api_keys/one': key, 'api_keys/two': { ...key, key: 'daas_two' },
    'account_api_usage/owner': { window: '2026-09-20', used: 0 } });
  return db;
}
const consume = (db, now = NOW, keyId = 'one', extra = {}) => consumeAccountQuota(db, {
  keyId, userId: 'owner', credential: keyId === 'one' ? 'daas_one' : 'daas_two', clock: () => now, ...extra });
const handlers = (db, clock = () => NOW) => createPaymentHandlers({ getDb: () => db, verifyIdToken, clock,
  getConfig: () => ({ mode: 'test', secretKey: 'synthetic', dashboardUrl: 'https://example.test' }),
  createSession: async () => ({ sessionId: 'cs_new', paymentIntentId: 'pi_new', checkoutUrl: 'https://checkout.paymongo.com/new' }) });
function payment(db, label = 'a') {
  const id = `${label.repeat(8)}-${label.repeat(4)}-4${label.repeat(3)}-8${label.repeat(3)}-${label.repeat(12)}`;
  const value = { mode: 'test', eventId: `evt_${label}`, sessionId: `cs_${label}`, paymentId: `pay_${label}`, paymentIntentId: `pi_${label}` };
  db.seed(`payment_orders/${id}`, { id, userId: 'owner', state: 'pending', ...PRO_PURCHASE, ...value });
  db.seed(`payment_sessions/test_cs_${label}`, { orderId: id, userId: 'owner', mode: 'test', sessionId: value.sessionId });
  return { value, id };
}
for (const [label, now, active] of [['before', NOW, true], ['exact', new Date(END), false], ['after', new Date(Date.parse(END) + 1), false]]) {
  test(`expiry ${label}: canonical plan, status and allowance`, () => {
    const state = evaluateEntitlement(owner, now);
    assert.equal(state.activePro, active); assert.equal(state.plan, active ? 'Pro' : 'Free');
    assert.equal(state.limit, active ? 5000 : 50); assert.equal(state.status, active ? 'active' : 'inactive');
  });
  test(`API ${label}: same credential enforces canonical allowance`, async () => {
    const db = setup(); const result = await consume(db, now);
    assert.equal(result.usage.limit, active ? 5000 : 50);
    assert.equal(db.read('users/owner').plan, active ? 'Pro' : 'Free');
    assert.equal(db.read('api_keys/one').key, 'daas_one');
    assert.equal(db.read('users/owner').subscriptionExpiresAt, END);
  });
}
test('same key before/after expiry, second key cannot retain Pro or reset shared usage', async () => {
  const db = setup(); assert.equal((await consume(db)).usage.limit, 5000);
  const result = await consume(db, new Date(END), 'two');
  assert.equal(result.usage.used, 2); assert.equal(result.usage.limit, 50);
  db.seed('account_api_usage/owner', { window: '2026-09-20', used: 50 });
  await assert.rejects(consume(db, new Date(END)), e => e.status === 429);
});
test('downgrade preserves usage above Free allowance and commits even on denial', async () => {
  const db = setup(); db.seed('account_api_usage/owner', { window: '2026-09-20', used: 4000 });
  await assert.rejects(consume(db, new Date(END)), e => e.status === 429);
  assert.equal(db.read('users/owner').apiRequestLimit, 50);
  assert.equal(db.read('account_api_usage/owner').used, 4000);
});
test('expired account cannot use paid endpoint even with stale Pro key snapshot', async () => {
  const db = setup(); await assert.rejects(consume(db, new Date(END), 'one', { allowedPlans: ['pro'] }), e => e.status === 403);
  assert.equal(db.read('users/owner').plan, 'Free');
});
for (const patch of [{ status: 'revoked' }, { expiresAt: NOW.toISOString() }]) test(`independent key restriction ${JSON.stringify(patch)}`, async () => {
  const db = setup(); db.seed('api_keys/one', { ...key, ...patch });
  await assert.rejects(consume(db), e => e.status === 401);
});
for (const expiry of [undefined, 'invalid', true]) test(`ambiguous Pro expiry ${String(expiry)} fails closed`, async () => {
  const db = setup({ ...owner, subscriptionExpiresAt: expiry });
  await assert.rejects(consume(db), e => e.status === 503);
});
test('inactive Pro never grants paid access', async () => {
  assert.equal((await consume(setup({ ...owner, subscription_status: 'inactive' }))).usage.limit, 50);
});
test('stale Free account allowance cannot retain a prior Pro 5000 limit', async () => {
  assert.equal((await consume(setup({ ...free, apiRequestLimit: 5000 }))).usage.limit, 50);
});
for (const [label, account, expected] of [['active', owner, '2026-10-20T10:00:01.000Z'], ['expired', free, '2026-10-20T10:00:00.000Z']]) {
  test(`renewal ${label}: extends correct server boundary atomically`, async () => {
    const db = setup(account), p = payment(db);
    await fulfillPayment(db, p.value, NOW);
    assert.equal(db.read('users/owner').subscriptionExpiresAt, expected);
    assert.equal(db.read('users/owner').apiRequestLimit, 5000);
    assert.equal(db.read('users/owner').subscriptionStartedAt, label === 'active' ? owner.subscriptionStartedAt : NOW.toISOString());
    assert.equal(db.read(`payment_orders/${p.id}`).state, 'processed');
  });
}
test('active Customer may create a new server-bound renewal checkout', async () => {
  assert.equal((await invoke(handlers(setup()).checkout)).statusCode, 200);
});
test('two genuine concurrent payments preserve both terms; same-payment replays add nothing', async () => {
  const db = setup(), a = payment(db), b = payment(db, 'b');
  await Promise.all([fulfillPayment(db, a.value, NOW), fulfillPayment(db, b.value, NOW)]);
  assert.equal(db.read('users/owner').subscriptionExpiresAt, '2026-11-19T10:00:01.000Z');
  assert.ok(db.retries > 0); const snapshot = db.dump();
  await Promise.all([fulfillPayment(db, a.value, NOW), fulfillPayment(db, b.value, NOW)]);
  assert.deepEqual(db.dump(), snapshot);
});
test('different concurrent event IDs for one payment extend once', async () => {
  const db = setup(), a = payment(db);
  await Promise.all(Array.from({ length: 12 }, (_, i) => fulfillPayment(db, { ...a.value, eventId: `evt_${i}` }, NOW)));
  assert.equal(db.read('users/owner').subscriptionExpiresAt, '2026-10-20T10:00:01.000Z'); assert.equal(db.userWrites, 1);
});
test('renewal and optional scheduler racing cannot shorten the new term', async () => {
  const db = setup({ ...owner, subscriptionExpiresAt: NOW.toISOString() }), a = payment(db);
  await Promise.all([normalizeExpiredAccount(db, 'owner', () => NOW), fulfillPayment(db, a.value, NOW)]);
  assert.equal(db.read('users/owner').plan, 'Pro'); assert.equal(db.read('users/owner').subscriptionExpiresAt, '2026-10-20T10:00:00.000Z');
});
for (const kind of ['payment_events/', 'transactions/', 'users/', 'payment_orders/', 'commit']) test(`renewal failure ${kind}: no partial write`, async () => {
  const db = setup(), a = payment(db), snapshot = db.dump();
  if (kind === 'commit') db.failCommit = true; else db.failWrite = kind;
  await assert.rejects(fulfillPayment(db, a.value, NOW)); assert.deepEqual(db.dump(), snapshot);
});
for (const patch of [{ accountState: 'deleting' }, { accountState: 'deleted' }, { disabled: true }, { deletionRequested: true }, { status: 'pending_deletion' }]) {
  test(`blocked account ${JSON.stringify(patch)}: every key denied`, async () => {
    const db = setup({ ...owner, ...patch });
    for (const id of ['one', 'two']) await assert.rejects(consume(db, NOW, id), e => e.status === 403);
  });
}
test('deletion marker failure prevents Auth cleanup and leaves state unchanged', async () => {
  const db = setup(), snapshot = db.dump(); db.failCommit = true; let calls = 0;
  const handler = createAccountDeletionHandler({ getDb: () => db, verifyIdToken, deleteAuthUser: async () => calls++, clock: () => NOW });
  assert.equal((await invoke(handler, { body: { confirm: true } })).statusCode, 503);
  assert.equal(calls, 0); assert.deepEqual(db.dump(), snapshot);
});
test('Auth deletion failure keeps keys revoked; retry finalizes without touching another account or receipts', async () => {
  const db = setup(), a = payment(db); await fulfillPayment(db, a.value, NOW);
  const receipt = db.read('transactions/paymongo_test_pay_a'); const stranger = db.read('users/stranger');
  await beginAccountDeletion(db, 'owner', () => NOW);
  await assert.rejects(completeAccountDeletion(db, 'owner', async () => { throw Error('Auth unavailable'); }));
  for (const id of ['one', 'two']) await assert.rejects(consume(db, NOW, id));
  assert.equal(db.read('users/owner').accountState, 'deleting');
  await completeAccountDeletion(db, 'owner', async () => {}, () => NOW);
  await completeAccountDeletion(db, 'owner', async () => { throw Error('must not retry finished deletion'); });
  assert.equal(db.read('users/owner').accountState, 'deleted');
  assert.equal(db.read('account_api_usage/owner').blocked, true);
  assert.deepEqual(db.read('transactions/paymongo_test_pay_a'), receipt); assert.deepEqual(db.read('users/stranger'), stranger);
  await fulfillPayment(db, a.value, NOW); assert.equal(db.read('users/owner').accountState, 'deleted');
});
test('Auth deleted / tombstone commit outage is recoverable via user-not-found', async () => {
  const db = setup(); await beginAccountDeletion(db, 'owner', () => NOW);
  await assert.rejects(completeAccountDeletion(db, 'owner', async () => { db.failWrite = 'users/'; }));
  db.failWrite = null;
  await completeAccountDeletion(db, 'owner', async () => { throw Object.assign(Error(), { code: 'auth/user-not-found' }); }, () => NOW);
  assert.equal(db.read('users/owner').accountState, 'deleted');
});
test('cleanup key failure leaves marker blocked and can resume', async () => {
  const db = setup(); await beginAccountDeletion(db, 'owner', () => NOW); db.failWrite = 'api_keys/';
  await assert.rejects(completeAccountDeletion(db, 'owner', async () => { throw Error('must not reach Auth'); }));
  await assert.rejects(consume(db)); db.failWrite = null;
  await completeAccountDeletion(db, 'owner', async () => {}, () => NOW);
  assert.equal(db.read('api_keys/two').status, 'revoked');
});
test('API retry racing committed deletion cannot admit the request', async () => {
  const db = setup(); db.beforeCommit = async () => { db.beforeCommit = null; await beginAccountDeletion(db, 'owner', () => NOW); };
  await assert.rejects(consume(db)); assert.equal(db.read('account_api_usage/owner').used, 0); assert.ok(db.retries > 0);
});
test('API retries reevaluate time at the exact expiry boundary', async () => {
  const db = setup(); let time = NOW;
  db.beforeCommit = async () => { db.beforeCommit = null; time = new Date(END); db.seed('users/owner', { ...owner, fullName: 'Concurrent update' }); };
  assert.equal((await consume(db, NOW, 'one', { clock: () => time })).usage.limit, 50);
});
test('deletion wins renewal race: verified payment is retained for review with no grant', async () => {
  const db = setup(), a = payment(db);
  db.beforeCommit = async () => { db.beforeCommit = null; await beginAccountDeletion(db, 'owner', () => NOW); };
  const result = await fulfillPayment(db, a.value, NOW);
  assert.equal(result.reviewRequired, true); assert.equal(db.read('users/owner').accountState, 'deleting');
  assert.equal(db.read(`payment_orders/${a.id}`).state, 'review_required');
  assert.equal(db.read('transactions/paymongo_test_pay_a').entitlementGranted, false);
  assert.equal((await fulfillPayment(db, a.value, NOW)).duplicate, true);
});
test('renewal wins deletion race: paid audit remains, subsequent access denied', async () => {
  const db = setup(), a = payment(db);
  db.beforeCommit = async () => { db.beforeCommit = null; await fulfillPayment(db, a.value, NOW); };
  await beginAccountDeletion(db, 'owner', () => NOW); await assert.rejects(consume(db));
  assert.equal(db.read('transactions/paymongo_test_pay_a').entitlementGranted, true);
});
test('status is read-only, authenticates owner and reports dates/status/effective limit', async () => {
  const db = setup(), before = db.dump(), { status } = handlers(db, () => new Date(END));
  assert.equal((await invoke(status, { token: null })).statusCode, 401);
  assert.equal((await invoke(status, { query: { userId: 'stranger' } })).statusCode, 403);
  const response = await invoke(status); assert.equal(response.body.plan, 'Free'); assert.equal(response.body.apiRequestLimit, 50);
  assert.equal(response.body.subscriptionExpiresAt, END); assert.equal(response.body.subscription_status, 'inactive');
  assert.deepEqual(db.dump(), before);
});
test('status racing renewal cannot revert entitlement; previous receipts still confirm', async () => {
  const db = setup(), a = payment(db), b = payment(db, 'b'); await fulfillPayment(db, a.value, NOW);
  await Promise.all([invoke(handlers(db, () => new Date(END)).status), fulfillPayment(db, b.value, NOW)]);
  const result = await invoke(handlers(db).status, { query: { orderId: a.id } });
  assert.equal(result.body.paymentConfirmed, true); assert.equal(db.read('users/owner').plan, 'Pro');
});
test('deleted account cannot create/modify keys or checkout; no regeneration bypass', async () => {
  const db = setup({ ...owner, accountState: 'deleted' });
  assert.equal((await invoke(handlers(db).checkout)).statusCode, 403);
  const management = createApiKeyHandlers({ getDb: () => db, verifyIdToken, clock: () => NOW });
  for (const name of ['create', 'rename', 'revoke', 'products']) {
    const result = await invoke(management[name], { body: { keyName: 'test', name: 'test' }, params: { id: 'one' } });
    assert.ok(result.statusCode >= 400);
  }
});
test('secure and legacy keys both lose access at account deletion', async () => {
  const db = setup(); const issued = issueCredential(); db.seed(`api_keys/${issued.id}`, { ...issued.stored, userId: 'owner', status: 'active' });
  await beginAccountDeletion(db, 'owner', () => NOW);
  await assert.rejects(consumeAccountQuota(db, { keyId: issued.id, userId: 'owner', credential: issued.credential, clock: () => NOW }));
  await completeAccountDeletion(db, 'owner', async () => {}, () => NOW);
  await assert.rejects(authenticateCredential(db, issued.credential, NOW));
});
test('Admin entitlement display joins account allowance and shared usage; Customer forbidden', async () => {
  const db = setup(); const handler = createAdminEntitlements({ getDb: () => db, verifyIdToken, clock: () => new Date(END) });
  assert.equal((await invoke(handler, { body: { ids: ['stranger'] } })).statusCode, 403);
  db.seed('users/owner', { ...owner, role: 'Admin', plan: 'Enterprise', apiRequestLimit: null });
  const result = await invoke(handler, { body: { ids: ['stranger', 'missing'] } });
  assert.equal(result.body.accounts.stranger.limit, 50); assert.equal(result.body.accounts.missing.active, false);
});
test('status retry crossing expiry boundary returns Free without any write', async () => {
  const db = setup(); let now = NOW;
  db.beforeCommit = async () => { db.beforeCommit = null; now = new Date(END); db.seed('users/owner', { ...owner, fullName: 'Changed' }); };
  const response = await invoke(handlers(db, () => now).status);
  assert.equal(response.body.activePro, false); assert.equal(response.body.apiRequestLimit, 50); assert.equal(db.userWrites, 0);
});
test('key creation cannot race deletion and leave a usable new credential', async () => {
  const db = setup(); let attempts = 0;
  db.beforeCommit = async () => {
    if (++attempts === 2) { db.beforeCommit = null; await beginAccountDeletion(db, 'owner', () => NOW); }
  };
  const management = createApiKeyHandlers({ getDb: () => db, verifyIdToken, clock: () => NOW });
  const response = await invoke(management.create, { body: { keyName: 'racing key' } });
  assert.ok(response.statusCode >= 400);
  assert.equal(Object.keys(db.dump()).filter(path => path.startsWith('api_keys/')).length, 2);
});
test('deletion endpoint never reports completed cleanup after Auth failure', async () => {
  const db = setup(); const handler = createAccountDeletionHandler({ getDb: () => db, verifyIdToken, clock: () => NOW,
    deleteAuthUser: async () => { throw Error('Auth offline'); } });
  assert.equal((await invoke(handler, { body: { confirm: true, userId: 'stranger' } })).statusCode, 403);
  assert.equal((await invoke(handler, { body: {} })).statusCode, 400);
  const response = await invoke(handler, { body: { confirm: true } });
  assert.equal(response.statusCode, 202); assert.equal(response.body.deleted, false); assert.equal(response.body.accessDisabled, true);
  await assert.rejects(consume(db));
});
test('disabled-payment review failure is atomic and recoverable without reactivation', async () => {
  const db = setup({ ...owner, accountState: 'deleted' }), a = payment(db), snapshot = db.dump();
  db.failWrite = 'transactions/'; await assert.rejects(fulfillPayment(db, a.value, NOW)); assert.deepEqual(db.dump(), snapshot);
  db.failWrite = null; await fulfillPayment(db, a.value, NOW);
  await fulfillPayment(db, { ...a.value, eventId: 'evt_another' }, NOW);
  assert.equal(db.read('users/owner').accountState, 'deleted'); assert.equal(db.userWrites, 0);
});
