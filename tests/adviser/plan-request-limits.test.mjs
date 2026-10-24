import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore, invoke } from './r2a/memory-firestore.mjs';
import { DEFAULT_REQUEST_LIMITS, requestLimitPolicy, requestPolicyVersion, newRequestContract } from '../../functions/request-limit-policy.mjs';
import { consumeAccountQuota } from '../../services/account-quota.js';
import { issueCredential } from '../../services/api-key-security.js';
import { createApiKeyHandlers } from '../../services/api-key-management.js';
import { createFreeTrialHandlers } from '../../services/free-trial.js';
import { createPaymentHandlers } from '../../services/payment-checkout.js';
import { fulfillPayment } from '../../services/payment-webhook.js';

const now = new Date('2026-10-14T12:00:00Z');
const account = (plan = 'Pro') => ({ uid: 'customer', role: 'Developer', businessSegment: 'Grocery', selectedSegment: 'Grocery',
  plan, apiRequestLimit: plan === 'Pro Max' ? null : 50, subscription_status: 'active',
  subscriptionStartedAt: plan === 'Free' ? null : '2026-10-01T00:00:00Z', subscriptionExpiresAt: plan === 'Free' ? null : '2026-11-01T00:00:00Z' });
function quotaFixture({ plan = 'Pro', limits = DEFAULT_REQUEST_LIMITS, used = 0, contracts, profileExtra = {}, trial = false } = {}) {
  let at = now;
  const keys = [issueCredential(), issueCredential()];
  const db = memoryFirestore({ 'users/customer': { ...account(plan), ...profileExtra }, 'system/settings': { planRequestLimits: limits },
    'account_api_usage/customer': { window: '2026-10-14', used },
    ...((contracts || plan !== 'Free') ? { 'account_request_contracts/customer': { version: 1,
      plans: contracts ?? { [plan === 'Pro Max' ? 'pro_max' : 'pro']: newRequestContract(plan === 'Pro Max' ? null : 500) } } } : {}),
    ...Object.fromEntries(keys.map((key, i) => [`api_keys/${key.id}`, { ...key.stored, userId: 'customer', status: trial && i ? 'revoked' : 'active', linkedProductIds: [] }])) });
  const consume = i => consumeAccountQuota(db, { keyId: keys[i || 0].id, userId: 'customer', credential: keys[i || 0].credential, clock: () => at });
  return { db, keys, consume, advance(value) { at = value; } };
}
test('accepted initial request defaults and permitted Unlimited policies are validated', () => {
  assert.deepEqual(requestLimitPolicy(), { free_trial: null, pro: 500, pro_max: null });
  for (const limit of [0, -1, 1.5, Infinity, NaN, '1000', null]) assert.throws(() => requestLimitPolicy({ planRequestLimits: { pro: limit } }));
  assert.deepEqual(requestLimitPolicy({ planRequestLimits: { free_trial: 100, pro: 1000, pro_max: 2000 } }), { free_trial: 100, pro: 1000, pro_max: 2000 });
});

test('malformed private promise state cannot be overwritten by Trial activation', async () => {
  for (const contracts of [{ version: 2, plans: {} }, { version: 1, plans: { pro: { version: 1, period: 'utc_daily', limit: 0 } } }]) {
    const db = memoryFirestore({ 'users/customer': { uid: 'customer', role: 'Developer', plan: 'Free', businessSegment: 'Grocery' },
      'account_request_contracts/customer': contracts });
    const trials = createFreeTrialHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => now });
    const result = await invoke(trials.session, { token: 'synthetic' }); assert.equal(result.statusCode, 503);
    assert.deepEqual(db.read('account_request_contracts/customer'), contracts);
    assert.equal(db.read('users/customer').trialStartedAt, undefined);
  }
});
test('Pro increase is enforced across keys; settings changes preserve consumed usage and UTC reset', async () => {
  const f = quotaFixture({ limits: { ...DEFAULT_REQUEST_LIMITS, pro: 1000 }, used: 999 });
  const outcomes = await Promise.allSettled([f.consume(0), f.consume(1)]);
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(value => value.status === 'rejected').reason.status, 429);
  assert.equal(f.db.read('account_api_usage/customer').used, 1000);
  f.db.seed('system/settings', { planRequestLimits: { ...DEFAULT_REQUEST_LIMITS, pro: 1200 } });
  assert.equal((await f.consume(1)).usage.used, 1001);
  f.advance(new Date('2026-10-15T00:00:00Z'));
  const tomorrow = await f.consume(0); assert.equal(tomorrow.usage.used, 1); assert.equal(tomorrow.usage.limit, 1200);
  assert.equal(tomorrow.usage.resetsAt, '2026-10-16T00:00:00.000Z');
});
test('existing Pro and Pro Max commitments cannot be silently reduced', async () => {
  const pro = quotaFixture({ limits: { ...DEFAULT_REQUEST_LIMITS, pro: 100 }, used: 100 });
  assert.equal((await pro.consume()).usage.limit, 500);
  const max = quotaFixture({ plan: 'Pro Max', limits: { ...DEFAULT_REQUEST_LIMITS, pro_max: 10 }, used: 1000 });
  assert.equal((await max.consume()).usage.limit, null); assert.equal(max.db.read('account_api_usage/customer').used, 1001);
});
test('new finite Pro Max contract is enforceable and Unlimited changes never reset counters', async () => {
  const f = quotaFixture({ plan: 'Pro Max', limits: { ...DEFAULT_REQUEST_LIMITS, pro_max: 10 }, contracts: { pro_max: newRequestContract(10) }, used: 9 });
  assert.equal((await f.consume()).usage.used, 10); await assert.rejects(f.consume(1), { status: 429 });
  f.db.seed('system/settings', { planRequestLimits: { ...DEFAULT_REQUEST_LIMITS, pro_max: null } });
  assert.equal((await f.consume(1)).usage.used, 11);
  f.db.seed('system/settings', { planRequestLimits: { ...DEFAULT_REQUEST_LIMITS, pro_max: 10 } });
  await assert.rejects(f.consume(), { status: 429 }); assert.equal(f.db.read('account_api_usage/customer').used, 11);
});
test('new lower Pro contracts use their agreed allowance, and customer profile quota claims are ignored', async () => {
  const f = quotaFixture({ limits: { ...DEFAULT_REQUEST_LIMITS, pro: 100 }, contracts: { pro: newRequestContract(100) }, used: 99,
    profileExtra: { requestAllowanceContracts: { pro: newRequestContract(null) }, planRequestLimits: { pro: null } } });
  assert.equal((await f.consume()).usage.limit, 100); await assert.rejects(f.consume(1), { status: 429 });
});
test('invalid configuration fails closed without quota use, while credential revocation remains available', async () => {
  const f = quotaFixture(); f.db.seed('system/settings', { planRequestLimits: { pro: 'invalid' } });
  await assert.rejects(f.consume(), { code: 'PLAN_REQUEST_LIMITS_UNAVAILABLE' }); assert.equal(f.db.read('account_api_usage/customer').used, 0);
  const keys = createApiKeyHandlers({ getDb: () => f.db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => now });
  assert.equal((await invoke(keys.revoke, { token: 'synthetic', params: { id: f.keys[0].id } })).statusCode, 200);
  assert.equal(f.db.read(`api_keys/${f.keys[0].id}`).status, 'revoked');
});
test('finite Trial captures a server promise and preserves seven days, 50 products, five keys, and daily admission', async () => {
  const f = quotaFixture({ plan: 'Free', limits: { ...DEFAULT_REQUEST_LIMITS, free_trial: 2 }, trial: true });
  const trials = createFreeTrialHandlers({ getDb: () => f.db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => now });
  const initialized = await invoke(trials.session, { token: 'synthetic' }); assert.equal(initialized.statusCode, 200);
  assert.equal(f.db.read('users/customer').trialExpiresAt, '2026-10-21T12:00:00.000Z');
  assert.equal(f.db.read('account_request_contracts/customer').plans.free_trial.limit, 2);
  const status = await invoke(trials.status, { token: 'synthetic' }); assert.equal(status.body.maximumProducts, 50); assert.equal(status.body.maximumActiveKeys, 5);
  assert.equal((await f.consume()).usage.used, 1); assert.equal((await f.consume()).usage.used, 2);
  await assert.rejects(f.consume(), { status: 429 }); assert.equal(f.db.read('users/customer').trialConsumed, false);
  f.advance(new Date('2026-10-15T00:00:00Z')); assert.equal((await f.consume()).usage.used, 1);
  assert.equal(f.db.read('users/customer').trialExpiresAt, '2026-10-21T12:00:00.000Z');
});
test('existing Unlimited Trial cannot become finite and historical request evidence is retained', async () => {
  const f = quotaFixture({ plan: 'Free', limits: { ...DEFAULT_REQUEST_LIMITS, free_trial: 1 }, trial: true,
    profileExtra: { trialVersion: 1, hasUsedFreeTrial: true, trialConsumed: false,
      trialStartedAt: '2026-10-13T12:00:00Z', trialExpiresAt: '2026-10-20T12:00:00Z' } });
  f.db.seed('account_trial_usage/customer', { startedAt: '2026-10-13T12:00:00.000Z', expiresAt: '2026-10-20T12:00:00.000Z', used: 123 });
  assert.equal((await f.consume()).usage.limit, null); assert.equal(f.db.read('account_trial_usage/customer').used, 123);
});
test('API-key metadata uses the same effective policy without credential recreation', async () => {
  const f = quotaFixture({ limits: { ...DEFAULT_REQUEST_LIMITS, pro: 1000 }, used: 100 });
  const keys = createApiKeyHandlers({ getDb: () => f.db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => now });
  const listed = await invoke(keys.list, { token: 'synthetic' }); assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.usage.limit, 1000); assert.equal(listed.body.usage.used, 100);
  assert.ok(listed.body.keys.every(key => key.requestLimit === 1000)); assert.equal(f.db.read('account_api_usage/customer').used, 100);
});

test('missing finite Trial counter is unavailable in metadata and cannot admit or reset requests', async () => {
  const credential = issueCredential(), db = memoryFirestore({ 'users/customer': { ...account('Free'), hasUsedFreeTrial: true,
    trialVersion: 1, trialConsumed: false, trialStartedAt: '2026-10-13T12:00:00Z', trialExpiresAt: '2026-10-20T12:00:00Z' },
    'account_request_contracts/customer': { version: 1, plans: { free_trial: newRequestContract(10) } },
    'system/settings': { planRequestLimits: { ...DEFAULT_REQUEST_LIMITS, free_trial: 10 } },
    [`api_keys/${credential.id}`]: { ...credential.stored, userId: 'customer', status: 'active', linkedProductIds: [] } });
  const keys = createApiKeyHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => now });
  const listed = await invoke(keys.list, { token: 'synthetic' }); assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.usage.used, null); assert.equal(listed.body.usage.state, 'unavailable');
  await assert.rejects(consumeAccountQuota(db, { keyId: credential.id, userId: 'customer', credential: credential.credential, clock: () => now }), { code: 'USAGE_UNAVAILABLE' });
  assert.equal(db.read('account_api_usage/customer'), undefined);
});

const orderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function paymentFixture(limits, initialAccount = { ...account('Free'), subscriptionStartedAt: null, subscriptionExpiresAt: null }) {
  const db = memoryFirestore({ 'users/customer': initialAccount, 'system/settings': { planRequestLimits: limits },
    ...(initialAccount.plan !== 'Free' ? { 'account_request_contracts/customer': { version: 1,
      plans: { [initialAccount.plan === 'Pro Max' ? 'pro_max' : 'pro']: newRequestContract(initialAccount.plan === 'Pro Max' ? null : 500) } } } : {}) });
  let providerCalls = 0;
  const handlers = createPaymentHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => now,
    newOrderId: () => orderId, getConfig: () => ({ mode: 'test', secretKey: 'sk_test_synthetic', webhookSecret: 'synthetic', dashboardUrl: 'https://customer.invalid' }),
    createSession: async () => { providerCalls++; return { sessionId: 'cs_synthetic', paymentIntentId: 'pi_synthetic', checkoutUrl: 'https://checkout.paymongo.com/test' }; } });
  const checkout = (plan, version = requestPolicyVersion(limits)) => invoke(handlers.checkout, { token: 'synthetic', body: { plan, requestPolicyVersion: version } });
  const fulfill = amount => fulfillPayment(db, { mode: 'test', eventId: 'evt_synthetic', sessionId: 'cs_synthetic', paymentIntentId: 'pi_synthetic',
    paymentId: 'pay_synthetic', amount, currency: 'PHP' }, now);
  return { db, handlers, checkout, fulfill, providerCalls: () => providerCalls };
}
test('checkout captures accepted request terms; stale or forged terms cannot initiate provider work', async () => {
  const limits = { ...DEFAULT_REQUEST_LIMITS, pro: 1000 }, f = paymentFixture(limits);
  assert.equal((await f.checkout('pro', requestPolicyVersion(DEFAULT_REQUEST_LIMITS))).statusCode, 409); assert.equal(f.providerCalls(), 0);
  assert.equal((await invoke(f.handlers.checkout, { token: 'synthetic', body: { plan: 'pro', requestAllowance: { limit: null } } })).statusCode, 400);
  assert.equal((await f.checkout('pro')).statusCode, 200);
  const order = f.db.read(`payment_orders/${orderId}`); assert.equal(order.amount, 50000); assert.equal(order.durationDays, 30);
  assert.equal(order.requestAllowance.limit, 1000);
});
test('already-paid fulfillment honors frozen request promise despite later configuration failure and duplicates', async () => {
  const f = paymentFixture({ ...DEFAULT_REQUEST_LIMITS, pro: 1000 }); await f.checkout('pro');
  f.db.seed('system/settings', { maintenanceMode: true, planRequestLimits: { pro: 'unavailable' } });
  assert.deepEqual(await f.fulfill(50000), { duplicate: false });
  assert.equal(f.db.read('account_request_contracts/customer').plans.pro.limit, 1000);
  assert.equal(f.db.read('users/customer').subscriptionExpiresAt, '2026-11-13T12:00:00.000Z');
  assert.deepEqual(await f.fulfill(50000), { duplicate: true });
});
test('finite Pro Max purchases preserve price and capture finite terms for new customers', async () => {
  const f = paymentFixture({ ...DEFAULT_REQUEST_LIMITS, pro_max: 1000 }); assert.equal((await f.checkout('pro_max')).statusCode, 200);
  assert.equal(f.db.read(`payment_orders/${orderId}`).amount, 130000); await f.fulfill(130000);
  assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.limit, 1000);
  assert.equal(f.db.read('users/customer').apiRequestLimit, null);
});
test('existing paid renewal quotes preserve same-plan promises without merging Pro into Max', async () => {
  const max = paymentFixture({ ...DEFAULT_REQUEST_LIMITS, pro_max: 100 }, account('Pro Max'));
  const quote = await invoke(max.handlers.status, { token: 'synthetic' }); assert.equal(quote.body.purchaseRequestLimits.pro_max, null);
  await max.checkout('pro_max'); await max.fulfill(130000); assert.equal(max.db.read('account_request_contracts/customer').plans.pro_max.limit, null);
  const pro = paymentFixture({ ...DEFAULT_REQUEST_LIMITS, pro: 100, pro_max: 100 }, account('Pro'));
  const upgrade = await invoke(pro.handlers.status, { token: 'synthetic' }); assert.equal(upgrade.body.purchaseRequestLimits.pro, 500);
  assert.equal(upgrade.body.purchaseRequestLimits.pro_max, 100); assert.equal((await pro.checkout('pro_max')).statusCode, 200);
  assert.equal(pro.db.read(`payment_orders/${orderId}`).requestAllowance.limit, 100);
});
