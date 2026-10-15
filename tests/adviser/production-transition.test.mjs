import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { memoryFirestore, invoke } from './phase2b1/memory-firestore.mjs';
import { paymentConfiguration, PRO_PURCHASE, PRO_MAX_PURCHASE } from '../../services/payment-contract.js';
import { requirePaymentProject } from '../../services/payment-isolation.js';
import { createPaymentHandlers } from '../../services/payment-checkout.js';
import { checkoutPayload } from '../../services/paymongo-checkout.js';
import { createPaymentWebhook, fulfillPayment } from '../../services/payment-webhook.js';
import { resolveRequestContracts } from '../../functions/request-contract-evidence.mjs';
import { validateReleaseConfig } from '../../scripts/validate-release-config.mjs';

const NOW = new Date('2026-10-15T00:00:00.000Z');
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FREE = { uid: 'owner', role: 'Developer', plan: 'Free', apiRequestLimit: 50 };
const config = (mode = 'live', extra = {}) => paymentConfiguration({ mode, secretKey: `sk_${mode}_synthetic`,
  webhookSecret: 'synthetic-signing-only', dashboardUrl: 'https://customer.example', ...extra });
function fixture(limit = 500, { demo = false, project = 'inventaapi-db', mode = 'live', hold = false } = {}) {
  const cfg = config(mode, { checkoutInitiationHold: String(hold) });
  const order = { id: ID, userId: 'owner', ...PRO_PURCHASE, mode, state: 'pending',
    sessionId: 'cs_synthetic', paymentIntentId: 'pi_synthetic', apiRequestLimit: limit,
    ...(demo ? { amount: 500, listAmount: 149900, billingProfile: 'global_live_test_v1' } : {}) };
  const payload = checkoutPayload(order, cfg.dashboardUrl);
  payload.data.attributes.line_items[0].description = limit === 5000
    ? '1 Month Subscription — 5,000 API requests/day' : '1 Month Subscription — 500 API requests/day';
  order.providerRequestBody = JSON.stringify(payload);
  const db = memoryFirestore({ 'users/owner': FREE, [`payment_orders/${ID}`]: order,
    [`payment_sessions/${mode}_cs_synthetic`]: { orderId: ID, userId: 'owner', sessionId: order.sessionId, mode },
    'payment_checkout_locks/owner': { orderId: ID, sessionId: order.sessionId, mode },
    'account_daily_usage/owner_2026-10-15': { used: 41 }, 'trial_usage/owner': { selectedProductCount: 12 } });
  db.projectId = project;
  const event = { data: { id: 'evt_synthetic', type: 'event', attributes: {
    type: 'checkout_session.payment.paid', livemode: mode === 'live', data: {
      id: order.sessionId, type: 'checkout_session', attributes: {
        ...structuredClone(payload.data.attributes), status: 'active', livemode: mode === 'live',
        payment_intent: { id: order.paymentIntentId, type: 'payment_intent', attributes: {
          amount: order.amount, currency: 'PHP', livemode: mode === 'live', status: 'succeeded' } },
        payments: [{ id: 'pay_synthetic', type: 'payment', attributes: { amount: order.amount, currency: 'PHP',
          livemode: mode === 'live', payment_intent_id: order.paymentIntentId, status: 'paid', source: { type: 'qrph' }, refunds: [] } }],
      },
    },
  } } };
  const diagnostics = [];
  const hook = createPaymentWebhook({ getDb: () => db, getConfig: () => cfg, clock: () => NOW,
    report: value => diagnostics.push(value.code) });
  function signed(value = event, timestamp = NOW.getTime() / 1000) {
    const rawBody = JSON.stringify(value), digest = createHmac('sha256', cfg.webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');
    return { rawBody, headers: { 'paymongo-signature': `t=${timestamp},te=${mode === 'test' ? digest : ''},li=${mode === 'live' ? digest : ''}` } };
  }
  return { db, order, cfg, event, hook, signed, diagnostics };
}
const attrs = f => f.event.data.attributes.data.attributes;

for (const [index, limit] of [500, 500, 500, 500, 5000, 5000, 5000].entries()) {
  test(`legacy pending session ${index + 1}: signed paid LIVE preserves original ${limit}/day`, async () => {
    const f = fixture(limit, { demo: index < 5 });
    const unpaid = f.db.dump();
    assert.equal(f.db.read('users/owner').plan, 'Free');
    const result = await invoke(f.hook, f.signed());
    assert.equal(result.statusCode, 200); assert.equal(result.body.processed, true);
    const contract = f.db.read('account_request_contracts/owner');
    assert.equal(contract.plans.pro.limit, limit);
    const receipt = f.db.read('transactions/paymongo_live_pay_synthetic');
    assert.equal(receipt.amount, f.order.amount); assert.equal(receipt.requestAllowance.limit, limit);
    assert.equal(receipt.requestAllowanceEvidence, 'signed_checkout_offer');
    assert.match(receipt.requestAllowance.policyVersion, /legacy-signed/);
    assert.equal(f.db.read('users/owner').subscriptionExpiresAt, '2026-11-14T00:00:00.000Z');
    assert.deepEqual(f.db.read('account_daily_usage/owner_2026-10-15'), unpaid['account_daily_usage/owner_2026-10-15']);
    assert.deepEqual(f.db.read('trial_usage/owner'), unpaid['trial_usage/owner']);
    assert.equal((await invoke(f.hook, f.signed())).body.duplicate, true);
    assert.equal(f.db.userWrites, 1);
  });
}

for (const [name, mutate] of [
  ['unpaid', f => { attrs(f).payments[0].attributes.status = 'pending'; }],
  ['wrong session', f => { f.event.data.attributes.data.id = 'cs_wrong'; }],
  ['wrong intent', f => { f.db.seed(`payment_orders/${ID}`, { ...f.order, paymentIntentId: 'pi_wrong' }); }],
  ['wrong owner', f => { f.db.seed(`payment_orders/${ID}`, { ...f.order, userId: 'stranger' }); }],
  ['wrong currency', f => { attrs(f).payment_intent.attributes.currency = 'USD'; }],
  ['provider offer contradiction', f => { attrs(f).line_items[0].description = '1 Month Subscription — 500 API requests/day'; }],
  ['missing provider offer', f => { delete attrs(f).line_items[0].description; }],
  ['wrong merchant reference', f => { attrs(f).reference_number = 'wrong'; }],
  ['unverified payload', f => { f.db.seed(`payment_orders/${ID}`, { ...f.order, providerRequestBody: '{}' }); }],
  ['contradictory storage quota', f => { f.db.seed(`payment_orders/${ID}`, { ...f.order, apiRequestLimit: 500 }); }],
]) test(`legacy rejection: ${name} cannot upgrade or persist a contract`, async () => {
  const f = fixture(5000); mutate(f); const before = f.db.dump();
  assert.ok((await invoke(f.hook, f.signed())).statusCode >= 400);
  assert.deepEqual(f.db.dump(), before); assert.equal(f.db.commits, 0);
  assert.ok(f.diagnostics.length > 0);
});

test('invalid and stale signatures cannot upgrade a legacy order', async () => {
  const f = fixture(); const input = f.signed(); input.headers['paymongo-signature'] += 'wrong';
  assert.equal((await invoke(f.hook, input)).statusCode, 403);
  assert.equal((await invoke(f.hook, f.signed(f.event, NOW.getTime() / 1000 - 301))).statusCode, 403);
  assert.equal(f.db.commits, 0);
});

test('concurrent signed delivery and transaction retry grant a historical offer exactly once', async () => {
  const f = fixture(5000); let once = false;
  f.db.beforeCommit = () => { if (!once) { once = true; f.db.seed(`payment_orders/${ID}`, { ...f.order, retryFixture: true }); } };
  const results = await Promise.all([invoke(f.hook, f.signed()), invoke(f.hook, f.signed())]);
  assert.ok(results.every(r => r.statusCode === 200)); assert.ok(f.db.retries > 0); assert.equal(f.db.userWrites, 1);
  const next = structuredClone(f.event); next.data.id = 'evt_redelivery';
  assert.equal((await invoke(f.hook, f.signed(next))).body.duplicate, true);
  assert.equal(f.db.userWrites, 1); assert.equal(f.db.read('account_request_contracts/owner').plans.pro.limit, 5000);
});

test('the exported completion helper cannot accept caller-invented signed legacy offer proof', async () => {
  const f = fixture();
  await assert.rejects(fulfillPayment(f.db, { mode: 'live', eventId: 'evt_forged', paymentId: 'pay_synthetic',
    paymentIntentId: 'pi_synthetic', sessionId: 'cs_synthetic', amount: f.order.amount, currency: 'PHP',
    signedSession: attrs(f) }, NOW), { code: 'PAYMENT_VERIFICATION_REQUIRED' });
  assert.equal(f.db.commits, 0);
});

test('alternate Production completion cannot bypass signature verification using structured terms', async () => {
  const f = fixture();
  f.db.seed(`payment_orders/${ID}`, { ...f.order, requestAllowance: {
    planId: 'pro', limit: 500, period: 'utc_daily', policyVersion: 'requests-v1:fixture',
  } });
  await assert.rejects(fulfillPayment(f.db, { mode: 'live', eventId: 'evt_unsigned', paymentId: 'pay_synthetic',
    paymentIntentId: 'pi_synthetic', sessionId: 'cs_synthetic', amount: f.order.amount, currency: 'PHP' }, NOW),
  { code: 'PAYMENT_VERIFICATION_REQUIRED' });
  assert.equal(f.db.commits, 0);
});

test('legacy 5,000/day initiation never assumes 500/day or retires the historical checkout', async () => {
  const f = fixture(5000); let providerCalls = 0;
  const h = createPaymentHandlers({ getDb: () => f.db, getConfig: () => f.cfg, verifyIdToken: async () => ({ uid: 'owner' }),
    clock: () => NOW, newOrderId: () => ID, createSession: async () => { providerCalls++; }, expireSession: async () => { providerCalls++; } });
  const before = f.db.dump();
  assert.equal((await invoke(h.checkout)).body.code, 'PENDING_ORDER_TERMS');
  assert.equal(providerCalls, 0); assert.deepEqual(f.db.dump(), before);
});

for (let i = 0; i < 2; i++) test(`historical paid Pro ${i + 1}: local receipt/event/text alone cannot silently create accepted terms`, async () => {
  const f = fixture(500, { demo: true });
  f.db.seed('users/owner', { ...FREE, plan: 'Pro', subscription_status: 'active',
    subscriptionStartedAt: NOW.toISOString(), subscriptionExpiresAt: '2026-11-14T00:00:00.000Z' });
  f.db.seed(`payment_orders/${ID}`, { ...f.order, state: 'processed', paymentId: 'pay_synthetic',
    subscriptionPeriodStart: NOW.toISOString(), subscriptionPeriodEnd: '2026-11-14T00:00:00.000Z' });
  f.db.seed('transactions/paymongo_live_pay_synthetic', { orderId: ID, userId: 'owner', mode: 'live',
    paymentId: 'pay_synthetic', sessionId: 'cs_synthetic', plan: 'Pro', status: 'paid', entitlementGranted: true,
    amount: 500, currency: 'PHP', subscriptionPeriodStart: NOW.toISOString(), subscriptionPeriodEnd: '2026-11-14T00:00:00.000Z' });
  f.db.seed('payment_events/live_evt_synthetic', { orderId: ID, userId: 'owner', mode: 'live', sessionId: 'cs_synthetic', paymentId: 'pay_synthetic' });
  const before = f.db.dump();
  await assert.rejects(f.db.runTransaction(tx => resolveRequestContracts(tx, f.db, 'owner', f.db.read('users/owner'),
    { recoverHistorical: true })), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' });
  assert.deepEqual(f.db.dump(), before);
});

for (const [project, mode, allowed] of [['inventaapi-db', 'test', false], ['inventaapi-db', 'live', true],
  ['inventaapi-staging', 'test', true], ['wrong-project', 'live', false], [undefined, 'live', false]]) {
  test(`effective project ${project}, mode ${mode}: checkout ${allowed ? 'allowed' : 'rejected before writes'}`, async () => {
    const db = memoryFirestore({ 'users/owner': FREE }); db.projectId = project; let calls = 0;
    const handlers = createPaymentHandlers({ getDb: () => db, getConfig: () => config(mode),
      verifyIdToken: async () => ({ uid: 'owner' }), clock: () => NOW, newOrderId: () => ID,
      createSession: async () => { calls++; return { sessionId: 'cs_new', paymentIntentId: 'pi_new', checkoutUrl: 'https://checkout.paymongo.com/new' }; } });
    const result = await invoke(handlers.checkout);
    assert.equal(result.statusCode, allowed ? 200 : 503); assert.equal(calls, allowed ? 1 : 0);
    if (!allowed) assert.equal(db.commits, 0);
  });
}

test('Production TEST webhook and alternate fulfillment are rejected, including structured new orders', async () => {
  const f = fixture(500, { mode: 'test' });
  f.db.seed(`payment_orders/${ID}`, { ...f.order, requestAllowance: { planId: 'pro', limit: 500, period: 'utc_daily', policyVersion: 'requests-v1:fixture' } });
  assert.equal((await invoke(f.hook, f.signed())).body.code, 'PAYMENT_MODE_ISOLATION');
  await assert.rejects(fulfillPayment(f.db, { mode: 'test' }, NOW), { code: 'PAYMENT_MODE_ISOLATION' });
  assert.equal(f.db.commits, 0);
});

test('effective project overrides conflicting config; unknown identity and missing mode fail closed', () => {
  assert.throws(() => requirePaymentProject({ projectId: 'inventaapi-db' }, 'live', 'inventaapi-staging'), { code: 'PAYMENT_PROJECT' });
  assert.throws(() => requirePaymentProject({ get projectId() { throw Error('unresolved'); } }, 'live'), { code: 'PAYMENT_PROJECT' });
  assert.throws(() => requirePaymentProject({ projectId: 'inventaapi-db' }, undefined), { code: 'PAYMENT_MODE_ISOLATION' });
  assert.throws(() => config('test', { firebaseProjectId: 'inventaapi-db' }), { code: 'PAYMENT_MODE_ISOLATION' });
  assert.throws(() => config('live', { secretKey: 'sk_test_synthetic' }), { code: 'PAYMENT_CONFIG' });
});

test('initiation hold defaults OFF, blocks checkout before writes, and preserves signed fulfillment and status', async () => {
  assert.equal(config().checkoutInitiationHold, false);
  assert.throws(() => config('live', { checkoutInitiationHold: 'TRUE' }), { code: 'PAYMENT_CONFIG' });
  const f = fixture(5000, { hold: true }); let calls = 0;
  const h = createPaymentHandlers({ getDb: () => f.db, getConfig: () => f.cfg, verifyIdToken: async () => ({ uid: 'owner' }),
    clock: () => NOW, createSession: async () => { calls++; } });
  assert.equal((await invoke(h.checkout)).body.code, 'CHECKOUT_INITIATION_HELD');
  assert.equal(f.db.commits, 0); assert.equal(calls, 0);
  assert.equal((await invoke(f.hook, f.signed())).statusCode, 200);
  assert.equal((await invoke(h.status)).body.apiRequestLimit, 5000);
});

for (const purchase of [PRO_PURCHASE, PRO_MAX_PURCHASE]) test(`standard ${purchase.plan} initiation keeps canonical price`, async () => {
  const db = memoryFirestore({ 'users/owner': FREE }); db.projectId = 'inventaapi-db';
  const h = createPaymentHandlers({ getDb: () => db, getConfig: () => config(), verifyIdToken: async () => ({ uid: 'owner' }),
    clock: () => NOW, newOrderId: () => ID, createSession: async ({ order }) => {
      assert.equal(order.amount, purchase.amount); assert.equal(order.billingProfile, undefined);
      assert.equal(JSON.parse(order.providerRequestBody).data.attributes.line_items[0].amount, purchase.amount);
      return { sessionId: 'cs_new', paymentIntentId: 'pi_new', checkoutUrl: 'https://checkout.paymongo.com/new' };
    } });
  assert.equal((await invoke(h.checkout, { body: { plan: purchase.planId } })).body.amount, purchase.amount);
});

test('release validator rejects Production TEST mode and malformed initiation hold without secrets', () => {
  const result = validateReleaseConfig({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'inventaapi-db',
    PAYMONGO_MODE: 'test', PAYMENT_CHECKOUT_INITIATION_HOLD: 'invalid' }, { scope: 'backend', mode: 'production', nodeVersion: 'v22.20.0', now: NOW });
  assert.ok(result.errors.some(e => e.code === 'PAYMENT_MODE_ISOLATION'));
  assert.ok(result.errors.some(e => e.code === 'INVALID_CHECKOUT_HOLD'));
});
