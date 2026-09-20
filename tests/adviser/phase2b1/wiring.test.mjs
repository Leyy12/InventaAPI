import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
test('route wiring uses revocation-aware Admin Auth and isolated checkout/webhook services', () => {
  const checkout = source('routes/checkout.js');
  assert.match(checkout, /getAuth\(\)\.verifyIdToken\(token, checkRevoked\)/u);
  assert.match(checkout, /router\.post\('\/create-gcash', handlers\.checkout\)/u);
  assert.match(checkout, /router\.get\('\/subscription-status', handlers\.status\)/u);
  assert.match(source('routes/webhooks.js'), /createPaymentWebhook/u);
  assert.doesNotMatch(source('routes/webhooks.js'), /metadata|fetchCheckoutSessionMetadata/u);
});
test('raw body capture precedes webhook route and regular JSON parsing', () => {
  const server = source('server.js');
  assert.match(server, /req\.rawBody = buf\.toString\('utf8'\)/u);
  assert.ok(server.indexOf('req.rawBody') < server.indexOf("app.use('/api/webhooks', webhooksRouter)"));
  assert.ok(server.indexOf('req.rawBody') < server.indexOf("app.use(express.json({ limit: '10mb'"));
});
test('frontend sends bearer tokens without UID authority; backend confirmation gates success', () => {
  const checkout = source('dashboard/src/components/subscription/SubscriptionModal.tsx');
  const status = source('dashboard/src/app/dashboard/page.tsx');
  for (const file of [checkout, status]) assert.match(file, /Authorization: `Bearer \$\{token\}`/u);
  assert.doesNotMatch(checkout, /userId: user.uid/u);
  assert.match(status, /result\.paymentConfirmed === true/u);
  assert.match(status, /subscription-status\?orderId=/u);
  assert.doesNotMatch(status, /force the upgrade|Payment received/u);
});
test('new authority collections and subscription fields are client-protected', () => {
  const rules = source('firestore.rules');
  for (const collection of ['payment_orders', 'payment_sessions', 'payment_checkout_locks', 'payment_events']) {
    assert.ok(rules.includes(`match /${collection}/{id} { allow read, write: if false; }`));
  }
  assert.match(rules, /affectedKeys\(\)\.hasAny\(\[\s*'subscriptionExpiresAt', 'subscription_status', 'lastSubscribedAt'/u);
});
test('external I/O APIs are disabled in the isolated test process', async () => {
  assert.throws(() => globalThis['fetch']('https://api.paymongo.com/v1/checkout_sessions'), /External I\/O blocked/u);
  assert.throws(() => new WebSocket('wss://example.test'), /External I\/O blocked/u);
  await assert.rejects(import('node:https'), /prohibit/u);
  await assert.rejects(import('firebase-admin'), /outside/u);
});
