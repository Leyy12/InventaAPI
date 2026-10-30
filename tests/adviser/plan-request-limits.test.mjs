import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore, invoke } from './r2a/memory-store.mjs';
import { DEFAULT_REQUEST_LIMITS, requestLimitPolicy, requestPolicyVersion, newRequestContract } from '../../functions/request-limit-policy.mjs';
import { consumeAccountQuota } from '../../services/account-quota.js';
import { chargeMonthlyBuckets } from '../../services/paid-monthly-quota.js';
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
  const db = memoryStore({ 'users/customer': { ...account(plan), ...profileExtra }, 'system/settings': { planRequestLimits: limits },
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
    const db = memoryStore({ 'users/customer': { uid: 'customer', role: 'Developer', plan: 'Free', businessSegment: 'Grocery' },
      'account_request_contracts/customer': contracts });
    const trials = createFreeTrialHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => now });
    const result = await invoke(trials.session, { token: 'synthetic' }); assert.equal(result.statusCode, 503);
    assert.deepEqual(db.read('account_request_contracts/customer'), contracts);
    assert.equal(db.read('users/customer').trialStartedAt, undefined);
  }
});
// Active Pro and Pro Max count PRODUCTS DELIVERED per UTC month (15,000). Daily
// settings, stored daily contracts and profile claims do not change that allowance.
// One catalog charge: a number goes to Pro's account allowance; Pro Max passes { Segment: n }.
const charge = async (f, admitted, requested, at = now) => {
  const map = typeof requested === 'number' ? { account: requested } : requested;
  const result = await chargeMonthlyBuckets(f.db, { ...admitted.productCharge, requested: map, clock: () => at });
  const [only] = Object.keys(map);
  return { granted: Object.values(result.granted).reduce((a, b) => a + b, 0), usage: result.usage[only], all: result };
};
test('Pro keys share one monthly product allowance; daily settings and contracts do not change it', async () => {
  const f = quotaFixture({ limits: { ...DEFAULT_REQUEST_LIMITS, pro: 1000 }, used: 999, contracts: { pro: newRequestContract(100) },
    profileExtra: { requestAllowanceContracts: { pro: newRequestContract(null) }, planRequestLimits: { pro: null } } });
  f.db.seed('account_paid_monthly_usage/customer_2026-10_account', { window: '2026-10', used: 14950 });
  // Two keys admitted together each ask for a 50-product page; only 50 products are left.
  const [a, b] = await Promise.all([f.consume(0), f.consume(1)]);
  assert.deepEqual([a.usage.used, a.usage.unit], [14950, 'products']);
  const granted = await Promise.all([charge(f, a, 50), charge(f, b, 50)]);
  assert.equal(granted.reduce((sum, g) => sum + g.granted, 0), 50, 'never more than what is left');
  assert.equal(f.db.read('account_paid_monthly_usage/customer_2026-10_account').used, 15000);
  await assert.rejects(f.consume(0), error => error.status === 429 && /15,000 products/.test(error.message));
  assert.equal(f.db.read('account_api_usage/customer').used, 999, 'the daily counter is not used for paid plans');
  f.advance(new Date('2026-11-01T00:00:00Z'));
  f.db.seed('users/customer', { ...account('Pro'), subscriptionExpiresAt: '2026-12-01T00:00:00Z' });
  const next = await f.consume(0); assert.equal(next.usage.used, 0); assert.equal(next.usage.limit, 15000);
  assert.equal(next.usage.resetsAt, '2026-12-01T00:00:00.000Z');
  assert.equal((await charge(f, next, 7, new Date('2026-11-01T00:00:00Z'))).usage.used, 7);
});
test('a page larger than what is left is cut to the remaining products', async () => {
  const f = quotaFixture();
  f.db.seed('account_paid_monthly_usage/customer_2026-10_account', { window: '2026-10', used: 14990 });
  const admitted = await f.consume(0);
  const result = await charge(f, admitted, 50);
  assert.deepEqual([result.granted, result.usage.used, result.usage.remaining], [10, 15000, 0]);
  assert.equal((await charge(f, admitted, 5)).granted, 0);
  assert.equal((await charge(f, admitted, 0)).granted, 0);
});
test('Pro Max: one key, each variant charged to its product segment; refused only when every segment is used up', async () => {
  const f = quotaFixture({ plan: 'Pro Max', limits: { ...DEFAULT_REQUEST_LIMITS, pro_max: 10 }, contracts: { pro_max: newRequestContract(10) }, used: 9 });
  f.db.seed('account_paid_monthly_usage/customer_2026-10_Grocery', { window: '2026-10', used: 15000 });
  const admitted = await f.consume(0);
  assert.deepEqual(admitted.usage.buckets.map(b => [b.bucket, b.remaining]), [['Grocery', 0], ['Pharmacy', 15000], ['Hardware', 15000]]);
  const result = await charge(f, admitted, { Grocery: 2, Pharmacy: 3 });
  assert.deepEqual(result.all.granted, { Grocery: 0, Pharmacy: 3 });
  assert.equal(result.all.usage.Pharmacy.scope, 'segment');
  for (const segment of ['Pharmacy', 'Hardware']) f.db.seed(`account_paid_monthly_usage/customer_2026-10_${segment}`, { window: '2026-10', used: 15000 });
  await assert.rejects(f.consume(0), { status: 429 });
  assert.equal(f.db.read('account_api_usage/customer').used, 9);
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
  // Paid keys show the monthly allowance they draw from.
  f.db.seed('account_paid_monthly_usage/customer_2026-10_account', { window: '2026-10', used: 42 });
  const monthly = await invoke(keys.list, { token: 'synthetic' });
  assert.deepEqual(monthly.body.monthlyUsage.buckets, [{ bucket: 'account', used: 42, remaining: 14958 }]);
  assert.ok(monthly.body.keys.every(key => key.requestLimit === 15000 && key.requestsUsed === 42 && key.quotaPeriod === 'monthly'));
  assert.equal(monthly.body.monthlyUsage.resetsAt, '2026-11-01T00:00:00.000Z');
  assert.equal(f.db.read('account_api_usage/customer').used, 100);
});

test('missing finite Trial counter is unavailable in metadata and cannot admit or reset requests', async () => {
  const credential = issueCredential(), db = memoryStore({ 'users/customer': { ...account('Free'), hasUsedFreeTrial: true,
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
  const db = memoryStore({ 'users/customer': initialAccount, 'system/settings': { planRequestLimits: limits },
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
