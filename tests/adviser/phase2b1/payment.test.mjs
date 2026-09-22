import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PRO_PURCHASE, paymentConfiguration } from '../../../services/payment-contract.js';
import { createPaymentHandlers } from '../../../services/payment-checkout.js';
import { checkoutPayload, createPaymongoCheckout } from '../../../services/paymongo-checkout.js';
import { createPaymentWebhook } from '../../../services/payment-webhook.js';
import { memoryFirestore, invoke } from './memory-firestore.mjs';

const now = new Date('2026-09-20T10:00:00.000Z');
const config = { mode: 'test', secretKey: 'sk_test_syntheticOnly', webhookSecret: 'synthetic-signing-secret-not-real', dashboardUrl: 'https://customer.example' };
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orderPath = `payment_orders/${orderId}`;
const paymentPath = 'transactions/paymongo_test_pay_abc123';
const customer = { uid: 'owner', role: 'Developer', plan: 'Free', apiRequestLimit: 50 };
const providerOrder = () => ({ id: orderId, mode: 'test', idempotencyKey: `checkout-test-${orderId}`,
  providerRequestBody: JSON.stringify(checkoutPayload({ id: orderId }, config.dashboardUrl)) });
function setup(options = {}) {
  const db = memoryFirestore({ 'users/owner': customer, 'users/stranger': { ...customer, uid: 'stranger' } });
  let calls = 0, dbCalls = 0;
  const reports = [];
  const getDb = () => { dbCalls++; return db; };
  const getConfig = () => config;
  const session = { sessionId: 'cs_abc123', paymentIntentId: 'pi_abc123', checkoutUrl: 'https://checkout.paymongo.com/abc123' };
  const handlers = createPaymentHandlers({ getDb, getConfig, clock: () => now, newOrderId: () => orderId,
    verifyIdToken: async (token, revoked) => {
      assert.equal(revoked, true);
      if (token !== 'owner-token') throw new Error('invalid');
      return { uid: 'owner' };
    },
    createSession: async ({ order }) => {
      calls++;
      assert.equal(db.read(orderPath).state, 'creating', 'durable order before provider request');
      assert.equal(order.userId, 'owner');
      if (options.providerFailure) throw new Error('uncertain provider result');
      if (options.bindingFailure) db.failWrite = 'payment_sessions';
      return session;
    }, report: issue => reports.push(issue), ...options.handlers });
  const webhook = createPaymentWebhook({ getDb, getConfig, clock: () => now, report: issue => reports.push(issue) });
  return { db, ...handlers, webhook, session, reports, calls: () => calls, dbCalls: () => dbCalls };
}
async function ready() {
  const env = setup();
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  return env;
}
function fixture() {
  return { data: { id: 'evt_abc123', type: 'event', attributes: {
    type: 'checkout_session.payment.paid', livemode: false,
    data: { id: 'cs_abc123', type: 'checkout_session', attributes: {
      status: 'active', livemode: false, reference_number: orderId,
      metadata: { userId: 'stranger', email: 'untrusted@example.test', plan: 'Enterprise' },
      line_items: [{ amount: 149900, currency: 'PHP', quantity: 1 }],
      payment_intent: { id: 'pi_abc123', type: 'payment_intent', attributes: { amount: 149900, currency: 'PHP', livemode: false, status: 'succeeded' } },
      payments: [{ id: 'pay_abc123', type: 'payment', attributes: { amount: 149900, currency: 'PHP', livemode: false,
        payment_intent_id: 'pi_abc123', status: 'paid', source: { type: 'gcash' }, refunds: [], disputed: false } }],
    } },
  } } };
}
function signed(event = fixture(), timestamp = Math.floor(now.getTime() / 1000), secret = config.webhookSecret) {
  const rawBody = JSON.stringify(event);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return { rawBody, headers: { 'paymongo-signature': `t=${timestamp},te=${digest},li=` } };
}
const attrs = event => event.data.attributes.data.attributes;
const unchanged = (env, before) => { assert.deepEqual(env.db.dump(), before); assert.equal(env.db.userWrites, 0); };

for (const [label, input] of Object.entries({ missing: { token: null }, malformed: { headers: { authorization: 'Bearer a b' } }, invalid: { token: 'bad' } })) {
  for (const operation of ['checkout', 'status']) test(`${operation}: ${label} authentication rejected before database access`, async () => {
    const env = setup();
    assert.equal((await invoke(env[operation], input)).statusCode, 401);
    assert.equal(env.calls(), 0); assert.equal(env.dbCalls(), 0);
  });
}
test('checkout: valid Customer and matching legacy UID bind only decoded UID', async () => {
  const env = setup();
  const response = await invoke(env.checkout, { body: { userId: 'owner', userEmail: 'stranger@example.test' } });
  assert.equal(response.statusCode, 200); assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(env.db.read(orderPath).userId, 'owner');
  assert.equal(env.db.read(orderPath).amount, 149900); assert.equal(env.calls(), 1);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').orderId, orderId);
});
for (const body of [{ userId: 'stranger' }, { amount: 1 }, { currency: 'USD' }, { plan: 'Enterprise' }, { durationDays: 999 }, { apiRequestLimit: -1 }]) {
  test(`checkout: client terms cannot change authority ${JSON.stringify(body)}`, async () => {
    const env = setup();
    assert.ok((await invoke(env.checkout, { body })).statusCode >= 400);
    assert.equal(env.calls(), 0); assert.equal(env.db.read(orderPath), undefined);
  });
}
test('checkout: repeated and concurrent attempts create only one provider session', async () => {
  const env = setup();
  const results = await Promise.all(Array.from({ length: 15 }, () => invoke(env.checkout)));
  assert.ok(results.every(result => [200, 409].includes(result.statusCode)));
  assert.equal((await invoke(env.checkout)).body.sessionId, env.session.sessionId);
  assert.equal(env.calls(), 1); assert.ok(env.db.retries > 0);
});
for (const fault of ['providerFailure', 'bindingFailure']) test(`checkout: ${fault} holds future attempts, no grant`, async () => {
  const env = setup({ [fault]: true });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.db.read(orderPath).state, 'retryable');
  assert.equal((await invoke(env.checkout)).statusCode, 409);
  assert.equal(env.calls(), 1); assert.equal(env.db.userWrites, 0);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123'), undefined);
  assert.ok(env.reports.length);
  assert.ok((await invoke(env.webhook, signed())).statusCode >= 400);
});
test('checkout: intent-store failure makes no provider call', async () => {
  const env = setup(); env.db.failCommit = true;
  assert.equal((await invoke(env.checkout)).statusCode, 503); assert.equal(env.calls(), 0);
});
test('checkout: unexpected existing session binding cannot be overwritten', async () => {
  const env = setup(); env.db.seed('payment_sessions/test_cs_abc123', { orderId: 'another' });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').orderId, 'another');
});
test('checkout: unresolved Pro, unknown plans and non-customers fail closed', async () => {
  for (const override of [{ plan: 'Enterprise' }, { role: 'Admin' }, { uid: 'stranger' }, { plan: 'Pro' },
    { plan: 'Pro', subscriptionExpiresAt: '2099-01-01' }]) {
    const env = setup(); env.db.seed('users/owner', { ...customer, ...override });
    assert.ok((await invoke(env.checkout)).statusCode >= 400); assert.equal(env.calls(), 0);
  }
});
test('status: own account succeeds; forged UID and other order are denied', async () => {
  const env = await ready();
  assert.equal((await invoke(env.status)).body.plan, 'Free');
  assert.equal((await invoke(env.status, { query: { userId: 'stranger' } })).statusCode, 403);
  env.db.seed(orderPath, { ...env.db.read(orderPath), userId: 'stranger' });
  assert.equal((await invoke(env.status, { query: { orderId } })).statusCode, 404);
});
test('status: redirect/order before fulfillment is not payment proof', async () => {
  const env = await ready();
  assert.equal((await invoke(env.status, { query: { orderId, payment: 'success' } })).body.paymentConfirmed, false);
  await invoke(env.webhook, signed());
  assert.equal((await invoke(env.status, { query: { orderId } })).body.paymentConfirmed, true);
  assert.equal((await invoke(env.status)).body.paymentConfirmed, false);
});
test('status: Phase 2B2 reports effective Free without mutating the account', async () => {
  const env = setup(); env.db.seed('users/owner', { ...customer, plan: 'Pro', subscriptionExpiresAt: '2020-01-01' });
  assert.equal((await invoke(env.status)).body.expired, true);
  assert.equal(env.db.read('users/owner').plan, 'Pro');
  assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2020-01-01');
});

test('provider client: fixed v1 URL, Basic secret username, fixed terms and server reference', async () => {
  let captured;
  const request = async (url, options) => {
    captured = { url, ...options };
    return { ok: true, json: async () => ({ data: { id: 'cs_abc123', type: 'checkout_session', attributes: {
      livemode: false, status: 'active', payment_intent: { id: 'pi_abc123' }, checkout_url: 'https://checkout.paymongo.com/abc123' } } }) };
  };
  await createPaymongoCheckout({ request, config, order: providerOrder() });
  assert.equal(captured.url, 'https://api.paymongo.com/v1/checkout_sessions');
  assert.equal(captured.headers.Authorization, `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`);
  assert.equal(captured.headers['Idempotency-Key'], `checkout-test-${orderId}`);
  assert.equal(captured.redirect, 'error');
  const payload = JSON.parse(captured.body).data.attributes;
  assert.equal(payload.reference_number, orderId); assert.equal(payload.metadata.userId, undefined);
  assert.equal(payload.line_items[0].amount, PRO_PURCHASE.amount);
  assert.equal(payload.line_items[0].currency, 'PHP');
  assert.equal(new URL(payload.success_url).searchParams.get('order'), orderId);
});
for (const override of [{ livemode: true }, { status: 'expired' }, { payment_intent: null }, { checkout_url: 'https://evil.example' },
  { checkout_url: 'https://checkout.paymongo.com.evil.example' }, { checkout_url: 'javascript:alert(1)' }]) {
  test(`provider client: malformed or wrong-mode response ${JSON.stringify(override)}`, async () => {
    await assert.rejects(createPaymongoCheckout({ config, order: providerOrder(), request: async () => ({ ok: true,
      json: async () => ({ data: { id: 'cs_abc123', type: 'checkout_session', attributes: {
        livemode: false, status: 'active', payment_intent: { id: 'pi_abc123' }, checkout_url: 'https://checkout.paymongo.com/abc', ...override } } }) }) }));
  });
}
for (const [secretKey, mode, accepted] of [['sk_test_synthetic', 'test', true], ['sk_live_synthetic', 'live', true],
  ['sk_test_synthetic', 'live', false], ['sk_live_synthetic', 'test', false], ['', 'test', false]]) {
  test(`configuration: ${mode}/${secretKey.split('_')[1] || 'missing'} mode`, () => {
    const action = () => paymentConfiguration({ ...config, secretKey, mode });
    if (accepted) assert.ok(action().mode); else assert.throws(action);
  });
}
test('signature: valid raw fixture grants only stored owner; body/metadata ignored', async () => {
  const env = await ready();
  const stranger = env.db.read('users/stranger');
  const response = await invoke(env.webhook, { ...signed(), body: { userId: 'stranger' } });
  assert.equal(response.statusCode, 200); assert.equal(response.body.duplicate, false);
  assert.equal(env.db.read('users/owner').plan, 'Pro');
  assert.equal(env.db.read('users/owner').apiRequestLimit, 5000);
  assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2026-10-20T10:00:00.000Z');
  assert.equal(env.db.read('users/owner').lastSubscribedAt, now.toISOString());
  assert.deepEqual(env.db.read('users/stranger'), stranger);
  assert.equal(env.db.read(paymentPath).status, 'paid');
});
for (const [name, mutate] of Object.entries({
  missing: input => { input.headers = {}; }, invalid: input => { input.headers['paymongo-signature'] = 't=1,te=bad'; },
  tampered: input => { input.rawBody += ' '; }, duplicate: input => { input.headers['paymongo-signature'] += ',t=1'; },
  noRaw: input => { delete input.rawBody; }, wrongMode: input => { input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(',li=', '').replace(',te=', ',te=,li='); },
})) test(`signature: ${name} rejected without database access`, async () => {
  const env = setup(); const input = signed(); mutate(input);
  assert.equal((await invoke(env.webhook, input)).statusCode, 403); assert.equal(env.dbCalls(), 0);
});
for (const timestamp of [1, Math.floor(now.getTime() / 1000) + 301, 'NaN', '-123', '1e9']) test(`signature: timestamp ${timestamp} rejected`, async () => {
  const env = setup(); assert.equal((await invoke(env.webhook, signed(fixture(), timestamp))).statusCode, 403);
  assert.equal(env.dbCalls(), 0);
});
for (const [name, mutate] of Object.entries({
  failed: e => { attrs(e).payments[0].attributes.status = 'failed'; },
  pending: e => { attrs(e).payments[0].attributes.status = 'pending'; },
  expired: e => { attrs(e).status = 'expired'; }, cancelled: e => { attrs(e).status = 'cancelled'; },
  unknownState: e => { attrs(e).status = 'paid'; }, noPayment: e => { attrs(e).payments = []; },
  multiplePaid: e => { attrs(e).payments.push(structuredClone(attrs(e).payments[0])); },
  wrongAmount: e => { attrs(e).payments[0].attributes.amount = 1; },
  wrongCurrency: e => { attrs(e).payments[0].attributes.currency = 'USD'; },
  wrongIntentAmount: e => { attrs(e).payment_intent.attributes.amount = 1; },
  wrongIntentState: e => { attrs(e).payment_intent.attributes.status = 'processing'; },
  wrongIntentId: e => { attrs(e).payments[0].attributes.payment_intent_id = 'pi_other'; },
  wrongEventMode: e => { e.data.attributes.livemode = true; },
  wrongSessionMode: e => { attrs(e).livemode = true; },
  wrongPaymentMode: e => { attrs(e).payments[0].attributes.livemode = true; },
  missingPaymentMode: e => { delete attrs(e).payments[0].attributes.livemode; },
  wrongIntentMode: e => { attrs(e).payment_intent.attributes.livemode = true; },
  wrongLineItems: e => { attrs(e).line_items[0].quantity = 2; },
  unknownSession: e => { e.data.attributes.data.id = 'cs_unknown'; },
  invalidPaymentId: e => { attrs(e).payments[0].id = 'pay_bad/path'; },
  missingEventId: e => { delete e.data.id; },
  refunded: e => { attrs(e).payments[0].attributes.refunds = [{ id: 'ref_synthetic' }]; },
  disputed: e => { attrs(e).payments[0].attributes.disputed = true; },
  wrongMethod: e => { attrs(e).payments[0].attributes.source.type = 'card'; },
})) test(`payment: ${name} cannot grant`, async () => {
  const env = await ready(); const before = env.db.dump(); const event = fixture(); mutate(event);
  assert.ok((await invoke(env.webhook, signed(event))).statusCode >= 400); unchanged(env, before);
});
for (const override of [{ sessionId: 'cs_other' }, { paymentIntentId: 'pi_other' }, { state: 'cancelled' }, { state: 'expired' },
  { state: 'review_required' }, { plan: 'Enterprise' }, { amount: 1 }, { currency: 'USD' }, { userId: 'stranger' }, { durationDays: 365 }]) {
  test(`order: invalid binding/policy ${JSON.stringify(override)}`, async () => {
    const env = await ready(); env.db.seed(orderPath, { ...env.db.read(orderPath), ...override }); const before = env.db.dump();
    assert.ok((await invoke(env.webhook, signed())).statusCode >= 400); unchanged(env, before);
  });
}
test('idempotency: sequential, concurrent and different-event retries yield one effect', async () => {
  const env = await ready();
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => {
    const event = fixture(); if (i % 2) event.data.id = `evt_retry${i}`;
    return invoke(env.webhook, signed(event));
  }));
  assert.ok(responses.every(response => response.statusCode === 200));
  assert.equal(env.db.userWrites, 1); assert.ok(env.db.retries > 0);
  const account = env.db.read('users/owner');
  const later = createPaymentWebhook({ getDb: () => env.db, getConfig: () => config, clock: () => new Date(now.getTime() + 86400000) });
  assert.equal((await invoke(later, signed(fixture(), Math.floor(now.getTime() / 1000) + 86400))).statusCode, 200);
  assert.deepEqual(env.db.read('users/owner'), account); assert.equal(env.db.userWrites, 1);
});
test('idempotency: second payment on consumed checkout cannot extend term', async () => {
  const env = await ready(); await invoke(env.webhook, signed()); const before = env.db.dump();
  const event = fixture(); event.data.id = 'evt_other'; attrs(event).payments[0].id = 'pay_other';
  assert.equal((await invoke(env.webhook, signed(event))).statusCode, 409); assert.deepEqual(env.db.dump(), before);
});
for (const collection of ['payment_events', 'transactions', 'payment_orders', 'payment_sessions', 'users']) test(`transaction: ${collection} read failure cannot grant`, async () => {
  const env = await ready(); env.db.failRead = collection; const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 503); unchanged(env, before);
});
for (const collection of ['payment_events', 'transactions', 'payment_orders', 'users']) test(`transaction: ${collection} write failure is atomic`, async () => {
  const env = await ready(); env.db.failWrite = collection; const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 503); unchanged(env, before);
});
test('transaction: total commit failure then retry grants once', async () => {
  const env = await ready(); env.db.failCommit = true; const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 503); unchanged(env, before);
  env.db.failCommit = false; assert.equal((await invoke(env.webhook, signed())).statusCode, 200);
  assert.equal(env.db.userWrites, 1);
});
test('uniqueness: payment/event records for different orders cannot be reused', async () => {
  for (const path of [paymentPath, 'payment_events/test_evt_abc123']) {
    const env = await ready(); env.db.seed(path, { orderId: 'other', status: 'paid' }); const before = env.db.dump();
    assert.equal((await invoke(env.webhook, signed())).statusCode, 409); unchanged(env, before);
  }
});
test('missing account cannot be recreated by a valid payment', async () => {
  const env = await ready(); env.db.remove('users/owner'); const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 403); unchanged(env, before);
});
test('historical: metadata and legacy success record cannot synthesize a new order/grant', async () => {
  const env = setup(); env.db.seed('transactions/legacy', { userId: 'owner', status: 'paid', webhookEventId: 'evt_abc123' });
  const before = env.db.dump(); assert.equal((await invoke(env.webhook, signed())).statusCode, 409); unchanged(env, before);
});
test('historical: generic payment.paid cannot be acknowledged as fulfilled', async () => {
  const env = setup(); const event = fixture(); event.data.attributes.type = 'payment.paid';
  event.data.attributes.data = attrs(fixture()).payments[0];
  assert.equal((await invoke(env.webhook, signed(event))).statusCode, 409); assert.equal(env.dbCalls(), 0);
});

test('configuration: opaque signing secret has no invented prefix or minimum length', () => {
  assert.equal(paymentConfiguration({ ...config, nodeEnv: 'test', webhookSecret: 'opaque' }).mode, 'test');
  for (const webhookSecret of ['', '   ', 'whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET']) {
    assert.throws(() => paymentConfiguration({ ...config, nodeEnv: 'test', webhookSecret }));
  }
});
test('configuration: live checkout rejects missing/unsafe redirect configuration', () => {
  for (const dashboardUrl of ['', 'javascript:alert(1)', 'http://customer.example', 'https://localhost', 'https://user:pass@customer.example']) {
    assert.throws(() => paymentConfiguration({ ...config, mode: 'live', secretKey: 'sk_live_synthetic', nodeEnv: 'production', dashboardUrl }));
  }
});
test('signature: valid live fixture requires live header and all matching resource modes', async () => {
  const env = await ready(); const event = fixture(); event.data.attributes.livemode = true;
  for (const object of [attrs(event), attrs(event).payment_intent.attributes, attrs(event).payments[0].attributes]) object.livemode = true;
  env.db.seed(orderPath, { ...env.db.read(orderPath), mode: 'live' });
  env.db.seed('payment_sessions/live_cs_abc123', { ...env.db.read('payment_sessions/test_cs_abc123'), mode: 'live' });
  const handler = createPaymentWebhook({ getDb: () => env.db, getConfig: () => ({ ...config, mode: 'live' }), clock: () => now });
  const input = signed(event); input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(',li=', '').replace(',te=', ',te=,li=');
  assert.equal((await invoke(handler, input)).statusCode, 200); assert.equal(env.db.userWrites, 1);
});
test('signature: nonhex suffix and signed invalid JSON fail before database', async () => {
  const env = setup(); const input = signed(); input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(',li=', 'zz,li=');
  assert.equal((await invoke(env.webhook, input)).statusCode, 403);
  const timestamp = Math.floor(now.getTime() / 1000);
  const rawBody = '{invalid';
  const digest = createHmac('sha256', config.webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  assert.equal((await invoke(env.webhook, { rawBody, headers: { 'paymongo-signature': `t=${timestamp},te=${digest}` } })).statusCode, 400);
  assert.equal(env.dbCalls(), 0);
});
test('checkout: binding and anomaly-store outage keeps durable creating hold', async () => {
  const env = setup({ handlers: { createSession: async () => { env.db.failCommit = true; return env.session; } } });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.db.read(orderPath).state, 'creating');
  assert.ok(env.reports.some(issue => issue.code === 'ORPHAN_RECORD_UNAVAILABLE'));
  env.db.failCommit = false;
  assert.equal((await invoke(env.checkout)).statusCode, 409); assert.equal(env.db.userWrites, 0);
});
test('payment: metadata and merchant reference are neither required nor ownership authority', async () => {
  const env = await ready(); const event = fixture(); delete attrs(event).metadata; attrs(event).reference_number = 'untrusted-other-order';
  assert.equal((await invoke(env.webhook, signed(event))).statusCode, 200);
  assert.equal(env.db.read('users/owner').plan, 'Pro'); assert.equal(env.db.read('users/stranger').plan, 'Free');
});

// Provider model caches results by API-key scope + idempotency key, rejects
// changed bytes, and can lose a response AFTER creating the provider object.
function recoveryHarness() {
  const db = memoryFirestore({ 'users/owner': customer });
  const cache = new Map(); const requests = []; let creations = 0;
  let instant = now.getTime(); let settings = { ...config }; let loseResponse = true; let failBefore = false;
  const request = async (url, options) => {
    const order = Object.values(db.dump()).find(value => value.idempotencyKey === options.headers['Idempotency-Key']);
    assert.ok(order, 'key persisted before provider call'); assert.equal(order.providerRequestBody, options.body);
    requests.push({ key: options.headers['Idempotency-Key'], body: options.body });
    if (failBefore) { failBefore = false; throw new Error('network failed before delivery'); }
    const key = `${options.headers.Authorization}/${options.headers['Idempotency-Key']}`;
    if (!cache.has(key)) {
      creations++;
      cache.set(key, { body: options.body, data: { id: `cs_recover${creations}`, type: 'checkout_session', attributes: {
        status: 'active', livemode: false, payment_intent: { id: `pi_recover${creations}` },
        checkout_url: `https://checkout.paymongo.com/recover${creations}` } } });
    }
    assert.equal(cache.get(key).body, options.body, 'provider rejects changed replay parameters');
    if (loseResponse) { loseResponse = false; throw new Error('response lost after create'); }
    return { ok: true, json: async () => ({ data: cache.get(key).data }) };
  };
  const handlers = createPaymentHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }),
    getConfig: () => settings, clock: () => new Date(instant), createSession: args => createPaymongoCheckout({ ...args, request }) });
  return { db, ...handlers, requests, creations: () => creations, advance: ms => { instant += ms; },
    configure: change => { settings = { ...settings, ...change }; },
    setFailure: (before, after) => { failBefore = before; loseResponse = after; },
    order: () => Object.values(db.dump()).find(value => value.idempotencyKey) };
}
for (const window of ['before-delivery', 'response-lost']) test(`provider idempotency: ${window} recovers same persisted attempt`, async () => {
  const env = recoveryHarness(); if (window === 'before-delivery') env.setFailure(true, false);
  assert.equal((await invoke(env.checkout, { body: { idempotencyKey: 'browser-forged' } })).statusCode, 503);
  const original = env.order(); assert.equal(original.state, 'retryable'); assert.notEqual(original.idempotencyKey, 'browser-forged');
  env.configure({ dashboardUrl: 'https://changed.example' }); env.advance(5001);
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  assert.equal(env.creations(), 1); assert.equal(env.requests[0].key, env.requests[1].key);
  assert.equal(env.requests[0].body, env.requests[1].body); assert.equal(env.order().userId, 'owner');
  assert.equal(env.db.userWrites, 0);
});
test('provider idempotency: binding outage recovers cached session, no unbound grant', async () => {
  const env = recoveryHarness(); env.setFailure(false, false); env.db.failWrite = 'payment_sessions';
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.order().state, 'retryable'); assert.equal(env.db.read('payment_sessions/test_cs_recover1'), undefined);
  assert.equal(env.db.userWrites, 0); env.db.failWrite = null; env.advance(5001);
  assert.equal((await invoke(env.checkout)).statusCode, 200); assert.equal(env.creations(), 1);
  assert.equal(env.order().sessionId, 'cs_recover1');
});
test('provider idempotency: concurrent recovery makes one replay; lost browser response reuses bound URL', async () => {
  const env = recoveryHarness(); await invoke(env.checkout); env.advance(5001);
  const results = await Promise.all(Array.from({ length: 20 }, () => invoke(env.checkout)));
  assert.ok(results.every(result => [200, 409].includes(result.statusCode)));
  assert.equal(env.creations(), 1); assert.equal(env.requests.length, 2);
  assert.equal((await invoke(env.checkout)).body.sessionId, 'cs_recover1'); assert.equal(env.requests.length, 2);
});
test('provider idempotency: lease survives total failure; retry after lease recovers', async () => {
  const env = recoveryHarness(); env.db.failWrite = 'payment_orders';
  assert.equal((await invoke(env.checkout)).statusCode, 503); assert.equal(env.requests.length, 0);
  env.db.failWrite = null; await invoke(env.checkout);
  const original = env.order(); env.db.seed(`payment_orders/${original.id}`, { ...original, state: 'creating', retryAfter: new Date(now.getTime() + 60000).toISOString() });
  assert.equal((await invoke(env.checkout)).statusCode, 409);
  env.advance(60001); assert.equal((await invoke(env.checkout)).statusCode, 200); assert.equal(env.creations(), 1);
});
for (const condition of ['expired', 'rotated-key', 'mode-changed', 'missing-key', 'clock-backwards']) test(`provider idempotency: ${condition} cannot replay/create duplicate`, async () => {
  const env = recoveryHarness(); await invoke(env.checkout); env.advance(5001);
  if (condition === 'expired') env.advance(24 * 60 * 60 * 1000);
  if (condition === 'rotated-key') env.configure({ secretKey: 'sk_test_rotated' });
  if (condition === 'mode-changed') env.configure({ mode: 'live', secretKey: 'sk_live_synthetic' });
  if (condition === 'clock-backwards') env.advance(-60000);
  if (condition === 'missing-key') { const order = env.order(); env.db.seed(`payment_orders/${order.id}`, { ...order, idempotencyKey: null }); }
  assert.equal((await invoke(env.checkout)).statusCode, 409); assert.equal(env.requests.length, 1); assert.equal(env.db.userWrites, 0);
});
test('provider idempotency: different logical orders use different server-generated keys', async () => {
  const first = recoveryHarness(); const second = recoveryHarness();
  await invoke(first.checkout); await invoke(second.checkout);
  assert.notEqual(first.order().id, second.order().id); assert.notEqual(first.order().idempotencyKey, second.order().idempotencyKey);
});
test('subscription status: forged UID cannot downgrade another expired account', async () => {
  const env = setup(); env.db.seed('users/stranger', { ...customer, uid: 'stranger', plan: 'Pro', subscriptionExpiresAt: '2020-01-01' });
  const before = env.db.dump(); assert.equal((await invoke(env.status, { query: { userId: 'stranger' } })).statusCode, 403);
  unchanged(env, before);
});
test('webhook response compatibility: processed/reason fields remain for success, duplicate and ignored events', async () => {
  const env = await ready(); assert.equal((await invoke(env.webhook, signed())).body.processed, true);
  assert.equal((await invoke(env.webhook, signed())).body.reason, 'duplicate');
  for (const type of ['payment.failed', 'checkout_session.payment.failed', 'other.event']) {
    const event = fixture(); event.data.attributes.type = type;
    const result = await invoke(env.webhook, signed(event)); assert.equal(result.body.processed, false);
    if (type.endsWith('failed')) assert.equal(result.body.reason, 'failed');
  }
});
test('checkout recovery: delayed former lease cannot overwrite a newly bound session', async () => {
  let instant = now.getTime(); let releaseFirst; let started;
  const reachedProvider = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const env = setup({ handlers: { clock: () => new Date(instant), createSession: async () => {
    calls++;
    if (calls === 1) { started(); return new Promise(resolve => { releaseFirst = resolve; }); }
    return env.session;
  } } });
  const first = invoke(env.checkout); await reachedProvider;
  instant += 60001;
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  releaseFirst(env.session); assert.equal((await first).statusCode, 503);
  assert.equal(env.db.read(orderPath).state, 'pending');
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').orderId, orderId);
});
test('checkout recovery: exact conservative retention boundary refuses another provider POST', async () => {
  const env = recoveryHarness(); await invoke(env.checkout); env.advance(23 * 60 * 60 * 1000);
  assert.equal((await invoke(env.checkout)).statusCode, 409); assert.equal(env.requests.length, 1);
});
