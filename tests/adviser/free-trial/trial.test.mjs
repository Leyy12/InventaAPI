import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFreeTrialHandlers } from '../../../services/free-trial.js';
import { evaluateEntitlement, renewalPeriod } from '../../../functions/subscription-lifecycle.mjs';
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { createDaaSSecurity, requirePlan } from '../../../services/daas-security.js';
import { activeCustomerSegment, loginSegmentAllowed, scopeCustomerProducts } from '../../../services/customer-segment.js';
import { createProductSubmissionHandlers } from '../../../services/product-submissions.js';
import { quotaSummary, customerReportScope } from '../../../services/reporting.js';
import { authenticateCredential, freeMonthlyUsage } from '../../../services/api-key-security.js';
import { createEntitlementPoller } from '../../../dashboard/src/lib/entitlement-poller.ts';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';
import { memoryFirestore as catalogDb, invoke as submissionInvoke } from '../r2a/memory-firestore.mjs';

const START = '2026-09-23T12:00:00.000Z', END = '2026-09-30T12:00:00.000Z';
const owner = { role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware', selectedSegment: 'Grocery' };
const productIds = ['tool', ...Array.from({ length: 49 }, (_, i) => `tool-${i}`)];
const productRecords = Object.fromEntries(Array.from({ length: 510 }, (_, i) => [`products/tool-${i}`, { name: `Tool ${i}`, segment: 'Hardware' }]));
const key = { userId: 'owner', key: 'daas_trial_a', status: 'active', linkedProductIds: productIds };
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
function fixture(account = {}, extra = {}, metadata = {}, auth = {}) {
  let at = START;
  const clock = () => new Date(at);
  const db = memoryFirestore({ 'users/owner': { ...owner, ...account }, 'api_keys/key-a': key,
    'api_keys/key-b': { ...key, key: 'daas_trial_b', status: 'revoked' }, ...productRecords,
    'account_api_usage/owner': { window: '2026-09-23', used: 2 },
    'account_free_monthly_usage/owner': { window: '2026-09', used: 2 },
    'products/tool': { name: 'Tool', segment: 'Hardware' }, 'products/food': { name: 'Food', segment: 'Grocery' }, ...extra }, metadata);
  const verifyIdToken = auth.verify ?? (async (token, revoked) => { assert.equal(revoked, true);
    if (token !== 'owner-token') throw new Error('Invalid'); return { uid: 'owner' }; });
  const handlers = createFreeTrialHandlers({ getDb: () => db, verifyIdToken, clock,
    revokeRefreshTokens: auth.revoke ?? (async () => {}) });
  const keys = createApiKeyHandlers({ getDb: () => db, verifyIdToken, clock });
  const consume = (b = false, more = {}) => consumeAccountQuota(db, { keyId: b ? 'key-b' : 'key-a',
    userId: 'owner', credential: b ? 'daas_trial_b' : key.key, clock, ...more });
  return { db, clock, handlers, keys, consume, time: value => { at = value; },
    activate: options => invoke(handlers.activate, options), status: options => invoke(handlers.status, options) };
}
test('isolated suite blocks SDK, HTTP and production bootstrap', async () => {
  for (const specifier of ['firebase-admin', 'node:https', '../../../database/firebase.js']) await assert.rejects(import(specifier));
  assert.throws(() => globalThis['fetch']('https://example.invalid'));
});
for (const segment of ['Grocery', 'Pharmacy', 'Hardware']) test('Free/Trial ownership ' + segment + ' ignores forged context', () => {
  for (const plan of ['Free', 'Starter', 'Pro Trial', 'Unavailable']) {
    const account = { plan, businessSegment: segment, selectedSegment: 'Grocery' };
    assert.equal(activeCustomerSegment(account), segment); assert.equal(loginSegmentAllowed(account, segment), true);
    for (const other of ['Grocery', 'Pharmacy', 'Hardware'].filter(value => value !== segment)) assert.equal(loginSegmentAllowed(account, other), false);
    const all = ['Grocery', 'Pharmacy', 'Hardware'].map(value => ({ segment: value }));
    assert.deepEqual(scopeCustomerProducts(all, account), [{ segment }]);
  }
});
for (const invalid of ['', null, undefined, 'groceries', 'hardware', 'Clothing', '//evil.example'])
  test('Login rejects noncanonical ' + String(invalid), () => assert.equal(loginSegmentAllowed(owner, invalid), false));
test('paid segment choice preserved; missing profile/ownership renders no products', () => {
  assert.equal(loginSegmentAllowed({ ...owner, plan: 'Pro' }, 'Grocery'), true);
  for (const account of [null, { plan: 'Free', selectedSegment: 'Grocery' }]) assert.deepEqual(scopeCustomerProducts([{ segment: 'Grocery' }], account), []);
});
for (const token of [null, 'invalid']) test('activation rejects identity ' + token, async () => {
  const f = fixture(); assert.equal((await f.activate({ token })).statusCode, 401);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
});
for (const account of [{ plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: END },
  { plan: 'Enterprise', apiRequestLimit: null }, { disabled: true }, { deleted: true }, { deletionRequested: true },
  { accountState: 'deleting' }, { role: 'Admin' }, { role: 'Unknown' }, { businessSegment: null }])
  test('activation fails closed ' + JSON.stringify(account), async () => {
    const f = fixture(account); assert.equal((await f.activate()).statusCode, 403);
    assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  });
test('eligible Free activates once with server UTC dates, preserving ownership and daily balance', async () => {
  const f = fixture(); assert.equal((await f.status()).body.eligible, true);
  const result = await f.activate(); assert.equal(result.statusCode, 200);
  assert.equal(result.body.startedAt, START); assert.equal(result.body.expiresAt, END);
  const account = f.db.read('users/owner');
  assert.equal(account.hasUsedFreeTrial, true); assert.equal(account.plan, 'Free');
  assert.equal(account.selectedSegment, 'Hardware'); assert.equal(account.businessSegment, 'Hardware');
  assert.equal(evaluateEntitlement(account, f.clock()).plan, 'Free Trial');
  assert.equal((await f.status()).body.status, 'active'); assert.equal((await f.activate()).statusCode, 409);
  assert.deepEqual(f.db.read('account_api_usage/owner'), { window: '2026-09-23', used: 2 });
});
test('activation revokes Firebase sessions before committing, without revoking API keys or counters', async () => {
  const calls = [];
  let f;
  f = fixture({}, {}, {}, { revoke: async uid => {
    calls.push(uid);
    assert.equal(f.db.read('users/owner').hasUsedFreeTrial, undefined);
    assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  } });
  const result = await f.activate();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.reauthenticationRequired, true);
  assert.deepEqual(calls, ['owner']);
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
  assert.deepEqual(f.db.read('account_free_monthly_usage/owner'), { window: '2026-09', used: 2 });
  assert.equal(f.db.read('users/owner').businessSegment, 'Hardware');
  assert.equal(f.db.read('api_keys/key-a').status, 'active');
  assert.equal((await authenticateCredential(f.db, key.key)).id, 'key-a');
});
test('revoked Firebase ID token is denied; a normally reauthenticated token can inspect Trial', async () => {
  let revoked = false;
  const f = fixture({}, {}, {}, {
    verify: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token === 'owner-token' && revoked) throw new Error('auth/id-token-revoked');
      if (token !== 'owner-token' && token !== 'fresh-token') throw new Error('Invalid');
      return { uid: 'owner' };
    },
    revoke: async uid => { assert.equal(uid, 'owner'); revoked = true; },
  });
  assert.equal((await f.activate()).statusCode, 200);
  assert.equal((await f.status()).statusCode, 401);
  assert.equal((await invoke(f.keys.list)).statusCode, 401);
  assert.equal((await f.status({ token: 'fresh-token' })).body.status, 'active');
  assert.equal((await invoke(f.keys.list, { token: 'fresh-token' })).statusCode, 200);
  assert.equal((await authenticateCredential(f.db, key.key)).id, 'key-a');
});
test('Auth revocation failure leaves Trial untouched and a retry starts it once', async () => {
  let attempts = 0;
  const f = fixture({}, {}, {}, { revoke: async () => {
    if (++attempts === 1) throw new Error('Transient Firebase Auth failure');
  } });
  const failed = await f.activate();
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.error, 'TRIAL_ACTIVATION_UNAVAILABLE');
  assert.equal(failed.body.reauthenticationRequired, true);
  assert.equal(f.db.read('users/owner').hasUsedFreeTrial, undefined);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  assert.equal(f.db.read('api_keys/key-a').status, 'active');
  assert.equal((await f.activate()).statusCode, 200);
  assert.equal(attempts, 2);
  assert.equal(f.db.read('users/owner').trialStartedAt, START);
  assert.equal(f.db.read('users/owner').trialExpiresAt, END);
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
});
test('ambiguous Auth response after remote revocation requires a new login before retry', async () => {
  let revoked = false, attempts = 0;
  const f = fixture({}, {}, {}, {
    verify: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token === 'owner-token' && revoked) throw new Error('auth/id-token-revoked');
      if (!['owner-token', 'fresh-token'].includes(token)) throw new Error('Invalid');
      return { uid: 'owner' };
    },
    revoke: async () => { revoked = true; if (++attempts === 1) throw new Error('Lost Auth response'); },
  });
  const failed = await f.activate();
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.reauthenticationRequired, true);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  assert.equal((await f.activate()).statusCode, 401);
  assert.equal((await f.activate({ token: 'fresh-token' })).statusCode, 200);
  assert.equal(attempts, 2);
  assert.equal(f.db.read('users/owner').trialStartedAt, START);
});
test('post-revocation Firestore failure requires re-login and does not consume Trial', async () => {
  let revoked = false, calls = 0;
  const f = fixture({}, {}, {}, {
    verify: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token === 'owner-token' && revoked) throw new Error('auth/id-token-revoked');
      if (!['owner-token', 'fresh-token'].includes(token)) throw new Error('Invalid');
      return { uid: 'owner' };
    },
    revoke: async () => { revoked = true; },
  });
  const run = f.db.runTransaction;
  f.db.runTransaction = async callback => {
    if (++calls === 2) f.db.failCommit = true;
    try { return await run(callback); } finally { f.db.failCommit = false; }
  };
  const failed = await f.activate();
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.reauthenticationRequired, true);
  assert.equal(f.db.read('users/owner').hasUsedFreeTrial, undefined);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  assert.equal((await f.activate()).statusCode, 401);
  assert.equal((await f.activate({ token: 'fresh-token' })).statusCode, 200);
  assert.equal(f.db.read('users/owner').trialStartedAt, START);
  assert.equal(f.db.read('users/owner').trialExpiresAt, END);
});
test('retry after success cannot extend dates, reset usage, or revoke another session', async () => {
  let revocations = 0, revoked = false;
  const f = fixture({}, {}, {}, {
    verify: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token === 'owner-token' && revoked) throw new Error('auth/id-token-revoked');
      if (!['owner-token', 'fresh-token'].includes(token)) throw new Error('Invalid');
      return { uid: 'owner' };
    },
    revoke: async () => { revocations++; revoked = true; },
  });
  assert.equal((await f.activate()).statusCode, 200);
  const before = f.db.read('users/owner');
  const counter = f.db.read('account_trial_usage/owner');
  f.time('2026-09-24T12:00:00.000Z');
  assert.equal((await f.activate()).statusCode, 401);
  assert.equal((await f.status({ token: 'fresh-token' })).body.status, 'active');
  const repeat = await f.activate({ token: 'fresh-token' });
  assert.equal(repeat.statusCode, 409);
  assert.equal(repeat.body.error, 'TRIAL_ALREADY_USED');
  assert.equal(revocations, 1);
  assert.equal(f.db.read('users/owner').trialStartedAt, before.trialStartedAt);
  assert.equal(f.db.read('users/owner').trialExpiresAt, before.trialExpiresAt);
  assert.deepEqual(f.db.read('account_trial_usage/owner'), counter);
});
test('concurrent activation grants exactly once', async () => {
  const f = fixture(), attempts = await Promise.all(Array.from({ length: 10 }, () => f.activate()));
  assert.equal(attempts.filter(result => result.statusCode === 200).length, 1);
  assert.equal(attempts.filter(result => result.statusCode === 409).length, 9);
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
});
for (const options of [{ body: { uid: 'another' } }, { body: { duration: 1000 } }, { body: { plan: 'Pro' } },
  { body: { hasUsedFreeTrial: false } }, { query: { segment: 'Grocery' } }])
  test('activation rejects client terms ' + JSON.stringify(options), async () => assert.equal((await fixture().activate(options)).statusCode, 400));
test('legacy/ambiguous markers cannot grant another trial', async () => {
  for (const value of [true, false, 'false']) assert.equal((await fixture({ hasUsedFreeTrial: value }).activate()).statusCode, 409);
});
test('1000 Trial requests preserve catalog size, history and expiry; expiry still denies access', async () => {
  const f = fixture(); await f.activate();
  const account = f.db.read('users/owner'), history = f.db.read('account_trial_usage/owner');
  for (let i = 0; i < 1000; i++) {
    const result = await f.consume(); assert.equal(result.usage.used, null); assert.equal(result.usage.productsIncluded, 50);
  }
  assert.equal((await f.status()).body.active, true);
  assert.deepEqual(f.db.read('users/owner'), account); assert.deepEqual(f.db.read('account_trial_usage/owner'), history);
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, productIds);
  assert.equal(f.db.read('account_api_usage/owner').used, 2); assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2);
  f.time(END); await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
});

test('concurrent Trial requests do not consume the historical request balance', async () => {
  const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').update({ used: 499 });
  const results = await Promise.allSettled([f.consume(), f.consume(), f.consume()]);
  assert.ok(results.every(result => result.status === 'fulfilled'));
  assert.equal(f.db.read('account_trial_usage/owner').used, 499);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2); assert.equal((await f.status()).body.active, true);
});

test('UTC midnight, new session/device and revocation never restart Trial or reset selection', async () => {
  const f = fixture(); await f.activate(); await f.consume(); const start = f.db.read('users/owner').trialStartedAt;
  f.time('2026-09-24T00:00:00.000Z'); await f.consume();
  assert.equal((await invoke(f.handlers.session)).body.initialized, false);
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, productIds);
  assert.equal((await invoke(f.keys.revoke)).statusCode, 200); assert.equal((await f.activate()).statusCode, 409);
  assert.equal(f.db.read('users/owner').trialStartedAt, start); await assert.rejects(f.consume(), { status: 401 });
});

test('Trial one-active-key cap survives UTC day rollover; segment authority remains unchanged', async () => {
  const f = fixture(), options = { body: { keyName: 'Synthetic', linkedProductIds: productIds } };
  assert.equal((await invoke(f.keys.create, options)).body.error, 'UPGRADE_REQUIRED');
  await f.activate(); assert.equal((await invoke(f.keys.create, options)).body.error, 'TRIAL_KEY_LIMIT');
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await invoke(f.keys.create, options)).body.error, 'TRIAL_KEY_LIMIT');
  assert.equal((await invoke(f.keys.create, { body: { keyName: 'Tamper', linkedProductIds: ['food', ...productIds] } })).statusCode, 403);
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
});

test('catalog Trial does not inherit a legacy daily clean-window hold', async () => {
  const f = fixture({}, { 'account_api_usage/owner': null }); await f.activate();
  assert.equal((await f.consume()).usage.productsIncluded, 50);
  assert.equal(f.db.read('account_api_usage/owner'), null);
  assert.equal((await invoke(f.keys.list)).body.usage.holdUntil, undefined);
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await f.consume()).usage.used, null);
});

test('malformed historical counters cannot reset Trial on session establishment', async () => {
  for (const used of [-1, 501, '0', null]) {
    const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').update({ used });
    assert.equal((await invoke(f.handlers.session)).statusCode, 503);
    assert.equal(f.db.read('account_trial_usage/owner').used, used);
  }
});

test('missing historical counter cannot be regenerated by activation or repeated session', async () => {
  const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').delete();
  assert.equal((await invoke(f.handlers.session)).statusCode, 503);
  assert.equal((await f.activate()).statusCode, 409); assert.equal(f.db.read('account_trial_usage/owner'), null);
});

test('failed activation commit leaves neither lifetime flag nor trial balance', async () => {
  const f = fixture(); f.db.failCommit = true; assert.equal((await f.activate()).statusCode, 503);
  assert.equal(f.db.read('users/owner').hasUsedFreeTrial, undefined);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
});
test('seven UTC calendar days are deterministic over month/leap/DST boundaries', async () => {
  for (const start of ['2028-02-25T23:30:00.000Z', '2026-03-07T10:00:00.000Z', '2026-12-29T00:00:00.000Z']) {
    const f = fixture(); f.time(start); const result = await f.activate();
    assert.equal(result.statusCode, 200); assert.equal(Date.parse(result.body.expiresAt) - Date.parse(start), 7 * 86400000);
  }
});
test('Trial passes real Pro endpoint middleware while Free/expired Trial cannot; ownership unchanged', async () => {
  const f = fixture(); await assert.rejects(f.consume(false, { allowedPlans: ['pro', 'enterprise'] }), { status: 403 });
  await f.activate();
  const security = createDaaSSecurity({ getDb: () => f.db, clock: f.clock });
  const request = { apiKeyData: { ...key, id: 'key-a' }, apiCredential: key.key };
  requirePlan(['Pro', 'Enterprise'])(request, {}, () => {});
  let next = false;
  await security.enforceRequestLimit(request, { set() {}, status() { throw new Error('Unexpected denial'); } }, () => { next = true; });
  assert.equal(next, true); assert.equal(request.userPlan, 'Free Trial'); assert.equal(activeCustomerSegment(request.userPlanData), 'Hardware');
  f.time(END); await assert.rejects(f.consume(false, { allowedPlans: ['pro'] }), { status: 403 });
});
test('expiry uses server boundary, requires upgrade, keeps keys/ownership, never permits reactivation', async () => {
  const f = fixture(); await f.activate();
  f.time('2026-09-30T11:59:59.999Z'); assert.equal((await f.status()).body.active, true);
  f.time(END); assert.equal((await f.status()).body.status, 'upgrade_required');
  assert.equal((await f.status()).body.endReason, 'expired');
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('api_keys/key-a').status, 'active');
  assert.equal(f.db.read('users/owner').businessSegment, 'Hardware'); assert.equal((await f.activate()).statusCode, 409);
});
test('paid Pro supersedes trial; trial time never extends paid renewal base', async () => {
  const f = fixture(); await f.activate(); await f.consume();
  const period = renewalPeriod(f.db.read('users/owner'), f.clock()); assert.equal(period.start, START);
  await f.db.collection('users').doc('owner').update({ plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: period.end });
  assert.equal((await f.consume()).usage.limit, 5000); assert.equal(f.db.read('account_trial_usage/owner').used, 0);
  assert.equal((await f.status()).body.status, 'paid'); assert.equal((await f.activate()).statusCode, 409);
  f.time(period.end); await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('users/owner').hasUsedFreeTrial, true);
  assert.equal(evaluateEntitlement(f.db.read('users/owner'), f.clock()).status, 'upgrade_required');
});
test('never-used Free has no legacy monthly entitlement before session establishment', async () => {
  const f = fixture();
  assert.equal(evaluateEntitlement(f.db.read('users/owner'), f.clock()).plan, 'Upgrade Required');
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal((await f.status()).body.eligible, true);
});
test('Upgrade Required preserves owned segment and Dashboard report scope', async () => {
  const f = fixture(); await f.activate(); f.time(END);
  const effective = evaluateEntitlement(f.db.read('users/owner'), f.clock());
  assert.equal(activeCustomerSegment({ ...f.db.read('users/owner'), plan: effective.plan }), 'Hardware');
  assert.deepEqual(customerReportScope(effective.plan, 'Hardware'),
    { state: 'ready', segment: 'Hardware', restricted: true });
  assert.deepEqual(scopeCustomerProducts([{ segment: 'Hardware' }, { segment: 'Grocery' }],
    { ...f.db.read('users/owner'), plan: effective.plan }), [{ segment: 'Hardware' }]);
});
test('post-Trial middleware returns a stable 403 entitlement error before monthly admission', async () => {
  const f = fixture(); await f.activate(); f.time(END);
  const security = createDaaSSecurity({ getDb: () => f.db, clock: f.clock });
  const req = { apiKeyData: { ...key, id: 'key-a' }, apiCredential: key.key };
  const res = { statusCode: 200, body: null, set() { return this; }, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
  let passed = false;
  await security.enforceRequestLimit(req, res, () => { passed = true; });
  assert.equal(passed, false); assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { success: false, error: 'UPGRADE_REQUIRED',
    message: 'Your Free Trial has ended. Upgrade to Pro or Pro Max to continue using the API.' });
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2);
});
test('ended Trial keeps key history and management, but rejects new key issuance', async () => {
  const f = fixture(); await f.activate(); f.time(END);
  const list = await invoke(f.keys.list);
  assert.equal(list.statusCode, 200); assert.equal(list.body.keys.length, 1);
  assert.equal(list.body.keys[0].quotaState, 'upgrade_required');
  assert.equal(list.body.usage.state, 'upgrade_required');
  assert.equal(quotaSummary(list.body.usage, f.clock()), null);
  const create = await invoke(f.keys.create, { body: { keyName: 'Unusable' } });
  assert.equal(create.statusCode, 403); assert.equal(create.body.error, 'UPGRADE_REQUIRED');
  assert.equal((await invoke(f.keys.rename, { params: { id: 'key-a' }, body: { name: 'Kept Key' } })).statusCode, 200);
  assert.equal((await invoke(f.keys.revoke, { params: { id: 'key-b' } })).statusCode, 200);
  assert.equal(f.db.read('api_keys/key-a').status, 'active');
  assert.equal(f.db.read('api_keys/key-b').status, 'revoked');
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2);
});
test('paid Pro restores the same active key, then paid expiry restores Upgrade Required', async () => {
  const f = fixture(); await f.activate(); await f.consume(); f.time(END);
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  await f.db.collection('users').doc('owner').update({ plan: 'Pro', subscription_status: 'active',
    subscriptionExpiresAt: '2026-10-31T12:00:00.000Z', apiRequestLimit: 5000 });
  assert.equal((await f.consume()).usage.used, 1);
  assert.equal(f.db.read('api_keys/key-a').status, 'active');
  assert.equal((await f.status()).body.status, 'paid');
  assert.equal((await invoke(f.keys.create, { body: { keyName: 'Paid Key' } })).statusCode, 200);
  f.time('2026-10-31T12:00:00.000Z');
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('users/owner').hasUsedFreeTrial, true);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2);
});
test('usage projection shows Trial catalog counts and expiry, never a request allowance', async () => {
  const f = fixture(); await f.activate(); await f.consume();
  const data = (await invoke(f.keys.list)).body; assert.equal(data.keys[0].quotaPeriod, 'trial_catalog');
  assert.equal(data.usage.used, null); assert.equal(data.usage.limit, null); assert.equal(quotaSummary(data.usage, f.clock()), null);
  assert.deepEqual(data.trialCatalog, { productsIncluded: 50, minimumProducts: 50, maximumProducts: 500,
    productsAvailable: 450, activeKeys: 1, maximumActiveKeys: 1, expiresAt: END });
});

for (const segment of ['Grocery', 'Pharmacy', 'Hardware']) test('Hardware submission versus ' + segment + ' payload', async () => {
  const db = catalogDb({ 'users/customer': owner });
  const handlers = createProductSubmissionHandlers({ getDb: () => db, now: () => new Date(START),
    verifyIdToken: async (_, revoked) => { assert.equal(revoked, true); return { uid: 'customer' }; } });
  const result = await submissionInvoke(handlers.submit, { token: 'customer', headers: { 'idempotency-key': 'trial-product-000001' },
    body: { name: 'Test Tool', brand: 'Brand', segment, category: 'Tools', description: '',
      image_url: 'https://example.invalid/tool.jpg', variants: [{ size: '1pc', flavor: '', price: 10 }] } });
  assert.equal(result.statusCode, segment === 'Hardware' ? 201 : 403);
  assert.equal(Object.keys(db.dump()).filter(path => path.startsWith('products/')).length, 0);
});
test('entitlement poller clears stale UI and refreshes at Trial expiry', async () => {
  const delays = [], states = [];
  const poller = createEntitlementPoller({ read: async () => ({ activePro: false, activeTrial: true, secondsRemaining: 5 }),
    onState: state => states.push(state), now: () => 0, schedule: (_, delay) => { delays.push(delay); return 1; }, cancel: () => {} });
  poller.start(); await poller.refresh(); poller.stop(); assert.equal(delays.at(-1), 5000); assert.equal(states[0], null);
});
test('route, scoped UI, server counter and URL-only wiring', () => {
  assert.match(read('server.js'), /app\.use\('\/api\/v1\/free-trial'/);
  assert.match(read('routes/freetrial.js'), /revokeRefreshTokens: uid => getAuth\(\)\.revokeRefreshTokens\(uid\)/);
  assert.match(read('services/free-trial.js'), /verifyIdToken\(match\[1\], true\)/);
  assert.match(read('dashboard/src/lib/firebase/auth-context.tsx'), /activeCustomerSegment/);
  assert.match(read('dashboard/src/app/dashboard/products/page.tsx'), /scopeCustomerProducts\(products, appUser\)/);
  assert.match(read('dashboard/src/app/dashboard/page.tsx'), /Active Business Segment/);
  const add = read('dashboard/src/components/products/AddProductModal.tsx');
  assert.match(add, /disabled=\{segmentLocked\}/); assert.doesNotMatch(add, /uploadBytes|addDoc|setDoc/);
  const trial = read('dashboard/src/app/dashboard/free-trial/page.tsx');
  assert.match(trial, /generation\.current !== request/); assert.match(trial, /setResult\(null\)/);
  assert.doesNotMatch(trial, /\/free-trial\/activate|onClick=\{activate\}/);
  assert.match(read('dashboard/src/lib/firebase/auth-context.tsx'), /await establishCustomerTrial\(currentUser\);\s+await readSubscription\(currentUser\)/);
  assert.doesNotMatch(trial, /await refreshUserDoc\(\)/);
  assert.doesNotMatch(trial, /localStorage|sessionStorage|updateDoc|setDoc/);
  assert.match(read('routes/daas.js'), /router\.get\('\/sales-feed', authenticateApiKey, requirePaidSubscription, enforceRequestLimit/u);
  assert.match(read('services/account-quota.js'), /paidSubscriptionRequired && \(entitlement\.level < 1 \|\| entitlement\.activeTrial\)/u);
  assert.ok(/max: 60/.test(read('server.js')));
});

test('Free month rollover cannot grant access or mutate historical balance', async () => {
  const f = fixture({}, { 'account_free_monthly_usage/owner': { window: '2026-08', used: 50 } });
  for (const at of ['2026-09-01T00:00:00.000Z', '2026-09-02T00:00:00.000Z', '2026-10-01T00:00:00.000Z']) {
    f.time(at);
    await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
    assert.equal((await invoke(f.keys.list)).body.usage.state, 'upgrade_required');
  }
  assert.deepEqual(f.db.read('account_free_monthly_usage/owner'), { window: '2026-08', used: 50 });
});
test('concurrent legacy Free keys cannot consume an obsolete monthly allowance', async () => {
  const f = fixture({}, { 'account_free_monthly_usage/owner': { window: '2026-09', used: 49 } });
  const results = await Promise.allSettled([f.consume(), f.consume(), f.consume()]);
  assert.ok(results.every(r => r.status === 'rejected' && r.reason.code === 'UPGRADE_REQUIRED'));
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 49);
});
for (const cap of [0, 7, 50, 5000]) test('legacy Free cap cannot authorize access: ' + cap, async () => {
  const f = fixture({ apiRequestLimit: cap }, { 'account_free_monthly_usage/owner': { window: '2026-09', used: 0 } });
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal((await invoke(f.keys.list)).body.usage.limit, 0);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 0);
});
test('month rollover handles December and leap February without local timezone', () => {
  for (const [at, reset] of [['2026-12-31T23:59:59.999Z', '2027-01-01T00:00:00.000Z'],
    ['2028-02-29T23:59:59.999Z', '2028-03-01T00:00:00.000Z']]) {
    assert.equal(freeMonthlyUsage(null, null, new Date(at)).resetsAt, reset);
  }
});
test('missing monthly provenance cannot authorize legacy Free or create another monthly counter', async () => {
  const f = fixture({ createdAt: START }, { 'account_free_monthly_usage/owner': null });
  const first = await Promise.allSettled([f.consume(), f.consume()]);
  assert.ok(first.every(r => r.status === 'rejected' && r.reason.code === 'UPGRADE_REQUIRED'));
  assert.equal(f.db.read('account_free_monthly_usage/owner'), null);
  f.time('2026-10-01T00:00:00.000Z'); await assert.rejects(f.consume(), { code: 'UPGRADE_REQUIRED' });
});
test('even provably new Free needs automatic Trial, not a monthly cutover exception', async () => {
  const cutoff = '2026-09-23T10:00:00.000Z';
  const f = fixture({}, { 'account_free_monthly_usage/owner': null }, { creationTimes: { 'users/owner': '2026-09-23T11:00:00.000Z' } });
  await assert.rejects(f.consume(false, { monthlyCutoverAt: cutoff }), { code: 'UPGRADE_REQUIRED' });
  assert.equal((await invoke(f.handlers.session)).statusCode, 200);
  assert.equal((await f.consume()).usage.used, null);
  const old = fixture({}, { 'account_free_monthly_usage/owner': null });
  await assert.rejects(old.consume(false, { cutoverAt: cutoff }), { code: 'UPGRADE_REQUIRED' });
});

test('new and legacy never-used Free sessions initialize exactly once without token revocation or selection reset', async () => {
  for (const plan of ['Free', 'Starter']) {
    let revocations = 0;
    const f = fixture({ plan }, { 'account_api_usage/owner': null, 'account_free_monthly_usage/owner': null }, {},
      { revoke: async () => { revocations++; } });
    const results = await Promise.all(Array.from({ length: 10 }, () => invoke(f.handlers.session)));
    assert.ok(results.every(r => r.statusCode === 200)); assert.equal(results.filter(r => r.body.initialized).length, 1);
    const account = f.db.read('users/owner');
    assert.equal(account.trialStartedAt, START); assert.equal(account.trialExpiresAt, END);
    assert.equal(account.trialConsumed, false); assert.equal(account.businessSegment, 'Hardware'); assert.equal(revocations, 0);
    await f.consume(); const counter = f.db.read('account_trial_usage/owner');
    f.time('2026-09-24T12:00:00.000Z'); assert.equal((await invoke(f.handlers.session)).body.initialized, false);
    assert.deepEqual(f.db.read('users/owner'), account); assert.deepEqual(f.db.read('account_trial_usage/owner'), counter);
    assert.equal(f.db.read('account_free_monthly_usage/owner'), null);
    assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, productIds);
  }
});

test('automatic session never resets active, expired or consumed legacy Trial', async () => {
  const f = fixture(); await f.activate(); await f.consume();
  const account = f.db.read('users/owner'), counter = f.db.read('account_trial_usage/owner');
  assert.equal((await invoke(f.handlers.session)).body.initialized, false);
  assert.deepEqual(f.db.read('users/owner'), account); assert.deepEqual(f.db.read('account_trial_usage/owner'), counter);
  f.time(END); assert.equal((await invoke(f.handlers.session)).body.initialized, false);
  assert.equal(evaluateEntitlement(f.db.read('users/owner'), f.clock()).upgradeRequired, true);
  assert.deepEqual(f.db.read('account_trial_usage/owner'), counter);
  const exhausted = fixture(); await exhausted.activate();
  await exhausted.db.collection('account_trial_usage').doc('owner').update({ used: 500 });
  assert.equal((await invoke(exhausted.handlers.session)).body.initialized, false);
  assert.equal(exhausted.db.read('users/owner').trialConsumed, true);
  await assert.rejects(exhausted.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
});

test('automatic session preserves paid Pro/Pro Max and legacy Enterprise/Unlimited exactly, including historical Trial evidence', async () => {
  for (const [plan, limit] of [['Pro', 5000], ['Pro Max', null], ['Enterprise', null], ['Unlimited', null]]) {
    const f = fixture({ plan, apiRequestLimit: limit, subscription_status: 'active', subscriptionExpiresAt: END,
      hasUsedFreeTrial: true });
    const before = f.db.read('users/owner');
    assert.equal((await invoke(f.handlers.session)).body.initialized, false);
    assert.deepEqual(f.db.read('users/owner'), before);
    assert.equal(f.db.read('account_trial_usage/owner'), undefined);
    assert.equal((await f.consume()).usage.limit, limit);
  }
});
test('500 linked products remain accessible after request 501 without consuming Trial', async () => {
  const f = fixture({}, { 'account_api_usage/owner': null,
    'api_keys/key-a': { ...key, linkedProductIds: Array.from({ length: 500 }, (_, i) => `tool-${i}`) } });
  await invoke(f.handlers.session);
  for (let i = 0; i < 501; i++) { const result = await f.consume(); assert.equal(result.usage.productsIncluded, 500); }
  assert.equal(evaluateEntitlement(f.db.read('users/owner'), f.clock()).activeTrial, true);
  assert.equal(f.db.read('users/owner').trialConsumed, false); assert.equal(f.db.read('account_trial_usage/owner').used, 0);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2); assert.equal(f.db.read('api_keys/key-a').status, 'active');
});

test('automatic Trial expiry is exact elapsed time across leap/month/DST boundaries and cannot restart', async () => {
  for (const start of ['2028-02-25T23:30:00.000Z', '2026-03-07T10:00:00.000Z', '2026-12-29T00:00:00.000Z']) {
    const f = fixture(); f.time(start); await invoke(f.handlers.session);
    const end = f.db.read('users/owner').trialExpiresAt;
    assert.equal(Date.parse(end) - Date.parse(start), 7 * 86400000);
    f.time(new Date(Date.parse(end) - 1).toISOString()); assert.equal((await f.consume()).usage.used, null);
    f.time(end); await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
    const counter = f.db.read('account_trial_usage/owner');
    assert.equal((await invoke(f.handlers.session)).body.initialized, false);
    assert.deepEqual(f.db.read('account_trial_usage/owner'), counter);
  }
});
test('automatic session rejects forged terms, absent/revoked identity and disabled/admin profiles', async () => {
  for (const options of [{ token: null }, { token: 'invalid' }, { body: { trialStartedAt: START } }, { query: { quota: 5000 } }]) {
    const f = fixture(); const result = await invoke(f.handlers.session, options);
    assert.ok([400, 401].includes(result.statusCode)); assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  }
  for (const account of [{ disabled: true }, { deleted: true }, { deletionRequested: true }, { role: 'Admin' }, { businessSegment: null }]) {
    const f = fixture(account); assert.equal((await invoke(f.handlers.session)).statusCode, 403);
    assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  }
});
test('automatic session fails closed on ambiguous lifetime evidence or missing/corrupt counter', async () => {
  for (const state of [{ hasUsedFreeTrial: false }, { trialConsumed: true }, { trialStartedAt: START }]) {
    const f = fixture(state); assert.equal((await invoke(f.handlers.session)).statusCode, 503);
    assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  }
  const orphan = fixture({}, { 'account_trial_usage/owner': { used: 0 } });
  assert.equal((await invoke(orphan.handlers.session)).statusCode, 503);
  const f = fixture(); await invoke(f.handlers.session);
  await f.db.collection('account_trial_usage').doc('owner').delete();
  assert.equal((await invoke(f.handlers.session)).statusCode, 503);
  assert.equal(f.db.read('account_trial_usage/owner'), null);
});
test('automatic initialization rollback and retry cannot leave partial state', async () => {
  const f = fixture(); f.db.failCommit = true;
  assert.equal((await invoke(f.handlers.session)).statusCode, 503);
  assert.equal(f.db.read('users/owner').trialStartedAt, undefined);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  f.db.failCommit = false; assert.equal((await invoke(f.handlers.session)).body.initialized, true);
});
test('Customer session/pricing/UI contain automatic Free Trial contract and no manual activation', () => {
  assert.match(read('routes/freetrial.js'), /router.post\('\/session', handlers.session\)/);
  assert.match(read('dashboard/src/lib/subscription.ts'), /method: 'POST'/);
  const overview = read('dashboard/src/components/reports/CustomerUsageSummary.tsx');
  assert.match(overview, /Free Trial · Active/); assert.match(overview, /Products Included/);
  assert.match(overview, /Trial Expires:/);
  for (const file of ['dashboard/src/app/dashboard/page.tsx', 'dashboard/src/app/dashboard/free-trial/page.tsx',
    'dashboard/src/app/dashboard/plan-billing/page.tsx', 'dashboard/src/config/plans.ts']) {
    assert.doesNotMatch(read(file), /Pro Trial|50 requests|forever|onClick=\{activate\}/);
  }
  const rules = read('firestore.rules');
  assert.equal((rules.match(/'trialConsumed'/g) || []).length, 2);
});
test('Trial ignores exhausted Free month; time expiry enforces paywall without key revocation', async () => {
  const f = fixture({}, { 'account_free_monthly_usage/owner': { window: '2026-09', used: 50 } });
  await f.activate(); for (let i = 0; i < 500; i++) await f.consume();
  assert.equal((await f.status()).body.active, true); f.time(END);
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('api_keys/key-a').status, 'active'); assert.equal((await f.activate()).statusCode, 409);
  f.time('2026-10-01T00:00:00.000Z'); await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('account_trial_usage/owner').used, 0); assert.equal(f.db.read('account_free_monthly_usage/owner').used, 50);
});

test('Trial expiry preserves historical Free monthly balance without reopening its lower cap', async () => {
  const f = fixture({ apiRequestLimit: 3 }); await f.activate();
  for (let i = 0; i < 60; i++) await f.consume();
  f.time(END); await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2);
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
});
test('failed request metadata commit cannot change Trial history or catalog', async () => {
  const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').update({ used: 499 });
  const account = f.db.read('users/owner'); f.db.failCommit = true; await assert.rejects(f.consume()); f.db.failCommit = false;
  assert.deepEqual(f.db.read('users/owner'), account); assert.equal(f.db.read('account_trial_usage/owner').used, 499);
  await f.consume(); assert.equal((await f.status()).body.active, true);
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, productIds);
});

test('paid Pro retains daily rollover independent of saved Free month', async () => {
  const f = fixture({ plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: END },
    { 'account_api_usage/owner': { window: '2026-09-23', used: 5000 } });
  await assert.rejects(f.consume(), { status: 429 });
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await f.consume()).usage.used, 1);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2);
});
test('UTC month rollover never resets Trial; later expiry remains paid-only', async () => {
  const f = fixture(); f.time('2026-09-29T12:00:00.000Z'); await f.activate(); await f.consume();
  f.time('2026-10-01T00:00:00.000Z');
  const next = await f.consume(); assert.equal(next.account.plan, 'Free Trial'); assert.equal(next.usage.used, null);
  assert.equal(f.db.read('account_free_monthly_usage/owner').window, '2026-09');
  f.time('2026-10-06T12:00:00.000Z');
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('account_free_monthly_usage/owner').window, '2026-09');
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
});
test('Settings preserves segment policy; Customer copy advertises lifetime Free Trial, not monthly Free', () => {
  const settings = read('dashboard/src/app/dashboard/settings/page.tsx');
  assert.match(settings, /segmentRestricted = restrictedSegmentAccount\(appUser\)/);
  assert.match(settings, /activeCustomerSegment\(appUser\)/);
  assert.match(read('dashboard/src/config/plans.ts'), /Up to 500 products/);
  assert.doesNotMatch(read('dashboard/src/config/plans.ts'), /50 requests|forever|Pro Trial/);
  assert.doesNotMatch(read('dashboard/src/components/reports/CustomerUsageSummary.tsx'), /Monthly account limit|Remaining this month/);
  const billing = read('dashboard/src/app/dashboard/plan-billing/page.tsx');
  assert.match(billing, /planId="pro" currentPlan=\{entitlement\.plan\} canPurchase=\{entitlement\.canPurchasePro\} onChoose=\{purchase\}/);
  assert.match(billing, /Renew \$\{plan\.name\}/);
  assert.match(billing, /Get \$\{plan\.name\}/);
});

const scope = (count, offset = 0) => Array.from({ length: count }, (_, i) => `tool-${i + offset}`);
const updateCatalog = (f, ids, version = 0, id = 'key-a') => invoke(f.keys.products,
  { id, body: { linkedProductIds: ids, expectedScopeVersion: version } });
for (const count of [0, 49, 50, 51, 499, 500, 501]) test(`Trial generation enforces current ${count}-product catalog`, async () => {
  const f = fixture({}, { 'api_keys/key-a': null }); await invoke(f.handlers.session);
  const account = f.db.read('users/owner'), counter = f.db.read('account_trial_usage/owner');
  const result = await invoke(f.keys.create, { body: { keyName: 'Product catalog', linkedProductIds: scope(count) } });
  const valid = count >= 50 && count <= 500;
  assert.equal(result.statusCode, valid ? 200 : 400);
  if (count < 50) { assert.equal(result.body.error, 'TRIAL_PRODUCT_MINIMUM'); assert.match(result.body.message, /at least 50 products/); }
  const status = (await f.status()).body;
  assert.equal(status.productsIncluded, valid ? count : 0); assert.equal(status.activeKeys, valid ? 1 : 0);
  assert.equal(status.active, true); assert.equal(f.db.read('users/owner').trialStartedAt, account.trialStartedAt);
  assert.equal(f.db.read('users/owner').trialExpiresAt, account.trialExpiresAt);
  assert.deepEqual(f.db.read('account_trial_usage/owner'), counter);
  if (valid) {
    const stored = f.db.read(`api_keys/${result.body.id}`); assert.equal(stored.linkedProductIds.length, count);
    assert.equal(Object.hasOwn(stored, 'key'), false); assert.ok(stored.credentialHash);
    assert.equal(JSON.stringify(stored).includes(result.body.key), false);
  }
});
test('duplicate IDs and partial variants count as unique products, never as extra products', async () => {
  const f = fixture({}, { 'api_keys/key-a': null }); await invoke(f.handlers.session);
  const tooFew = await invoke(f.keys.create, { body: { keyName: 'Duplicates', linkedProductIds: Array(50).fill('tool-0') } });
  assert.equal(tooFew.body.error, 'TRIAL_PRODUCT_MINIMUM');
  const partial = await invoke(f.keys.create, { body: { keyName: 'Partial', linkedProductIds: scope(49),
    linkedVariantSelections: { 'tool-49': ['a|b', 'c|d'] }, linkedProducts: [{ id: 'tool-0', name: 'forged' }] } });
  assert.equal(partial.statusCode, 200); assert.equal((await f.status()).body.productsIncluded, 50);
});
test('Trial second key is denied across UTC days and simultaneous first creation permits only one', async () => {
  const f = fixture({}, { 'api_keys/key-a': null }); await invoke(f.handlers.session);
  const options = { body: { keyName: 'Concurrent', linkedProductIds: scope(50) } };
  const results = await Promise.all(Array.from({ length: 8 }, () => invoke(f.keys.create, options)));
  assert.equal(results.filter(r => r.statusCode === 200).length, 1);
  assert.ok(results.filter(r => r.statusCode !== 200).every(r => r.body.error === 'TRIAL_KEY_LIMIT'));
  assert.equal((await f.status()).body.activeKeys, 1);
  f.time('2026-09-24T12:00:00.000Z'); assert.equal((await invoke(f.keys.create, options)).body.error, 'TRIAL_KEY_LIMIT');
  assert.equal((await f.status()).body.productsIncluded, 50);
});
test('atomic Trial replacement preserves products, expiry and history and invalidates the old credential', async () => {
  const f = fixture(); await invoke(f.handlers.session);
  const account = f.db.read('users/owner'), history = f.db.read('account_trial_usage/owner');
  const result = await invoke(f.keys.replace); assert.equal(result.statusCode, 200);
  assert.equal(f.db.read('api_keys/key-a').status, 'revoked'); assert.equal(f.db.read(`api_keys/${result.body.id}`).status, 'active');
  assert.deepEqual(f.db.read(`api_keys/${result.body.id}`).linkedProductIds, productIds);
  assert.equal((await f.status()).body.productsIncluded, 50); assert.equal((await f.status()).body.activeKeys, 1);
  assert.equal(f.db.read('users/owner').trialExpiresAt, account.trialExpiresAt); assert.deepEqual(f.db.read('account_trial_usage/owner'), history);
  await assert.rejects(f.consume(), { status: 401 });
  assert.equal((await consumeAccountQuota(f.db, { keyId: result.body.id, userId: 'owner', credential: result.body.key, clock: f.clock })).usage.productsIncluded, 50);
});
test('concurrent rotation or rotation/generation never leaves two active Trial keys', async () => {
  const f = fixture(); await invoke(f.handlers.session);
  const results = await Promise.all([invoke(f.keys.replace), invoke(f.keys.replace),
    invoke(f.keys.create, { body: { keyName: 'Second', linkedProductIds: scope(50) } })]);
  assert.equal(results.filter(r => r.statusCode === 200).length, 1); assert.equal((await f.status()).body.activeKeys, 1);
});
test('revocation preserves history and daily generation policy; a later replacement catalog cannot grant another Trial', async () => {
  const f = fixture({}, { 'api_keys/key-a': null }); await invoke(f.handlers.session);
  const options = { body: { keyName: 'First', linkedProductIds: scope(50) } };
  const first = await invoke(f.keys.create, options); const start = f.db.read('users/owner').trialStartedAt;
  assert.equal((await invoke(f.keys.revoke, { id: first.body.id })).statusCode, 200);
  assert.equal((await invoke(f.keys.create, options)).body.error, 'API_KEY_DAILY_GENERATION_LIMIT');
  f.time('2026-09-24T12:00:00.000Z'); assert.equal((await invoke(f.keys.create, options)).statusCode, 200);
  assert.equal((await f.status()).body.activeKeys, 1); assert.equal(f.db.read('users/owner').trialStartedAt, start);
});
test('Trial product limit is current count: 500 -> 499 -> 500 with a different product', async () => {
  const f = fixture({}, { 'api_keys/key-a': { ...key, linkedProductIds: scope(500) } }); await invoke(f.handlers.session);
  assert.equal((await updateCatalog(f, scope(499))).statusCode, 200);
  assert.equal((await f.status()).body.productsIncluded, 499);
  assert.equal((await updateCatalog(f, [...scope(499), 'tool-500'], 1)).statusCode, 200);
  assert.equal((await f.status()).body.productsIncluded, 500); assert.equal((await f.status()).body.active, true);
  assert.equal((await updateCatalog(f, [...scope(499), 'tool-500', 'tool-501'], 2)).statusCode, 400);
  assert.equal((await f.status()).body.productsIncluded, 500);
});
test('active catalog cannot drop 50 -> 49, while a 50-product substitution is allowed atomically', async () => {
  const f = fixture({}, { 'api_keys/key-a': { ...key, linkedProductIds: scope(50) } }); await invoke(f.handlers.session);
  assert.equal((await updateCatalog(f, scope(49))).body.error, 'TRIAL_PRODUCT_MINIMUM');
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, scope(50));
  assert.equal((await updateCatalog(f, scope(50, 1))).statusCode, 200); assert.equal((await f.status()).body.productsIncluded, 50);
});
test('concurrent additions at 499 cannot exceed 500 or silently overwrite a newer scope', async () => {
  const f = fixture({}, { 'api_keys/key-a': { ...key, linkedProductIds: scope(499) } }); await invoke(f.handlers.session);
  const results = await Promise.all([updateCatalog(f, [...scope(499), 'tool-499']), updateCatalog(f, [...scope(499), 'tool-500'])]);
  assert.equal(results.filter(r => r.statusCode === 200).length, 1);
  assert.equal(results.filter(r => r.body.error === 'CATALOG_CHANGED').length, 1);
  assert.equal((await f.status()).body.productsIncluded, 500); assert.ok(f.db.retries > 0);
});
test('stale/omitted scope version and revoked-key scope updates fail closed', async () => {
  const f = fixture(); await invoke(f.handlers.session);
  assert.equal((await invoke(f.keys.products, { body: { linkedProductIds: scope(50) } })).body.error, 'CATALOG_CHANGED');
  await invoke(f.keys.revoke); assert.equal((await updateCatalog(f, scope(50))).statusCode, 401);
});
test('legacy multiple-active-key Trial fails closed until extras are revoked, without deleting records', async () => {
  const f = fixture({}, { 'api_keys/key-b': { ...key, key: 'daas_trial_b' } }); await invoke(f.handlers.session);
  await assert.rejects(f.consume(), { status: 403, code: 'TRIAL_KEY_LIMIT' });
  assert.equal((await invoke(f.keys.replace)).body.error, 'TRIAL_KEY_LIMIT');
  await invoke(f.keys.revoke, { id: 'key-b' }); assert.equal((await f.consume()).usage.productsIncluded, 50);
  assert.equal(f.db.read('api_keys/key-b').status, 'revoked');
});
test('exact expiry blocks requests, generation, product edits and rotation but preserves key history', async () => {
  const f = fixture(); await invoke(f.handlers.session); f.time(new Date(Date.parse(END) - 1).toISOString());
  await f.consume(); f.time(END);
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  for (const result of [await invoke(f.keys.create, { body: { keyName: 'Expired', linkedProductIds: scope(50) } }),
    await updateCatalog(f, scope(50)), await invoke(f.keys.replace)]) assert.equal(result.body.error, 'UPGRADE_REQUIRED');
  assert.equal((await invoke(f.handlers.session)).body.initialized, false); assert.equal((await f.activate()).body.error, 'TRIAL_ALREADY_USED');
  assert.equal(f.db.read('api_keys/key-a').status, 'active'); assert.equal((await invoke(f.keys.list)).body.keys.length, 1);
});
test('product-edit retry crossing exact Trial expiry cannot publish an authorized new scope', async () => {
  const f = fixture(); await invoke(f.handlers.session); const run = f.db.runTransaction;
  let transactions = 0;
  f.db.runTransaction = callback => run(async tx => {
    if (++transactions === 2) f.time(END);
    return callback(tx);
  });
  assert.equal((await updateCatalog(f, scope(51))).body.error, 'UPGRADE_REQUIRED');
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, productIds);
});
test('Trial UX consistently uses product limits, one key and actual expiry rather than request allowance', () => {
  const files = ['dashboard/src/app/dashboard/products/page.tsx', 'dashboard/src/app/dashboard/api-keys/page.tsx',
    'dashboard/src/app/dashboard/free-trial/page.tsx', 'dashboard/src/app/dashboard/plan-billing/page.tsx',
    'dashboard/src/components/reports/CustomerUsageSummary.tsx', 'dashboard/src/config/plans.ts',
    'dashboard/src/app/docs/page.tsx', 'dashboard/src/components/auth/LoginModal.tsx', 'dashboard/src/app/privacy-policy/page.tsx'];
  for (const file of [...files, 'dashboard/src/app/dashboard/page.tsx']) assert.doesNotMatch(read(file), /500 total (?:API )?requests|500-request|50\/month|50 requests\/month|Pro Trial|Free plan · inactive|\/forever|trial total/);
  const overview = read(files[4]);
  for (const label of ['Products Included', 'Minimum Required', 'Products Available', 'API Keys', 'Trial Expires']) assert.ok(overview.includes(label));
  const products = read(files[0]); assert.match(products, /Save Trial Catalog/); assert.match(products, /expectedScopeVersion: trialKey.scopeVersion/);
  assert.match(products, /method: 'PATCH'/); assert.match(products, /cartSummary.totalProducts < 50/); assert.match(products, /Catalog full/);
  assert.match(products, /trialKey && activeTrial \?/); assert.doesNotMatch(read(files[2]), /onClick=\{activate\}|\/free-trial\/activate/);
  const plans = read(files[5]); assert.match(plans, /Minimum 50 products/); assert.match(plans, /Up to 500 products/); assert.match(plans, /One API key/);
  assert.match(plans, /₱1,499/); assert.match(plans, /₱4,999/); assert.match(plans, /MOST POPULAR/);
});
test('consumed legacy 500-request evidence cannot regain access through direct status/key/API paths', async () => {
  const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').update({ used: 500 });
  const before = f.db.read('users/owner'); assert.equal((await f.status()).body.upgradeRequired, true);
  assert.deepEqual(f.db.read('users/owner'), before); // Status remains read-only.
  await assert.rejects(f.consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(f.db.read('users/owner').trialConsumed, true);
  assert.equal((await invoke(f.keys.create, { body: { keyName: 'Bypass', linkedProductIds: scope(50) } })).body.error, 'UPGRADE_REQUIRED');
  assert.equal((await invoke(f.handlers.session)).body.initialized, false);
  assert.equal(f.db.read('users/owner').trialStartedAt, before.trialStartedAt);
  assert.equal(f.db.read('account_trial_usage/owner').used, 500);
});
test('failed product update or rotation cannot partially change scope, keys or Trial history', async () => {
  const f = fixture(); await invoke(f.handlers.session);
  const oldKey = f.db.read('api_keys/key-a'), account = f.db.read('users/owner'), history = f.db.read('account_trial_usage/owner');
  const run = f.db.runTransaction; let operations = 0;
  f.db.runTransaction = async callback => {
    if (++operations % 2 === 0) f.db.failCommit = true;
    try { return await run(callback); } finally { f.db.failCommit = false; }
  };
  assert.equal((await updateCatalog(f, scope(51))).statusCode, 503);
  assert.equal((await invoke(f.keys.replace)).statusCode, 503);
  assert.deepEqual(f.db.read('api_keys/key-a'), oldKey); assert.deepEqual(f.db.read('users/owner'), account);
  assert.deepEqual(f.db.read('account_trial_usage/owner'), history);
  assert.equal((await f.status()).body.activeKeys, 1);
});
for (const operation of ['create', 'products', 'replace']) test(`slow ${operation} cannot cross exact Trial expiry before writes`, async () => {
  const f = fixture({}, operation === 'create' ? { 'api_keys/key-a': null } : {}); await invoke(f.handlers.session);
  const run = f.db.runTransaction; let transactions = 0;
  f.db.runTransaction = callback => run(async tx => {
    const mutation = ++transactions === 2;
    return callback({ ...tx, get: async ref => {
      const result = await tx.get(ref);
      if (mutation && ref.path?.startsWith('products/')) f.time(END);
      return result;
    } });
  });
  const result = operation === 'create' ? await invoke(f.keys.create, { body: { keyName: 'Slow', linkedProductIds: scope(50) } })
    : operation === 'products' ? await updateCatalog(f, scope(51)) : await invoke(f.keys.replace);
  assert.equal(result.body.error, 'UPGRADE_REQUIRED');
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
  if (operation === 'create') assert.equal(f.db.read('api_keys/key-a'), null);
  else assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, productIds);
});
