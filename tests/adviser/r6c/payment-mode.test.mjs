import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paymentConfiguration } from '../../../services/payment-contract.js';
import { createPaymentHandlers } from '../../../services/payment-checkout.js';
import { createPaymongoCheckout } from '../../../services/paymongo-checkout.js';
import { createPaymentWebhook } from '../../../services/payment-webhook.js';
import { validateReleaseConfig, formatValidation } from '../../../scripts/validate-release-config.mjs';
import { memoryFirestore, invoke } from '../phase2b1/memory-firestore.mjs';

const now = new Date('2026-09-22T10:00:00.000Z');
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dashboardUrl = 'https://customer.r6c-fixture.net';
const credentials = mode => ({ mode, secretKey: `sk_${mode}_SYNTHETIC_ONLY`, webhookSecret: 'synthetic-opaque-secret', dashboardUrl });
const backend = (mode, nodeEnv) => ({ NODE_ENV: nodeEnv, PAYMONGO_MODE: mode,
  PAYMONGO_SECRET_KEY: credentials(mode).secretKey, PAYMONGO_WEBHOOK_SECRET: credentials(mode).webhookSecret,
  FIREBASE_AUTH_MODE: 'service_account_env', FIREBASE_PROJECT_ID: 'demo-inventa-r6c',
  FIREBASE_CLIENT_EMAIL: 'fixture@demo-inventa-r6c.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nSYNTHETIC_ONLY\n-----END PRIVATE KEY-----',
  DASHBOARD_URL: dashboardUrl, NEXT_PUBLIC_APP_URL: dashboardUrl, TZ: 'UTC' });
const validate = env => validateReleaseConfig(env, { scope: 'backend', mode: env.NODE_ENV, nodeVersion: 'v22.20.0', now });

for (const nodeEnv of ['production', 'test', 'development', undefined]) {
  for (const mode of ['test', 'live']) {
    test(`runtime ${String(nodeEnv)}: explicit ${mode} determines payment mode`, () => {
      assert.equal(paymentConfiguration({ ...credentials(mode), nodeEnv }).mode, mode);
      const wrongKey = credentials(mode === 'test' ? 'live' : 'test').secretKey;
      assert.throws(() => paymentConfiguration({ ...credentials(mode), nodeEnv, secretKey: wrongKey }), { code: 'PAYMENT_CONFIG' });
    });
  }
}
for (const mode of [undefined, '', 'TEST', 'LIVE', 'sandbox', 'test ', ' live', null]) {
  test(`runtime and validator reject missing/invalid mode ${JSON.stringify(mode)}`, () => {
    assert.throws(() => paymentConfiguration({ ...credentials('test'), mode }), { code: 'PAYMENT_CONFIG' });
    const result = validate({ ...backend('test', 'production'), PAYMONGO_MODE: mode });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(issue => issue.name === 'PAYMONGO_MODE'));
  });
}
for (const nodeEnv of ['production', 'test']) {
  for (const mode of ['test', 'live']) {
    test(`release validator: ${nodeEnv} runtime permits explicit ${mode} with matching key only`, () => {
      const env = backend(mode, nodeEnv);
      assert.equal(validate(env).ok, true);
      assert.equal(validate({ ...env, PAYMONGO_SECRET_KEY: credentials(mode === 'test' ? 'live' : 'test').secretKey }).ok, false);
    });
  }
}
for (const webhookSecret of [undefined, '', '   ', 'REPLACE_WITH_SECRET']) {
  test(`webhook secret remains mandatory: ${JSON.stringify(webhookSecret)}`, () => {
    assert.throws(() => paymentConfiguration({ ...credentials('test'), webhookSecret }), { code: 'PAYMENT_CONFIG' });
    assert.equal(validate({ ...backend('test', 'production'), PAYMONGO_WEBHOOK_SECRET: webhookSecret }).ok, false);
  });
}
test('configuration errors never disclose supplied credential values', () => {
  const secretKey = 'sk_live_PRIVATE_SENTINEL';
  const webhookSecret = 'opaque_PRIVATE_SENTINEL';
  assert.throws(() => paymentConfiguration({ ...credentials('test'), secretKey, webhookSecret }), error => {
    assert.doesNotMatch(error.message, /PRIVATE_SENTINEL/); return error.code === 'PAYMENT_CONFIG';
  });
  const result = validate({ ...backend('test', 'production'), PAYMONGO_SECRET_KEY: secretKey, PAYMONGO_WEBHOOK_SECRET: webhookSecret });
  assert.equal(result.ok, false); assert.doesNotMatch(formatValidation(result), /PRIVATE_SENTINEL/);
});
test('production sandbox retains HTTPS redirect checks and equal Customer origins', () => {
  assert.throws(() => paymentConfiguration({ ...credentials('test'), nodeEnv: 'production', dashboardUrl: 'http://localhost:3000' }));
  assert.equal(validate({ ...backend('test', 'production'), NEXT_PUBLIC_APP_URL: 'https://other.r6c-fixture.net' }).ok, false);
});

function event(mode) {
  const livemode = mode === 'live';
  return { data: { id: 'evt_r6c', type: 'event', attributes: { type: 'checkout_session.payment.paid', livemode,
    data: { id: 'cs_r6c', type: 'checkout_session', attributes: { status: 'active', livemode,
      line_items: [{ amount: 149900, currency: 'PHP', quantity: 1 }],
      payment_intent: { id: 'pi_r6c', type: 'payment_intent', attributes: { amount: 149900, currency: 'PHP', livemode, status: 'succeeded' } },
      payments: [{ id: 'pay_r6c', type: 'payment', attributes: { amount: 149900, currency: 'PHP', livemode,
        payment_intent_id: 'pi_r6c', status: 'paid', source: { type: 'gcash' }, refunds: [], disputed: false } }],
    } } } } };
}
function signed(payload, config, field = config.mode === 'test' ? 'te' : 'li') {
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(now.getTime() / 1000);
  const digest = createHmac('sha256', config.webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  return { rawBody, headers: { 'paymongo-signature': `t=${timestamp},${field}=${digest}` } };
}
async function setup(mode, nodeEnv) {
  const config = paymentConfiguration({ ...credentials(mode), nodeEnv });
  const db = memoryFirestore({ 'users/owner': { uid: 'owner', role: 'Developer', plan: 'Free', apiRequestLimit: 50 } });
  let calls = 0;
  const handlers = createPaymentHandlers({ getDb: () => db, getConfig: () => config, clock: () => now,
    newOrderId: () => orderId, verifyIdToken: async () => ({ uid: 'owner' }),
    createSession: args => createPaymongoCheckout({ ...args, request: async (url, options) => {
      calls++;
      assert.equal(url, 'https://api.paymongo.com/v1/checkout_sessions');
      assert.equal(Buffer.from(options.headers.Authorization.slice(6), 'base64').toString(), `${config.secretKey}:`);
      const payload = JSON.parse(options.body).data.attributes;
      assert.deepEqual(payload.line_items.map(({ amount, currency, quantity }) => ({ amount, currency, quantity })), [{ amount: 149900, currency: 'PHP', quantity: 1 }]);
      assert.deepEqual(payload.payment_method_types, ['gcash']);
      assert.equal(payload.success_url, `${dashboardUrl}/dashboard?payment=success&order=${orderId}`);
      assert.equal(payload.cancel_url, `${dashboardUrl}/?payment=cancelled`);
      return { ok: true, json: async () => ({ data: { id: 'cs_r6c', type: 'checkout_session', attributes: {
        status: 'active', livemode: mode === 'live', payment_intent: { id: 'pi_r6c' }, checkout_url: 'https://checkout.paymongo.com/r6c' } } }) };
    } }),
  });
  assert.equal((await invoke(handlers.checkout)).statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(db.read(`payment_orders/${orderId}`).mode, mode);
  assert.equal(db.read(`payment_orders/${orderId}`).durationDays, 30);
  const webhook = createPaymentWebhook({ getDb: () => db, getConfig: () => config, clock: () => now });
  return { db, config, webhook };
}
for (const [mode, nodeEnv] of [['test', 'production'], ['live', 'test']]) {
  test(`${nodeEnv}/${mode}: mocked checkout and signed webhook fulfill exactly once`, async () => {
    const env = await setup(mode, nodeEnv);
    const input = signed(event(mode), env.config);
    assert.equal((await invoke(env.webhook, input)).body.processed, true);
    assert.equal(env.db.read('users/owner').plan, 'Pro');
    assert.equal((await invoke(env.webhook, input)).body.duplicate, true);
    assert.equal(env.db.userWrites, 1);
  });
  const mutations = {
    'opposite signature only': input => { input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(mode === 'test' ? ',te=' : ',li=', mode === 'test' ? ',li=' : ',te='); },
    'tampered raw body': input => { input.rawBody += ' '; },
  };
  for (const [label, mutate] of Object.entries(mutations)) test(`${mode}: ${label} cannot fulfill`, async () => {
    const env = await setup(mode, nodeEnv); const before = env.db.dump();
    const input = signed(event(mode), env.config); mutate(input);
    assert.equal((await invoke(env.webhook, input)).statusCode, 403);
    assert.deepEqual(env.db.dump(), before);
  });
  for (const field of ['event', 'session', 'payment', 'intent']) test(`${mode}: opposite ${field} livemode cannot fulfill`, async () => {
    const env = await setup(mode, nodeEnv); const before = env.db.dump(); const payload = event(mode);
    const session = payload.data.attributes.data.attributes;
    const target = { event: payload.data.attributes, session, payment: session.payments[0].attributes, intent: session.payment_intent.attributes }[field];
    target.livemode = mode !== 'live';
    assert.equal((await invoke(env.webhook, signed(payload, env.config))).statusCode, 409);
    assert.deepEqual(env.db.dump(), before);
  });
  for (const field of ['amount', 'currency', 'order']) test(`${mode}: mismatched ${field} cannot fulfill`, async () => {
    const env = await setup(mode, nodeEnv); const payload = event(mode);
    if (field === 'order') {
      const path = `payment_orders/${orderId}`;
      env.db.seed(path, { ...env.db.read(path), paymentIntentId: 'pi_other' });
    } else payload.data.attributes.data.attributes.payments[0].attributes[field] = field === 'amount' ? 1 : 'USD';
    const before = env.db.dump();
    assert.equal((await invoke(env.webhook, signed(payload, env.config))).statusCode, 409);
    assert.deepEqual(env.db.dump(), before);
  });
  test(`${mode}: unsupported signed event never grants entitlement`, async () => {
    const env = await setup(mode, nodeEnv); const before = env.db.dump(); const payload = event(mode);
    payload.data.attributes.type = 'checkout_session.payment.failed';
    assert.equal((await invoke(env.webhook, signed(payload, env.config))).body.processed, false);
    assert.deepEqual(env.db.dump(), before);
  });
}
test('network and Firebase SDK are unavailable to this suite', async () => {
  assert.throws(() => globalThis['fetch']('https://api.paymongo.com'), /External I\/O blocked/);
  await assert.rejects(import('node:https'), /prohibit/);
  await assert.rejects(import('firebase-admin'), /outside/);
});
