import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRO_PURCHASE, PRO_MAX_PURCHASE, matchesPurchase } from '../../../services/payment-contract.js';
import { checkoutPayload } from '../../../services/paymongo-checkout.js';
import { createPaymentHandlers } from '../../../services/payment-checkout.js';
import { fulfillPayment, paymentFromEvent } from '../../../services/payment-webhook.js';
import { evaluateEntitlement } from '../../../functions/subscription-lifecycle.mjs';
import { memoryFirestore, invoke } from '../phase2b1/memory-firestore.mjs';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const orderId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const free = { uid: 'owner', role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Grocery' };
const pro = { ...free, plan: 'Pro', apiRequestLimit: 5000, subscription_status: 'active',
  subscriptionStartedAt: '2026-09-01T12:00:00.000Z', subscriptionExpiresAt: '2026-10-01T12:00:00.000Z' };
const config = { mode: 'test', secretKey: 'sk_test_synthetic', webhookSecret: 'synthetic-only', dashboardUrl: 'https://customer.example' };
function handlers(account = free) {
  const db = memoryFirestore({ 'users/owner': account });
  let calls = 0;
  const payment = createPaymentHandlers({ getDb: () => db, verifyIdToken: async token => {
    if (token !== 'owner-token') throw Error('invalid'); return { uid: 'owner' };
  }, getConfig: () => config, clock: () => NOW, newOrderId: () => orderId,
  createSession: async () => { calls++; return { sessionId: 'cs_abc', paymentIntentId: 'pi_abc',
    checkoutUrl: 'https://checkout.paymongo.com/test' }; } });
  return { db, payment, calls: () => calls };
}

test('authoritative purchase catalog preserves exact Pro and Pro Max terms', () => {
  assert.deepEqual(PRO_PURCHASE, { planId: 'pro', plan: 'Pro', amount: 149900, currency: 'PHP', durationDays: 30, apiRequestLimit: 5000 });
  assert.deepEqual(PRO_MAX_PURCHASE, { planId: 'pro_max', plan: 'Pro Max', amount: 499900, currency: 'PHP', durationDays: 30, apiRequestLimit: null });
  assert.equal(matchesPurchase({ ...PRO_MAX_PURCHASE }), true);
  assert.equal(matchesPurchase({ ...PRO_MAX_PURCHASE, amount: 149900 }), false);
  assert.equal(matchesPurchase({ ...PRO_PURCHASE, plan: 'Pro Max' }), false);
  const payload = checkoutPayload({ id: orderId, ...PRO_MAX_PURCHASE }, config.dashboardUrl);
  assert.equal(payload.data.attributes.line_items[0].amount, 499900);
  assert.equal(payload.data.attributes.line_items[0].name, 'InventaAPI Pro Max Plan');
  assert.equal(payload.data.attributes.metadata.planId, 'pro_max');
});

test('checkout uses requested server catalog plan and rejects client price/currency/duration/quota tampering', async () => {
  const env = handlers();
  const accepted = await invoke(env.payment.checkout, { body: { plan: 'pro_max' } });
  assert.equal(accepted.statusCode, 200); assert.equal(accepted.body.amount, 499900);
  assert.deepEqual(Object.fromEntries(Object.entries(env.db.read(`payment_orders/${orderId}`))
    .filter(([key]) => Object.hasOwn(PRO_MAX_PURCHASE, key))), PRO_MAX_PURCHASE);
  assert.equal(env.calls(), 1);
  for (const body of [
    { plan: 'enterprise' }, { plan: 'pro_max', amount: 149900 }, { plan: 'pro_max', currency: 'USD' },
    { plan: 'pro_max', durationDays: 365 }, { plan: 'pro_max', apiRequestLimit: 5000 },
    { plan: 'pro', amount: 499900 }, { plan: 'pro_max', discount: 1 },
  ]) {
    const attempt = handlers();
    assert.ok((await invoke(attempt.payment.checkout, { body })).statusCode >= 400);
    assert.equal(attempt.calls(), 0); assert.equal(attempt.db.read(`payment_orders/${orderId}`), undefined);
  }
});

test('verified Pro payment cannot grant Pro Max and exact Pro Max payment extends existing paid time once', async () => {
  const env = handlers(pro);
  const checkout = await invoke(env.payment.checkout, { body: { plan: 'pro_max' } });
  assert.equal(checkout.statusCode, 200);
  const amount = PRO_MAX_PURCHASE.amount;
  const paid = { mode: 'test', eventId: 'evt_abc', sessionId: 'cs_abc', paymentIntentId: 'pi_abc',
    paymentId: 'pay_abc', amount, currency: 'PHP' };
  await assert.rejects(fulfillPayment(env.db, { ...paid, amount: PRO_PURCHASE.amount }, NOW), error => error.code === 'ORDER_MISMATCH');
  await assert.rejects(fulfillPayment(env.db, { ...paid, currency: 'USD' }, NOW), error => error.code === 'ORDER_MISMATCH');
  await assert.rejects(fulfillPayment(env.db, { ...paid, sessionId: 'cs_wrong' }, NOW));
  assert.equal(env.db.read('users/owner').plan, 'Pro');
  assert.deepEqual(await fulfillPayment(env.db, paid, NOW), { duplicate: false });
  assert.equal(env.db.read('users/owner').plan, 'Pro Max');
  assert.equal(env.db.read('users/owner').apiRequestLimit, null);
  assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2026-10-31T12:00:00.000Z');
  assert.deepEqual(await fulfillPayment(env.db, paid, NOW), { duplicate: true });
  assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2026-10-31T12:00:00.000Z');
});

test('Free, active Trial, and Upgrade Required purchase Pro Max without erasing Trial history', async () => {
  const trial = { ...free, hasUsedFreeTrial: true, trialVersion: 1,
    trialStartedAt: '2026-09-26T12:00:00.000Z', trialExpiresAt: '2026-10-03T12:00:00.000Z' };
  const exhausted = { ...trial, trialExhaustedAt: '2026-09-27T11:00:00.000Z' };
  for (const initial of [free, trial, exhausted]) {
    const env = handlers(initial);
    assert.equal((await invoke(env.payment.checkout, { body: { plan: 'pro_max' } })).statusCode, 200);
    assert.deepEqual(await fulfillPayment(env.db, { mode: 'test', eventId: 'evt_abc', sessionId: 'cs_abc',
      paymentIntentId: 'pi_abc', paymentId: 'pay_abc', amount: 499900, currency: 'PHP' }, NOW), { duplicate: false });
    const upgraded = env.db.read('users/owner');
    assert.equal(upgraded.plan, 'Pro Max');
    assert.equal(upgraded.apiRequestLimit, null);
    assert.equal(upgraded.subscriptionExpiresAt, '2026-10-27T12:00:00.000Z');
    assert.equal(evaluateEntitlement(upgraded, NOW).limit, null);
    for (const field of ['hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt', 'trialExhaustedAt']) {
      assert.equal(upgraded[field], initial[field]);
    }
  }
});

test('Pro Max renewal preserves existing paid time and active Pro Max cannot downgrade through Pro checkout', async () => {
  const max = { ...pro, plan: 'Pro Max', apiRequestLimit: null };
  const env = handlers(max);
  assert.equal((await invoke(env.payment.checkout, { body: { plan: 'pro' } })).statusCode, 409);
  assert.equal(env.calls(), 0);
  assert.equal((await invoke(env.payment.checkout, { body: { plan: 'pro_max' } })).statusCode, 200);
  await fulfillPayment(env.db, { mode: 'test', eventId: 'evt_abc', sessionId: 'cs_abc',
    paymentIntentId: 'pi_abc', paymentId: 'pay_abc', amount: 499900, currency: 'PHP' }, NOW);
  assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2026-10-31T12:00:00.000Z');
  assert.equal(env.db.read('users/owner').plan, 'Pro Max');
});

test('Pro Max expiry after consumed Trial fails closed to Upgrade Required without clearing history', () => {
  const used = { ...free, plan: 'Pro Max', apiRequestLimit: null, subscription_status: 'active',
    subscriptionExpiresAt: '2026-09-27T12:00:00.000Z', trialStartedAt: '2026-09-01T12:00:00.000Z',
    trialExpiresAt: '2026-09-08T12:00:00.000Z', hasUsedFreeTrial: true, trialVersion: 1 };
  const effective = evaluateEntitlement(used, NOW);
  assert.equal(effective.plan, 'Upgrade Required'); assert.equal(effective.limit, 0);
  assert.equal(used.hasUsedFreeTrial, true);
  assert.throws(() => evaluateEntitlement({ ...used, subscriptionExpiresAt: '2026-10-01T12:00:00' }, NOW));
  assert.throws(() => evaluateEntitlement({ ...used, apiRequestLimit: 5000 }, NOW));
});

test('provider event amounts are parsed but exact saved-order binding decides entitlement', () => {
  const event = { data: { id: 'evt_abc', type: 'event', attributes: { type: 'checkout_session.payment.paid', livemode: false,
    data: { id: 'cs_abc', type: 'checkout_session', attributes: { status: 'active', livemode: false,
      line_items: [{ amount: 499900, currency: 'PHP', quantity: 1 }],
      payment_intent: { id: 'pi_abc', type: 'payment_intent', attributes: { amount: 499900, currency: 'PHP', livemode: false, status: 'succeeded' } },
      payments: [{ id: 'pay_abc', type: 'payment', attributes: { amount: 499900, currency: 'PHP', livemode: false,
        payment_intent_id: 'pi_abc', status: 'paid', source: { type: 'gcash' }, refunds: [] } }],
    } },
  } } };
  assert.equal(paymentFromEvent(event, 'test').amount, 499900);
  assert.throws(() => paymentFromEvent(event, 'live'), error => error.code === 'MODE_MISMATCH');
  event.data.attributes.data.attributes.line_items[0].amount = 149900;
  assert.throws(() => paymentFromEvent(event, 'test'), error => error.code === 'PURCHASE_MISMATCH');
});
