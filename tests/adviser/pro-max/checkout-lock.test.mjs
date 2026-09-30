import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPaymentHandlers } from '../../../services/payment-checkout.js';
import { fulfillPayment } from '../../../services/payment-webhook.js';
import { purchaseForIntent } from '../../../services/payment-contract.js';
import { evaluateEntitlement } from '../../../functions/subscription-lifecycle.mjs';
import { memoryFirestore, invoke } from '../phase2b1/memory-firestore.mjs';

const NOW = new Date('2026-09-30T08:00:00.000Z');
const config = { mode: 'test', secretKey: 'sk_test_SYNTHETIC_LOCAL_ONLY',
  webhookSecret: 'SYNTHETIC_LOCAL_ONLY', dashboardUrl: 'https://customer.example' };
const customer = { uid: 'owner', role: 'Developer', plan: 'Free', apiRequestLimit: 50,
  businessSegment: 'Grocery', hasUsedFreeTrial: true, trialVersion: 1,
  trialStartedAt: '2026-09-01T08:00:00.000Z', trialExpiresAt: '2026-09-08T08:00:00.000Z' };
const orderPath = id => `payment_orders/${id}`;

// All provider work is injected and simulated. No SDK, credentials, or HTTP I/O.
function fixture({ failFirst = false } = {}) {
  const db = memoryFirestore({ 'users/owner': customer });
  const attempts = [], sessions = new Map();
  let instant = NOW.getTime();
  const handlers = createPaymentHandlers({ getDb: () => db, getConfig: () => config,
    clock: () => new Date(instant), newOrderId: randomUUID,
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token !== 'owner-token') throw Error('Invalid synthetic token');
      return { uid: 'owner' };
    },
    createSession: async ({ order }) => {
      assert.equal(db.read(orderPath(order.id)).state, 'creating');
      assert.equal(db.read('payment_checkout_locks/owner').orderId, order.id);
      attempts.push(structuredClone(order));
      if (failFirst && attempts.length === 1) throw Error('Simulated delivery failure');
      if (!sessions.has(order.id)) sessions.set(order.id, {
        sessionId: `cs_local${sessions.size + 1}`, paymentIntentId: `pi_local${sessions.size + 1}`,
        checkoutUrl: `https://checkout.paymongo.com/local${sessions.size + 1}`,
      });
      return sessions.get(order.id);
    },
  });
  return { db, handlers, attempts, advance: ms => { instant += ms; } };
}
function paymentFor(order, label) {
  return { mode: order.mode, eventId: `evt_${label}`, paymentId: `pay_${label}`,
    sessionId: order.sessionId, paymentIntentId: order.paymentIntentId,
    amount: order.amount, currency: order.currency };
}
async function completed(plan = 'pro') {
  const env = fixture();
  assert.equal(evaluateEntitlement(env.db.read('users/owner'), NOW).plan, 'Upgrade Required');
  const checkout = await invoke(env.handlers.checkout, { body: { plan } });
  assert.equal(checkout.statusCode, 200);
  const oldId = checkout.body.orderId;
  const paid = paymentFor(env.db.read(orderPath(oldId)), 'historical');
  assert.deepEqual(await fulfillPayment(env.db, paid, NOW), { duplicate: false });
  assert.equal(env.db.read(orderPath(oldId)).state, 'processed');
  return { ...env, oldId, paid };
}
function preserveHistory(db, before) {
  for (const [path, record] of Object.entries(before)) {
    if (path !== 'payment_checkout_locks/owner') assert.deepEqual(db.read(path), record, path);
  }
}

for (const [previous, requested] of [['pro', 'pro_max'], ['pro', 'pro'], ['pro_max', 'pro_max']]) {
  test(`processed ${previous} -> ${requested}: new canonical checkout preserves historical payment and owner`, async () => {
    const env = await completed(previous);
    const before = env.db.dump();
    const response = await invoke(env.handlers.checkout, { body: { plan: requested, userId: 'owner' } });
    assert.equal(response.statusCode, 200);
    assert.notEqual(response.body.orderId, env.oldId);
    const order = env.db.read(orderPath(response.body.orderId));
    const purchase = purchaseForIntent(requested);
    for (const [field, value] of Object.entries(purchase)) assert.equal(order[field], value, field);
    assert.equal(order.userId, 'owner'); assert.equal(order.mode, 'test');
    assert.equal(order.state, 'pending'); assert.equal(order.currency, 'PHP');
    assert.notEqual(order.sessionId, before[orderPath(env.oldId)].sessionId);
    assert.notEqual(order.paymentIntentId, before[orderPath(env.oldId)].paymentIntentId);
    assert.notEqual(order.idempotencyKey, before[orderPath(env.oldId)].idempotencyKey);
    const payload = JSON.parse(order.providerRequestBody).data.attributes;
    assert.equal(payload.line_items[0].amount, purchase.amount);
    assert.equal(payload.line_items[0].currency, 'PHP');
    assert.equal(payload.metadata.planId, requested);
    assert.equal(payload.reference_number, order.id);
    assert.deepEqual(env.db.read(`payment_sessions/test_${order.sessionId}`), {
      orderId: order.id, userId: 'owner', mode: 'test', sessionId: order.sessionId,
    });
    preserveHistory(env.db, before);
    assert.equal(env.attempts.length, 2);
    // Creation alone must not grant/extend entitlement; only bound fulfillment does.
    const paid = paymentFor(order, 'new');
    assert.deepEqual(await fulfillPayment(env.db, paid, NOW), { duplicate: false });
    assert.equal(env.db.read('users/owner').plan, purchase.plan);
    assert.equal(env.db.read('users/owner').apiRequestLimit, purchase.apiRequestLimit);
    assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2026-11-29T08:00:00.000Z');
    assert.equal(env.db.read('users/owner').hasUsedFreeTrial, true);
    const fulfilled = env.db.dump();
    assert.deepEqual(await fulfillPayment(env.db, env.paid, NOW), { duplicate: true });
    assert.deepEqual(await fulfillPayment(env.db, paid, NOW), { duplicate: true });
    assert.deepEqual(env.db.dump(), fulfilled);
    assert.deepEqual(env.db.read(orderPath(env.oldId)), before[orderPath(env.oldId)]);
  });
}

test('processed legacy Pro order without planId allows new canonical Pro Max intent', async () => {
  const env = await completed();
  const old = env.db.read(orderPath(env.oldId)); delete old.planId;
  env.db.seed(orderPath(env.oldId), old);
  const response = await invoke(env.handlers.checkout, { body: { plan: 'pro_max' } });
  assert.equal(response.statusCode, 200);
  assert.equal(env.db.read(orderPath(response.body.orderId)).planId, 'pro_max');
  assert.deepEqual(env.db.read(orderPath(env.oldId)), old);
});

test('processed Pro Max never bypasses the existing no-downgrade lifecycle rule', async () => {
  const env = await completed('pro_max'), before = env.db.dump();
  const response = await invoke(env.handlers.checkout, { body: { plan: 'pro' } });
  assert.equal(response.statusCode, 409); assert.equal(response.body.code, 'PLAN_UNAVAILABLE');
  assert.deepEqual(env.db.dump(), before); assert.equal(env.attempts.length, 1);
});

for (const state of ['pending', 'creating', 'retryable']) {
  for (const [previous, requested] of [['pro', 'pro_max'], ['pro_max', 'pro']]) {
    test(`unresolved ${state} ${previous} -> ${requested}: fails closed without another checkout`, async () => {
      const env = fixture();
      const first = await invoke(env.handlers.checkout, { body: { plan: previous } });
      const old = env.db.read(orderPath(first.body.orderId));
      env.db.seed(orderPath(old.id), { ...old, state });
      const before = env.db.dump();
      const response = await invoke(env.handlers.checkout, { body: { plan: requested } });
      assert.equal(response.statusCode, 409); assert.equal(response.body.code, 'CHECKOUT_REVIEW');
      assert.deepEqual(env.db.dump(), before); assert.equal(env.attempts.length, 1);
    });
  }
}
for (const state of ['review_required', 'cancelled', 'expired', 'unknown']) {
  test(`non-processed ${state} cannot release the lock for either plan`, async () => {
    const env = fixture();
    const first = await invoke(env.handlers.checkout, { body: { plan: 'pro' } });
    env.db.seed(orderPath(first.body.orderId), { ...env.db.read(orderPath(first.body.orderId)), state });
    const before = env.db.dump();
    for (const plan of ['pro', 'pro_max']) {
      const response = await invoke(env.handlers.checkout, { body: { plan } });
      assert.equal(response.statusCode, 409); assert.equal(response.body.code, 'CHECKOUT_REVIEW');
    }
    assert.deepEqual(env.db.dump(), before); assert.equal(env.attempts.length, 1);
  });
}
for (const plan of ['pro', 'pro_max']) {
  test(`pending ${plan}: same-plan retries return the original order/session`, async () => {
    const env = fixture();
    const first = await invoke(env.handlers.checkout, { body: { plan } });
    const before = env.db.dump();
    for (let i = 0; i < 3; i++) {
      const retry = await invoke(env.handlers.checkout, { body: { plan } });
      assert.equal(retry.statusCode, 200); assert.deepEqual(retry.body, first.body);
    }
    assert.deepEqual(env.db.dump(), before); assert.equal(env.attempts.length, 1);
  });
  for (const state of ['creating', 'retryable']) {
    test(`recoverable ${state} ${plan}: lease and same persisted intent remain enforced`, async () => {
      const env = fixture({ failFirst: true });
      assert.equal((await invoke(env.handlers.checkout, { body: { plan } })).statusCode, 503);
      const old = env.db.read(orderPath(env.attempts[0].id));
      env.db.seed(orderPath(old.id), { ...old, state });
      const waiting = await invoke(env.handlers.checkout, { body: { plan } });
      assert.equal(waiting.statusCode, 409); assert.equal(waiting.body.code, 'CHECKOUT_IN_PROGRESS');
      env.advance(5001);
      const retry = await invoke(env.handlers.checkout, { body: { plan } });
      assert.equal(retry.statusCode, 200); assert.equal(retry.body.orderId, old.id);
      assert.equal(env.attempts.length, 2);
      assert.equal(env.attempts[1].idempotencyKey, env.attempts[0].idempotencyKey);
      assert.equal(env.attempts[1].providerRequestBody, env.attempts[0].providerRequestBody);
      assert.equal(Object.keys(env.db.dump()).filter(path => path.startsWith('payment_orders/')).length, 1);
      assert.equal((await invoke(env.handlers.checkout, { body: { plan } })).statusCode, 200);
      assert.equal(env.attempts.length, 2); assert.equal(env.db.userWrites, 0);
    });
  }
}

for (const mixed of [false, true]) {
  test(`processed history: concurrent ${mixed ? 'different' : 'same'}-plan requests create one new live intent`, async () => {
    const env = await completed(), before = env.db.dump();
    const requested = Array.from({ length: 20 }, (_, i) => mixed && i % 2 ? 'pro' : 'pro_max');
    const results = await Promise.all(requested.map(plan => invoke(env.handlers.checkout, { body: { plan } })));
    assert.ok(results.some(result => result.statusCode === 200));
    assert.ok(results.every(result => [200, 409].includes(result.statusCode)));
    const newId = env.db.read('payment_checkout_locks/owner').orderId;
    assert.notEqual(newId, env.oldId); assert.equal(env.attempts.length, 2);
    const pending = Object.values(env.db.dump()).filter(record => record.state === 'pending');
    assert.equal(pending.length, 1); assert.equal(pending[0].id, newId);
    for (let i = 0; i < results.length; i++) {
      if (results[i].statusCode === 200) assert.equal(results[i].body.orderId, newId);
      if (requested[i] !== pending[0].planId) {
        assert.equal(results[i].statusCode, 409); assert.equal(results[i].body.code, 'CHECKOUT_REVIEW');
      }
    }
    assert.ok(env.db.retries > 0); preserveHistory(env.db, before);
    assert.equal((await invoke(env.handlers.checkout, { body: { plan: pending[0].planId } })).body.orderId, newId);
    assert.equal(env.attempts.length, 2);
  });
}

for (const [label, patch] of Object.entries({ owner: { userId: 'stranger' }, mode: { mode: 'live' },
  amount: { amount: 1 }, currency: { currency: 'USD' }, plan: { plan: 'Pro Max' } })) {
  test(`processed history: invalid ${label} cannot unlock a new checkout`, async () => {
    const env = await completed();
    env.db.seed(orderPath(env.oldId), { ...env.db.read(orderPath(env.oldId)), ...patch });
    const before = env.db.dump();
    const response = await invoke(env.handlers.checkout, { body: { plan: 'pro_max' } });
    assert.equal(response.statusCode, 409); assert.equal(response.body.code, 'CHECKOUT_REVIEW');
    assert.deepEqual(env.db.dump(), before); assert.equal(env.attempts.length, 1);
  });
}
test('processed history: client terms and forged account cannot override the new purchase', async () => {
  const env = await completed(), before = env.db.dump();
  for (const body of [{ plan: 'pro_max', amount: 149900 }, { plan: 'pro_max', currency: 'USD' },
    { plan: 'pro_max', durationDays: 365 }, { plan: 'pro_max', apiRequestLimit: 5000 },
    { plan: 'pro_max', userId: 'stranger' }]) {
    const response = await invoke(env.handlers.checkout, { body });
    assert.equal(response.statusCode, body.userId ? 403 : 400);
    assert.equal(response.body.code, body.userId ? 'IDENTITY_MISMATCH' : 'PURCHASE_MISMATCH');
    assert.deepEqual(env.db.dump(), before);
  }
  assert.equal(env.attempts.length, 1);
});
test('processed history: lock commit failure leaves history and intent unchanged before provider work', async () => {
  const env = await completed(), before = env.db.dump();
  env.db.failWrite = 'payment_checkout_locks/';
  assert.equal((await invoke(env.handlers.checkout, { body: { plan: 'pro_max' } })).statusCode, 503);
  assert.deepEqual(env.db.dump(), before); assert.equal(env.attempts.length, 1);
});
