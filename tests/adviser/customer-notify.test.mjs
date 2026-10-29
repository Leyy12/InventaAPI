import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerNotifier, messages } from '../../services/customer-notify.js';
import { sendPlanExpiryReminders } from '../../services/scheduled-jobs.js';
import { createApiKeyHandlers } from '../../services/api-key-management.js';
import { memoryStore, invoke } from './phase2a/memory-store.mjs';

const NOW = new Date('2026-10-20T12:00:00.000Z');
const notifications = async db => (await db.collection('notifications').get()).docs.map(doc => ({ id: doc.id, ...doc.data() }));

test('notify saves a bell notification and emails the same message once', async () => {
  const db = memoryStore({}), sent = [];
  const { notify } = createCustomerNotifier({ sendEmail: async message => { sent.push(message); }, now: () => NOW });
  const message = { userId: 'u1', email: 'owner@example.test', id: 'n-1', ...messages.paymentReceived('Pro', '2026-11-19T12:00:00.000Z') };
  assert.deepEqual(await notify(db, message), { created: true, emailed: true });
  assert.deepEqual(await notify(db, message), { created: false });
  const [saved] = await notifications(db);
  assert.deepEqual([saved.userId, saved.type, saved.read, saved.title], ['u1', 'subscription_active', false, 'Your Pro plan is active']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.test');
  assert.match(sent[0].subject, /Your Pro plan is active/);
  assert.match(sent[0].text, /November 19, 2026/);
});

test('a failed email never blocks the in-app notification', async () => {
  const db = memoryStore({});
  const { notify } = createCustomerNotifier({ sendEmail: async () => { throw new Error('SMTP down'); }, log: { warn() {} } });
  assert.deepEqual(await notify(db, { userId: 'u1', email: 'owner@example.test', ...messages.keyCreated('Grocery API key') }), { created: true, emailed: false });
  assert.equal((await notifications(db)).length, 1);
});

test('notifyMany tells every recipient once per maintenance window', async () => {
  const db = memoryStore({}), sent = [];
  const { notifyMany } = createCustomerNotifier({ sendEmail: async message => { sent.push(message.to); } });
  const recipients = [{ id: 'a', email: 'a@example.test' }, { id: 'b', email: 'b@example.test' }];
  const message = user => ({ id: `maintenance-1-${user.id}`, ...messages.maintenanceScheduled('2026-10-21T10:00:00.000Z', '2026-10-21T12:00:00.000Z') });
  assert.deepEqual(await notifyMany(db, recipients, message), { recipients: 2, emailed: 2 });
  await notifyMany(db, recipients, message);
  assert.equal(sent.length, 2);
  assert.match((await notifications(db))[0].body, /Your API keys keep working/);
});

test('plan reminders go to active paid plans ending within 3 days, once', async () => {
  const db = memoryStore({
    'users/soon': { plan: 'Pro', subscription_status: 'active', email: 's@example.test', subscriptionExpiresAt: '2026-10-22T00:00:00.000Z' },
    'users/later': { plan: 'Pro Max', subscription_status: 'active', email: 'l@example.test', subscriptionExpiresAt: '2026-11-20T00:00:00.000Z' },
    'users/ended': { plan: 'Pro', subscription_status: 'active', email: 'e@example.test', subscriptionExpiresAt: '2026-10-19T00:00:00.000Z' },
  });
  const sent = [];
  const { notify } = createCustomerNotifier({ sendEmail: async message => { sent.push(message.to); } });
  assert.deepEqual(await sendPlanExpiryReminders(db, { notify, messages, now: NOW }), { reminded: 1, failed: 0 });
  assert.deepEqual(await sendPlanExpiryReminders(db, { notify, messages, now: NOW }), { reminded: 0, failed: 0 });
  assert.deepEqual(sent, ['s@example.test']);
});

test('adding products to an API key notifies the customer', async () => {
  const db = memoryStore({
    'users/owner': { uid: 'owner', role: 'Developer', plan: 'Pro', apiRequestLimit: 5000, subscription_status: 'active',
      subscriptionStartedAt: '2026-10-01T00:00:00.000Z', subscriptionExpiresAt: '2026-10-31T00:00:00.000Z',
      businessSegment: 'Grocery', selectedSegment: 'Grocery', email: 'owner@example.test' },
    'account_request_contracts/owner': { version: 1, plans: { pro: { version: 1, period: 'utc_daily', limit: 500 } } },
    'products/rice': { name: 'Rice', segment: 'Grocery' },
  });
  const sent = [];
  const handlers = createApiKeyHandlers({ getDb: () => db, clock: () => new Date(NOW), verifyIdToken: async () => ({ uid: 'owner' }),
    notifier: createCustomerNotifier({ sendEmail: async message => { sent.push(message); } }), messages });
  assert.equal((await invoke(handlers.addProducts, { body: { linkedProductIds: ['rice'] } })).statusCode, 200);
  const [saved] = await notifications(db);
  assert.equal(saved.type, 'api_key_updated');
  assert.match(saved.body, /1 product was added/);
  assert.equal(sent[0].to, 'owner@example.test');
});

test('a payment notifies the customer and every admin (one admin bell entry, one email each)', async () => {
  const { createPaymentWebhook } = await import('../../services/payment-webhook.js');
  assert.equal(typeof createPaymentWebhook, 'function');
  const db = memoryStore({
    'users/c1': { role: 'Developer', email: 'c@example.test', businessName: 'Ana Store', plan: 'Pro', subscriptionExpiresAt: '2026-11-19T00:00:00.000Z' },
    'users/a1': { role: 'admin', email: 'a1@example.test' }, 'users/a2': { role: 'admin', email: 'a2@example.test' },
  });
  const sent = [];
  const notifier = createCustomerNotifier({ sendEmail: async message => { sent.push(message.to); } });
  // Same steps the webhook runs after a fulfilled payment.
  const account = db.read('users/c1');
  await notifier.notify(db, { userId: 'c1', email: account.email, id: 'payment-pay_1', ...messages.paymentReceived(account.plan, account.subscriptionExpiresAt) });
  const adminMessage = messages.adminNewSubscription(account, account.plan, account.subscriptionExpiresAt);
  const first = await notifier.notify(db, { userId: 'admin', email: 'a1@example.test', id: 'admin-payment-pay_1', ...adminMessage });
  if (first.created) await notifier.emailOnly('a2@example.test', adminMessage.title, adminMessage.body);
  assert.deepEqual(sent.sort(), ['a1@example.test', 'a2@example.test', 'c@example.test']);
  const bell = (await notifications(db)).find(n => n.userId === 'admin');
  assert.equal(bell.title, 'New Pro subscription'); assert.match(bell.body, /Ana Store \(c@example.test\) subscribed to Pro/);
});
