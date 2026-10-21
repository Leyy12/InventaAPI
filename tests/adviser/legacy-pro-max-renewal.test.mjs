import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { memoryFirestore, invoke } from './r2a/memory-firestore.mjs';
import { createApiKeyHandlers } from '../../services/api-key-management.js';
import { createPaymentHandlers } from '../../services/payment-checkout.js';
import { fulfillPayment } from '../../services/payment-webhook.js';
import * as lifecycle from '../../functions/subscription-lifecycle.mjs';
import * as policy from '../../functions/request-limit-policy.mjs';
import { consumeAccountQuota } from '../../services/account-quota.js';
import { issueCredential } from '../../services/api-key-security.js';
import { createFreeTrialHandlers } from '../../services/free-trial.js';
import { hooks, load, flush, nodes } from './workspace-refresh/harness.mjs';
import * as limits from '../../functions/entitlement-limits.mjs';

const BASE = '6cf96f589cf37fffc624862a2381ec6443365c31';
const NOW = new Date('2026-10-14T12:00:00Z'), END = '2026-10-01T00:00:00.000Z';
const OLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', NEXT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const configured = { free_trial: null, pro: 500, pro_max: 10 };
const legacy = { uid: 'customer', role: 'Developer', plan: 'Pro Max', apiRequestLimit: null, subscription_status: 'active',
  businessSegment: 'Grocery', selectedSegment: 'Grocery', subscriptionStartedAt: '2026-09-01T00:00:00.000Z', subscriptionExpiresAt: END };
const normalized = { ...legacy, ...lifecycle.FREE_ENTITLEMENT };
const fresh = { uid: 'customer', role: 'Developer', plan: 'Free', apiRequestLimit: 50, subscription_status: 'inactive', businessSegment: 'Grocery' };
const proof = (allowance = null, account = legacy, plan = 'pro_max') => ({
  [`payment_orders/${OLD}`]: { id: OLD, userId: 'customer', planId: plan, plan: plan === 'pro_max' ? 'Pro Max' : 'Pro', apiRequestLimit: plan === 'pro_max' ? null : 500,
    amount: plan === 'pro_max' ? 499900 : 149900, currency: 'PHP', durationDays: 30, mode: 'test', state: 'processed',
    paymentId: 'pay_old', sessionId: 'cs_old', subscriptionPeriodEnd: account.subscriptionExpiresAt,
    requestAllowance: { planId: plan, limit: allowance, period: 'utc_daily', policyVersion: policy.requestPolicyVersion({ ...configured, [plan]: allowance }) } },
  'transactions/paymongo_test_pay_old': { orderId: OLD, userId: 'customer', mode: 'test', paymentId: 'pay_old', sessionId: 'cs_old',
    plan: plan === 'pro_max' ? 'Pro Max' : 'Pro', status: 'paid', entitlementGranted: true, amount: plan === 'pro_max' ? 499900 : 149900, currency: 'PHP',
    subscriptionPeriodStart: new Date(Date.parse(account.subscriptionExpiresAt) - 30 * 86400000).toISOString(), subscriptionPeriodEnd: account.subscriptionExpiresAt },
});
function fixture({ account = legacy, extra, used = 237, implementation = { createApiKeyHandlers, createPaymentHandlers, fulfillPayment }, at = NOW, limits = configured } = {}) {
  let now = at, calls = 0;
  const key = issueCredential();
  const db = memoryFirestore({ 'users/customer': account, 'system/settings': { planRequestLimits: limits },
    'account_api_usage/customer': { window: '2026-10-14', used },
    [`api_keys/${key.id}`]: { ...key.stored, userId: 'customer', status: 'active', linkedProductIds: [] },
    ...(extra ?? (account.plan === 'Pro Max' ? proof(null, account) : account.plan === 'Pro' ? proof(500, account, 'pro') : {})) });
  const verifyIdToken = async (_token, revoked) => { assert.equal(revoked, true); return { uid: 'customer' }; };
  const keys = implementation.createApiKeyHandlers({ getDb: () => db, verifyIdToken, clock: () => now });
  const payments = implementation.createPaymentHandlers({ getDb: () => db, verifyIdToken, clock: () => now, newOrderId: () => NEXT,
    getConfig: () => ({ mode: 'test', secretKey: 'sk_test_synthetic', webhookSecret: 'synthetic', dashboardUrl: 'https://customer.invalid' }),
    createSession: async () => { calls++; return { sessionId: 'cs_new', paymentIntentId: 'pi_new', checkoutUrl: 'https://checkout.paymongo.com/test' }; } });
  const status = () => invoke(payments.status, { token: 'synthetic' });
  const checkout = (version = policy.requestPolicyVersion(limits), more = {}) => invoke(payments.checkout,
    { token: 'synthetic', body: { plan: 'pro_max', requestPolicyVersion: version, ...more } });
  const fulfill = () => implementation.fulfillPayment(db, { mode: 'test', eventId: 'evt_new', sessionId: 'cs_new',
    paymentIntentId: 'pi_new', paymentId: 'pay_new', amount: 499900, currency: 'PHP' }, now);
  const consume = () => (implementation.consumeAccountQuota ?? consumeAccountQuota)(db, { keyId: key.id, userId: 'customer', credential: key.credential, clock: () => now });
  return { db, keys, payments, status, checkout, fulfill, consume, limits, key, providerCalls: () => calls,
    time: value => { now = value; }, effective: () => lifecycle.evaluateEntitlement(db.read('users/customer'), now, limits, db.read('account_request_contracts/customer')) };
}
const snapshots = new Map();
async function original(path) {
  if (snapshots.has(path)) return snapshots.get(path);
  const root = new URL('../../', import.meta.url), file = new URL(path, root);
  let source = execFileSync('git', ['show', `${BASE}:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true });
  for (const match of [...source.matchAll(/from (['"])(\.[^'"]+)\1/g)]) {
    const target = new URL(match[2], file), relative = fileURLToPath(target).slice(fileURLToPath(root).length).replaceAll('\\', '/');
    const pinned = ['functions/request-contract-evidence.mjs', 'functions/request-limit-policy.mjs', 'functions/subscription-lifecycle.mjs'].includes(relative);
    if (pinned) await original(relative);
    source = source.replace(match[0], `from ${match[1]}${pinned ? snapshots.get(relative).url : target.href}${match[1]}`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const module = await import(url); snapshots.set(path, { url, module }); return { url, module };
}

test('P1-A comparison: previous partial Pro promise skips verified Max history; fixed recovery protects Max through renewal', async () => {
  const baseline = { ...(await original('services/api-key-management.js')).module, ...(await original('services/payment-checkout.js')).module,
    ...(await original('services/payment-webhook.js')).module, ...(await original('services/account-quota.js')).module };
  for (const [implementation, expected] of [[baseline, 10], [undefined, null]]) {
    const f = fixture({ implementation, account: normalized, extra: { ...proof(),
      'account_request_contracts/customer': { version: 1, plans: { pro: policy.newRequestContract(500) } } } });
    const offer = await f.status(); assert.equal(offer.body.purchaseRequestLimits.pro_max, expected);
    assert.equal((await invoke(f.keys.list)).statusCode, 200); assert.equal(f.db.read('users/customer').plan, 'Free');
    await assert.rejects(f.consume(), error => error.status === 403);
    assert.equal((await f.checkout(offer.body.requestPolicyVersion)).statusCode, 200);
    const order = f.db.read(`payment_orders/${NEXT}`); assert.equal(order.requestAllowance.limit, expected);
    assert.equal(order.amount, 499900); assert.equal(order.durationDays, 30);
    await f.fulfill(); assert.equal(f.effective().limit, expected); assert.equal(f.db.read('account_api_usage/customer').used, 237);
    assert.equal(f.db.read('users/customer').subscriptionExpiresAt, '2026-11-13T12:00:00.000Z');
  }
});

function history(plan, limit, end, id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', payment = 'pay_pro') {
  const records = proof(limit, { ...legacy, subscriptionExpiresAt: end }, plan);
  const order = records[`payment_orders/${OLD}`], receipt = records['transactions/paymongo_test_pay_old'];
  Object.assign(order, { id, paymentId: payment, sessionId: `cs_${payment.slice(4)}` });
  Object.assign(receipt, { orderId: id, paymentId: payment, sessionId: order.sessionId });
  return { [`payment_orders/${id}`]: order, [`transactions/paymongo_test_${payment}`]: receipt };
}

test('P1-B comparison: previous unrelated older Pro receipt accepts a finite Max renewal; fixed candidate requires reconciliation', async () => {
  const baseline = { createApiKeyHandlers, fulfillPayment, ...(await original('services/payment-checkout.js')).module };
  for (const [implementation, expected] of [[baseline, 200], [undefined, 503]]) {
    const f = fixture({ implementation, account: normalized, extra: history('pro', 500, '2026-09-01T00:00:00.000Z') });
    const before = f.db.dump(), status = await f.status(); assert.equal(status.statusCode, expected);
    assert.equal((await f.checkout()).statusCode, expected);
    if (expected === 200) { assert.equal(status.body.purchaseRequestLimits.pro_max, 10); assert.equal(f.providerCalls(), 1); }
    else { assert.equal(status.body.code, 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE'); assert.equal(f.providerCalls(), 0); assert.deepEqual(f.db.dump(), before); }
  }
});

test('both missing promises recover independently; an older Max commitment survives a newer Pro payment', async () => {
  for (const currentPlan of ['Free', 'Pro']) {
    const account = { ...normalized, plan: currentPlan, apiRequestLimit: currentPlan === 'Pro' ? 500 : 50 };
    const f = fixture({ account, extra: { ...history('pro_max', null, '2026-09-01T00:00:00.000Z'),
      ...history('pro', 750, END, OLD, 'pay_latest') } });
    const response = await f.status(); assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.purchaseRequestLimits, { pro: 750, pro_max: null }); assert.equal(f.db.commits, 0);
    assert.equal((await f.checkout()).statusCode, 200);
    const plans = f.db.read('account_request_contracts/customer').plans;
    assert.equal(plans.pro.limit, 750); assert.equal(plans.pro_max.limit, null);
  }
});

test('invalid missing-plan history preserves unrelated authoritative Pro evidence without partial writes', async () => {
  const extra = proof(); delete extra[`payment_orders/${OLD}`].requestAllowance;
  extra['account_request_contracts/customer'] = { version: 1, plans: { pro: policy.newRequestContract(750) } };
  const f = fixture({ account: normalized, extra }), before = f.db.dump();
  assert.equal((await f.status()).statusCode, 503); assert.equal((await f.checkout()).statusCode, 503);
  assert.deepEqual(f.db.dump(), before); assert.equal(f.providerCalls(), 0);
});

test('existing authoritative Max promise is not replaced by historical finite terms', async () => {
  const saved = { ...policy.newRequestContract(null), origin: 'verified_private' };
  const f = fixture({ account: normalized, extra: { ...proof(10),
    'account_request_contracts/customer': { version: 1, plans: { pro_max: saved } } } });
  assert.equal((await f.status()).body.purchaseRequestLimits.pro_max, null);
  assert.equal((await f.checkout()).statusCode, 200);
  assert.deepEqual(f.db.read('account_request_contracts/customer').plans.pro_max, saved);
});

test('a paid Max label without accepted terms fails status, normalization and incoming fulfillment', async () => {
  const extra = proof(); delete extra[`payment_orders/${OLD}`].requestAllowance;
  const f = fixture({ extra }), before = f.db.dump();
  assert.equal((await f.status()).statusCode, 503); assert.equal((await invoke(f.keys.list)).statusCode, 503);
  await assert.rejects(f.consume(), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' });
  await assert.rejects(lifecycle.normalizeExpiredAccount(f.db, 'customer', () => NOW), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' });
  assert.deepEqual(f.db.dump(), before);
  const pending = fixture({ account: fresh }); await pending.checkout();
  const order = pending.db.read(`payment_orders/${NEXT}`); delete order.requestAllowance; pending.db.seed(`payment_orders/${NEXT}`, order);
  const paidBefore = pending.db.dump(); await assert.rejects(pending.fulfill(), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' });
  assert.deepEqual(pending.db.dump(), paidBefore);
});

test('Pro-only applicable history establishes Pro, never a Max promise or cross-plan floor', async () => {
  const f = fixture({ account: normalized, extra: history('pro', 750, END) });
  const response = await f.status(); assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.purchaseRequestLimits, { pro: 750, pro_max: 10 });
  assert.equal((await f.checkout()).statusCode, 200);
  assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max, undefined);
  assert.equal(f.db.read(`payment_orders/${NEXT}`).requestAllowance.limit, 10);
  await f.fulfill(); assert.equal(f.effective().limit, 10);
  assert.equal(f.db.read('account_request_contracts/customer').plans.pro.limit, 750);
});

for (const defect of ['conflicting-period', 'later-reduction', 'receipt-terms', 'order-period', 'period-duration', 'period-future', 'order-owner', 'order-binding', 'canceled', 'failed', 'unverified']) {
  test(`historical ${defect} requires reconciliation and preserves trustworthy private evidence`, async () => {
    const extra = proof(), order = extra[`payment_orders/${OLD}`], receipt = extra['transactions/paymongo_test_pay_old'];
    if (defect === 'conflicting-period') Object.assign(extra, history('pro_max', 10, END));
    if (defect === 'later-reduction') { order.requestAllowance.limit = 10; Object.assign(extra, history('pro_max', null, '2026-09-01T00:00:00.000Z')); }
    if (defect === 'receipt-terms') receipt.requestAllowance = { ...order.requestAllowance, limit: 10 };
    if (defect === 'order-period') order.subscriptionPeriodEnd = '2026-09-01T00:00:00.000Z';
    if (defect === 'period-duration') receipt.subscriptionPeriodStart = '2026-09-15T00:00:00.000Z';
    if (defect === 'period-future') { order.subscriptionPeriodEnd = '2026-11-01T00:00:00.000Z'; receipt.subscriptionPeriodEnd = order.subscriptionPeriodEnd; receipt.subscriptionPeriodStart = '2026-10-02T00:00:00.000Z'; }
    if (defect === 'order-owner') order.userId = 'other';
    if (defect === 'order-binding') receipt.orderId = NEXT;
    if (['canceled', 'failed'].includes(defect)) order.state = defect;
    if (defect === 'unverified') delete receipt.entitlementGranted;
    extra['account_request_contracts/customer'] = { version: 1, plans: { pro: policy.newRequestContract(500) } };
    const f = fixture({ account: normalized, extra }), before = f.db.dump();
    assert.equal((await f.status()).statusCode, 503); assert.equal((await f.checkout()).statusCode, 503);
    assert.equal(f.providerCalls(), 0); assert.deepEqual(f.db.dump(), before);
  });
}

test('complete 100-record recovery succeeds; 101 records never suppress missing Max behind a Pro promise', async () => {
  for (const count of [99, 100]) {
    const extra = { ...proof(), 'account_request_contracts/customer': { version: 1, plans: { pro: policy.newRequestContract(500) } },
      ...Object.fromEntries(Array.from({ length: count }, (_, i) => [`payment_orders/pending-${i}`, { userId: 'customer', state: 'pending' }])) };
    const f = fixture({ account: normalized, extra }), before = f.db.dump();
    assert.equal((await f.checkout()).statusCode, count === 99 ? 200 : 503);
    if (count === 100) { assert.deepEqual(f.db.dump(), before); assert.equal(f.providerCalls(), 0); }
    else assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.limit, null);
  }
});

test('normalization preserves independently recovered older Max even when current Pro already has a private promise', async () => {
  for (const normalize of ['scheduler', 'key-list', 'quota']) {
    const account = { ...legacy, plan: 'Pro', apiRequestLimit: 500 };
    const extra = { ...history('pro_max', null, '2026-09-01T00:00:00.000Z'), ...history('pro', 500, END, OLD, 'pay_latest'),
      'account_request_contracts/customer': { version: 1, plans: { pro: policy.newRequestContract(500) } } };
    const f = fixture({ account, extra });
    if (normalize === 'scheduler') assert.equal(await lifecycle.normalizeExpiredAccount(f.db, 'customer', () => NOW), true);
    if (normalize === 'key-list') assert.equal((await invoke(f.keys.list)).statusCode, 200);
    if (normalize === 'quota') await assert.rejects(f.consume(), { status: 403 });
    assert.equal(f.db.read('users/customer').plan, 'Free');
    assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.limit, null);
    assert.equal((await f.status()).body.purchaseRequestLimits.pro_max, null);
    assert.equal(f.db.read('account_api_usage/customer').used, 237);
  }
});

test('a complete bounded scan retains its applicable private evidence across normalization without inventing another plan', async () => {
  const f = fixture({ account: { ...legacy, plan: 'Pro', apiRequestLimit: 500 }, extra: {
    'account_request_contracts/customer': { version: 1, plans: { pro: policy.newRequestContract(500) } },
  } });
  assert.equal(await lifecycle.normalizeExpiredAccount(f.db, 'customer', () => NOW), true);
  const contracts = f.db.read('account_request_contracts/customer');
  assert.equal(contracts.historyVerifiedThrough, END); assert.equal(contracts.plans.pro_max, undefined);
  assert.equal((await f.status()).body.purchaseRequestLimits.pro_max, 10);
  assert.equal(await lifecycle.normalizeExpiredAccount(f.db, 'customer', () => NOW), false);
  assert.deepEqual(f.db.read('account_request_contracts/customer'), contracts);
});

test('a completeness marker never bypasses missing terms, stale paid periods or the recovery bound', async () => {
  for (const defect of ['missing-terms', 'stale-period', 'bound']) {
    const extra = defect === 'missing-terms' ? proof() : {};
    if (defect === 'missing-terms') delete extra[`payment_orders/${OLD}`].requestAllowance;
    if (defect === 'bound') Object.assign(extra, Object.fromEntries(Array.from({ length: 101 }, (_, i) =>
      [`payment_orders/history-${i}`, { userId: 'customer', state: 'pending' }])));
    extra['account_request_contracts/customer'] = { version: 1, plans: { pro: policy.newRequestContract(500) },
      historyVerifiedThrough: defect === 'stale-period' ? '2026-09-01T00:00:00.000Z' : END };
    const f = fixture({ account: normalized, extra }), before = f.db.dump();
    assert.equal((await f.checkout()).statusCode, 503); assert.equal(f.providerCalls(), 0); assert.deepEqual(f.db.dump(), before);
  }
});

test('authenticated UID cannot consume or renew another profile even with valid private terms', async () => {
  const f = fixture({ account: { ...legacy, uid: 'other' }, extra: {
    'account_request_contracts/customer': { version: 1, plans: { pro: policy.newRequestContract(500), pro_max: policy.newRequestContract(null) } },
  } }), before = f.db.dump();
  assert.equal((await f.status()).statusCode, 403);
  assert.equal((await f.checkout()).statusCode, 403);
  await assert.rejects(f.consume(), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' });
  assert.equal(f.providerCalls(), 0); assert.deepEqual(f.db.dump(), before);
});

test('receipt changes during recovery force transaction revalidation before any promise or checkout is committed', async () => {
  const saved = { version: 1, plans: { pro: policy.newRequestContract(500) } };
  const f = fixture({ account: normalized, extra: { ...proof(), 'account_request_contracts/customer': saved } });
  f.db.beforeCommit = () => {
    f.db.beforeCommit = null;
    f.db.seed('transactions/paymongo_test_pay_old', { ...f.db.read('transactions/paymongo_test_pay_old'), entitlementGranted: false });
  };
  assert.equal((await f.checkout()).statusCode, 503); assert.ok(f.db.retries > 0);
  assert.equal(f.db.commits, 0); assert.equal(f.providerCalls(), 0);
  assert.deepEqual(f.db.read('account_request_contracts/customer'), saved);
  assert.equal(f.db.read(`payment_orders/${NEXT}`), undefined);
  assert.equal(f.db.read('account_api_usage/customer').used, 237);
});

test('active legacy Unlimited remains protected from finite defaults and records its intact entitlement', async () => {
  const f = fixture({ account: { ...legacy, subscriptionExpiresAt: '2026-11-01T00:00:00.000Z' } });
  assert.equal((await f.consume()).usage.limit, null); assert.equal(f.db.read('account_api_usage/customer').used, 238);
  assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.limit, null);
  assert.equal(f.db.read('users/customer').subscriptionExpiresAt, '2026-11-01T00:00:00.000Z');
});

test('API request expiry denial commits preserved evidence with normalization and never consumes usage', async () => {
  const f = fixture(); await assert.rejects(f.consume(), error => error.status === 403);
  assert.equal(f.db.read('users/customer').plan, 'Free'); assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.limit, null);
  assert.equal(f.db.read('account_api_usage/customer').used, 237); assert.equal(f.db.read(`api_keys/${f.key.id}`).status, 'active');
});

test('key-management and repeated scheduled normalization cannot corrupt promises, expiry or counters', async () => {
  const f = fixture(); await invoke(f.keys.list);
  const evidence = f.db.read('account_request_contracts/customer'), account = f.db.read('users/customer');
  for (let i = 0; i < 3; i++) {
    assert.equal(await lifecycle.normalizeExpiredAccount(f.db, 'customer', () => NOW), false); await invoke(f.keys.list);
  }
  assert.deepEqual(f.db.read('account_request_contracts/customer'), evidence); assert.deepEqual(f.db.read('users/customer'), account);
  assert.equal(account.subscriptionExpiresAt, END); assert.equal(f.db.read('account_api_usage/customer').used, 237);
});

test('normalization followed by Customer session establishment cannot grant a new Trial before paid renewal', async () => {
  const f = fixture(); await invoke(f.keys.list); let revocations = 0;
  const trial = createFreeTrialHandlers({ getDb: () => f.db, verifyIdToken: async () => ({ uid: 'customer' }), clock: () => NOW,
    revokeRefreshTokens: async () => { revocations++; } });
  const result = await invoke(trial.session); assert.equal(result.statusCode, 200); assert.equal(result.body.initialized, false);
  assert.equal((await invoke(trial.status)).body.eligible, false);
  assert.equal((await invoke(trial.activate)).statusCode, 403); assert.equal(revocations, 0);
  await assert.rejects(f.consume(), error => error.status === 403);
  assert.equal(f.db.read('account_trial_usage/customer'), undefined); assert.equal(f.db.read('users/customer').trialStartedAt, undefined);
});

test('actual scheduled downgrade callback preserves legacy evidence; a racing renewal wins its transaction retry', async () => {
  const f = fixture(), exports = {};
  const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')
    .replace("await import('./subscription-lifecycle.mjs')", 'await loadLifecycle()');
  const imports = { 'firebase-functions/v2/scheduler': { onSchedule: (_options, callback) => callback },
    'firebase-admin/app': { initializeApp() {} }, 'firebase-admin/firestore': { getFirestore: () => f.db },
    'firebase-functions/params': { defineSecret: () => ({ value: () => '' }), defineString: (_, options) => ({ value: () => options?.default ?? '' }) } };
  runInNewContext(source, { exports, require: name => { assert.ok(Object.hasOwn(imports, name)); return imports[name]; },
    loadLifecycle: async () => ({ normalizeExpiredAccount: (db, uid) => lifecycle.normalizeExpiredAccount(db, uid, () => NOW) }),
    console: { log() {}, error() {} } }, { filename: 'functions/index.js' });
  await exports.downgradeExpiredSubscriptions();
  assert.equal(f.db.read('users/customer').plan, 'Free'); assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.limit, null);
  const raced = fixture(); raced.db.beforeCommit = () => {
    raced.db.beforeCommit = null;
    raced.db.seed('users/customer', { ...legacy, subscriptionExpiresAt: '2026-11-13T12:00:00.000Z' });
    raced.db.seed('account_request_contracts/customer', { version: 1, plans: { pro_max: policy.newRequestContract(null) } });
  };
  assert.equal(await lifecycle.normalizeExpiredAccount(raced.db, 'customer', () => NOW), false); assert.ok(raced.db.retries > 0);
  assert.equal(raced.db.read('users/customer').plan, 'Pro Max'); assert.equal(raced.db.read('users/customer').subscriptionExpiresAt, '2026-11-13T12:00:00.000Z');
});

test('already-normalized legacy promises recover only from owned processed orders and paid receipts', async () => {
  const f = fixture({ account: normalized, extra: proof() });
  assert.equal((await f.status()).body.purchaseRequestLimits.pro_max, null); assert.equal(f.db.commits, 0, 'status stays read-only');
  assert.equal((await f.checkout()).statusCode, 200); assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.origin, 'paid_order');
  await f.fulfill(); assert.equal(f.effective().limit, null);
  assert.deepEqual(f.db.read(`payment_orders/${OLD}`), proof()[`payment_orders/${OLD}`]);
  assert.equal(f.db.read('account_api_usage/customer').used, 237);
});

test('accepted historical Live test-billing settlement retains its verified Unlimited promise', async () => {
  const extra = proof(), order = extra[`payment_orders/${OLD}`], receipt = extra['transactions/paymongo_test_pay_old'];
  Object.assign(order, { mode: 'live', amount: 500, listAmount: 499900, billingProfile: 'global_live_test_v1' });
  Object.assign(receipt, { mode: 'live', amount: 500 });
  delete extra['transactions/paymongo_test_pay_old']; extra['transactions/paymongo_live_pay_old'] = receipt;
  const f = fixture({ account: normalized, extra }); assert.equal((await f.status()).body.purchaseRequestLimits.pro_max, null);
  await f.checkout(); await f.fulfill(); assert.equal(f.effective().limit, null);
  assert.equal(f.db.read(`payment_orders/${NEXT}`).amount, 499900, 'new checkout retains its unchanged configured charge');
});

test('bounded recovery fails safely rather than truncating an account history', async () => {
  const extra = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`payment_orders/history-${i}`, { userId: 'customer', state: 'pending' }]));
  const f = fixture({ account: normalized, extra }), before = f.db.dump();
  assert.equal((await f.checkout()).statusCode, 503); assert.equal(f.providerCalls(), 0); assert.deepEqual(f.db.dump(), before);
});

for (const defect of ['missing', 'receipt-missing', 'foreign-receipt', 'unpaid', 'denied-grant', 'malformed-date', 'invalid-order', 'invalid-price', 'pending', 'read-failure']) {
  test(`normalized paid account with ${defect} evidence fails without a new finite order or provider call`, async () => {
    const extra = defect === 'missing' ? {} : proof();
    if (defect === 'receipt-missing') delete extra['transactions/paymongo_test_pay_old'];
    if (defect === 'foreign-receipt') extra['transactions/paymongo_test_pay_old'].userId = 'other';
    if (defect === 'unpaid') extra['transactions/paymongo_test_pay_old'].status = 'pending';
    if (defect === 'denied-grant') extra['transactions/paymongo_test_pay_old'].entitlementGranted = false;
    if (defect === 'malformed-date') extra['transactions/paymongo_test_pay_old'].subscriptionPeriodEnd = '2026-02-30T00:00:00.000Z';
    if (defect === 'invalid-order') extra[`payment_orders/${OLD}`].requestAllowance = { limit: 10 };
    if (defect === 'invalid-price') { extra[`payment_orders/${OLD}`].amount = 1; extra['transactions/paymongo_test_pay_old'].amount = 1; }
    if (defect === 'pending') extra[`payment_orders/${OLD}`].state = 'pending';
    const f = fixture({ account: normalized, extra }); if (defect === 'read-failure') f.db.failRead = 'payment_orders';
    const before = f.db.dump();
    assert.equal((await f.status()).statusCode, 503); assert.equal((await f.checkout(undefined, { legacyUnlimited: true })).statusCode, 503);
    assert.equal(f.providerCalls(), 0); assert.deepEqual(f.db.dump(), before);
  });
}

test('malformed private promises are never overwritten using a default or historical fallback', async () => {
  const f = fixture({ extra: { 'account_request_contracts/customer': { version: 2, plans: {} } } });
  const before = f.db.dump(); assert.equal((await invoke(f.keys.list)).statusCode, 503);
  await assert.rejects(lifecycle.normalizeExpiredAccount(f.db, 'customer', () => NOW), { code: 'REQUEST_CONTRACT_UNAVAILABLE' });
  assert.equal((await f.checkout()).statusCode, 503); assert.deepEqual(f.db.dump(), before);
});

test('verified finite purchase history restores its agreed terms, never inferred Unlimited from the Pro Max tier', async () => {
  for (const account of [normalized, { ...legacy, subscriptionExpiresAt: '2026-11-01T00:00:00.000Z' }]) {
    const f = fixture({ account, extra: proof(10, account), limits: { ...configured, pro_max: 5 } });
    assert.equal((await f.status()).body.purchaseRequestLimits.pro_max, 10);
    await f.checkout(); await f.fulfill(); assert.equal(f.effective().limit, 10);
  }
});

test('a genuinely new finite contract is accepted, enforced and preserved through expiry/renewal without resetting usage', async () => {
  const f = fixture({ account: fresh, used: 0 }); await f.checkout(); await f.fulfill();
  assert.equal(f.db.read(`payment_orders/${NEXT}`).requestAllowance.limit, 10); assert.equal(f.effective().limit, 10);
  for (let i = 0; i < 10; i++) await f.consume(); await assert.rejects(f.consume(), error => error.status === 429);
  f.time(new Date('2026-10-15T00:00:00.000Z')); assert.equal((await f.consume()).usage.used, 1);
  assert.equal(f.db.read('account_api_usage/customer').window, '2026-10-15');
  f.time(new Date('2026-11-14T00:00:00.000Z')); await invoke(f.keys.list);
  assert.equal(f.db.read('users/customer').plan, 'Free'); assert.equal(f.db.read('account_request_contracts/customer').plans.pro_max.limit, 10);
  assert.equal((await f.status()).body.purchaseRequestLimits.pro_max, 10);
});

test('fulfilled renewal replay never extends expiry twice, rewrites promises or resets counters', async () => {
  const f = fixture(); await invoke(f.keys.list); await f.checkout(); assert.deepEqual(await f.fulfill(), { duplicate: false });
  const before = f.db.dump(); assert.deepEqual(await f.fulfill(), { duplicate: true }); assert.deepEqual(f.db.dump(), before);
});

test('active legacy renewal retains future paid time and the original promise without touching usage', async () => {
  const f = fixture({ account: { ...legacy, subscriptionExpiresAt: '2026-11-01T00:00:00.000Z' } });
  await f.checkout(); await f.fulfill(); assert.equal(f.effective().limit, null);
  assert.equal(f.db.read('users/customer').subscriptionExpiresAt, '2026-12-01T00:00:00.000Z');
  assert.equal(f.db.read('account_api_usage/customer').used, 237);
});

test('new finite incoming payment cannot replace unknown legacy terms after normalization', async () => {
  const f = fixture({ account: fresh, used: 0 }); await f.checkout();
  f.db.seed('users/customer', normalized); const before = f.db.dump();
  await assert.rejects(f.fulfill(), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' }); assert.deepEqual(f.db.dump(), before);
});

test('incoming Unlimited terms alone cannot establish missing historical terms', async () => {
  const f = fixture(); await f.checkout(); f.db.remove('account_request_contracts/customer'); f.db.seed('users/customer', normalized);
  f.db.remove(`payment_orders/${OLD}`); f.db.remove('transactions/paymongo_test_pay_old');
  const before = f.db.dump(); await assert.rejects(f.fulfill(), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' }); assert.deepEqual(f.db.dump(), before);
});

test('legacy Pro retains 500/day on normalization and applicable renewal offers; legitimate increases still apply', async () => {
  const account = { ...legacy, plan: 'Pro', apiRequestLimit: 500 }, f = fixture({ account, limits: { ...configured, pro: 100 } });
  await invoke(f.keys.list); assert.equal(f.db.read('account_request_contracts/customer').plans.pro.limit, 500);
  assert.equal((await f.status()).body.purchaseRequestLimits.pro, 500);
  const active = fixture({ account: { ...account, subscriptionExpiresAt: '2026-11-01T00:00:00.000Z' }, used: 499 });
  assert.equal((await active.consume()).usage.limit, 500); await assert.rejects(active.consume(), error => error.status === 429);
  active.db.seed('system/settings', { planRequestLimits: { ...configured, pro: 1000 } }); assert.equal((await active.consume()).usage.limit, 1000);
});

test('actual personalized Billing cards match renewed legacy Unlimited and genuinely new finite backend allowances', async () => {
  const icons = new Proxy({}, { get: () => 'svg' });
  const config = load('dashboard/src/config/plans.ts', 'exports', hooks(), { '../../../functions/entitlement-limits.mjs': limits, 'lucide-react': icons });
  const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree == null || typeof tree === 'boolean' ? ''
    : typeof tree === 'object' ? text(tree.props.children) : String(tree);
  const expand = tree => Array.isArray(tree) ? tree.map(expand) : tree && typeof tree === 'object' ? typeof tree.type === 'function'
    ? expand(tree.type(tree.props)) : { ...tree, props: { ...tree.props, children: expand(tree.props.children) } } : tree;
  for (const account of [legacy, fresh]) {
    const f = fixture({ account, used: 0 }); if (account === legacy) await invoke(f.keys.list); await f.checkout(); await f.fulfill();
    const response = await f.status(); const auth = { loading: false, user: { uid: 'customer' }, entitlement: response.body, refreshUserDoc: async () => {} };
    const providerHooks = hooks(); let context;
    providerHooks.React.createContext = value => (context = { value, Provider: 'provider' }); providerHooks.React.useContext = value => value.value;
    const module = load('dashboard/src/lib/plan-request-policy.tsx', 'exports', providerHooks, { '@/config/plans': config,
      '@/lib/firebase/auth-context': { useAuth: () => auth }, '../../../functions/request-limit-policy.mjs': policy }, {
      setInterval: () => 1, clearInterval() {}, fetch: async url => { assert.equal(url, '/api/v1/system/status');
        return { ok: true, json: async () => ({ success: true, planRequestLimits: configured, requestPolicyVersion: policy.requestPolicyVersion(configured) }) }; } });
    providerHooks.mount(module.PlanRequestPolicyProvider); await flush(); context.value = providerHooks.output.props.value;
    const h = hooks(), Billing = load('dashboard/src/app/dashboard/plan-billing/page.tsx', 'PlanBillingPage', h, {
      'next/link': 'a', 'lucide-react': icons, '@/config/plans': config, '@/lib/plan-request-policy': module,
      '@/lib/firebase/auth-context': { useAuth: () => auth }, '@/components/subscription/SubscriptionModal': () => null, '@/components/subscription/FreeTrialContent': () => null });
    const tree = expand(h.mount(Billing)), card = nodes(tree, node => node.type === 'article').find(node => /Pro Max/.test(text(node)));
    const quota = await f.consume(); assert.equal(quota.usage.limit, response.body.apiRequestLimit);
    assert.match(text(card), account === legacy ? /Unlimited account request quota/ : /10 requests\/day \(UTC\)/);
    assert.match(text(tree), account === legacy ? /Unlimited account request quota/ : /10 requests\/day \(UTC\)/);
    assert.equal(module.useAccountRequestAllowance(), quota.usage.limit); h.stop(); providerHooks.stop();
  }
});
