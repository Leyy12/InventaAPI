import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { memoryStore, invoke } from './r2a/memory-store.mjs';
import { resolveRequestContracts, preserveRequestContracts } from '../../functions/request-contract-evidence.mjs';
import { evaluateEntitlement, normalizeExpiredAccount } from '../../functions/subscription-lifecycle.mjs';
import { newRequestContract, requestPolicyVersion } from '../../functions/request-limit-policy.mjs';
import { createApiKeyHandlers } from '../../services/api-key-management.js';
import { createPaymentHandlers } from '../../services/payment-checkout.js';
import { issueCredential } from '../../services/api-key-security.js';
import { consumeAccountQuota } from '../../services/account-quota.js';
import { createPaymentWebhook } from '../../services/payment-webhook.js';
import { downgradeExpiredSubscriptions } from '../../services/scheduled-jobs.js';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const OLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEXT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LIMITS = { free_trial: null, pro: 1000, pro_max: null };
const paths = { order: `payment_orders/${OLD}`, receipt: 'transactions/paymongo_live_pay_old',
  event: 'payment_events/live_evt_old', session: 'payment_sessions/live_cs_old' };

// Synthetic identities only. Dates/field shapes represent the two locally
// archived cases; no Production access, credential or provider calls occur.
function fixture(index = 0) {
  let now = NOW;
  const uid = `legacy-demo-${index}`;
  const start = ['2026-10-13T11:43:30.887Z', '2026-10-14T00:10:05.279Z'][index];
  const end = new Date(Date.parse(start) + 30 * 86400000).toISOString();
  const createdAt = new Date(Date.parse(start) - 120000).toISOString();
  const account = { uid, role: 'Developer', plan: 'Pro', apiRequestLimit: 500, subscription_status: 'active',
    subscriptionStartedAt: start, lastSubscribedAt: start, subscriptionExpiresAt: end, businessSegment: 'Grocery' };
  const binding = { userId: uid, orderId: OLD, sessionId: 'cs_old', mode: 'live' };
  const order = { ...binding, id: OLD, state: 'processed', plan: 'Pro', planId: 'pro', apiRequestLimit: 500,
    amount: 500, listAmount: 149900, billingProfile: 'global_live_test_v1', currency: 'PHP', durationDays: 30,
    paymentId: 'pay_old', paymentIntentId: 'pi_old', webhookEventId: 'evt_old', createdAt, processedAt: start,
    subscriptionPeriodStart: start, subscriptionPeriodEnd: end };
  order.providerRequestBody = JSON.stringify({ data: { attributes: { reference_number: OLD,
    metadata: { orderId: OLD, plan: 'Pro', planId: 'pro' }, show_description: true, show_line_items: true,
    line_items: [{ name: 'InventaAPI Pro Plan', description: '1 Month Subscription — 500 API requests/day',
      amount: 500, currency: 'PHP', quantity: 1 }] } } });
  const key = issueCredential();
  const records = { [`users/${uid}`]: account, 'system/settings': { planRequestLimits: LIMITS },
    [paths.order]: order, [paths.session]: binding,
    [paths.receipt]: { ...binding, paymentId: 'pay_old', status: 'paid', entitlementGranted: true,
      plan: 'Pro', amount: 500, currency: 'PHP', webhookEventId: 'evt_old', createdAt: start,
      subscriptionPeriodStart: start, subscriptionPeriodEnd: end },
    [paths.event]: { ...binding, paymentId: 'pay_old', processedAt: start },
    [`account_api_usage/${uid}`]: { window: '2026-10-15', used: 237 },
    [`api_keys/${key.id}`]: { ...key.stored, userId: uid, status: 'active', linkedProductIds: [] } };
  for (let i = 0; i < 7; i++) records[`payment_orders/pending-${i}`] = {
    id: `pending-${i}`, userId: uid, state: 'pending', mode: 'live', apiRequestLimit: i < 4 ? 500 : 5000,
    providerRequestBody: `unchanged original ${i < 4 ? 500 : 5000}/day offer` };
  const db = memoryStore(records);
  const creationTimes = new Map();
  const decorate = (snapshot, path) => ({ ...snapshot,
    createTime: { toDate: () => new Date(creationTimes.get(path) ?? createdAt) } });
  const transaction = db.runTransaction;
  db.runTransaction = callback => transaction(tx => callback({ ...tx, get: async ref => {
    const result = await tx.get(ref);
    return result.docs ? { ...result, docs: result.docs.map(doc => decorate(doc, `${ref.name}/${doc.id}`)) }
      : decorate(result, ref.path);
  } }));
  const verifyIdToken = async (_token, revoked) => { assert.equal(revoked, true); return { uid }; };
  const keys = createApiKeyHandlers({ getDb: () => db, verifyIdToken, clock: () => now });
  const payments = createPaymentHandlers({ getDb: () => db, verifyIdToken, clock: () => now,
    getConfig: () => ({ mode: 'test', secretKey: 'sk_test_synthetic', dashboardUrl: 'https://customer.invalid' }),
    newOrderId: () => NEXT, createSession: async () => ({ sessionId: 'cs_new', paymentIntentId: 'pi_new',
      checkoutUrl: 'https://checkout.paymongo.com/synthetic' }) });
  const resolve = () => db.runTransaction(async tx => {
    const result = await resolveRequestContracts(tx, db, uid, db.read(`users/${uid}`), { recoverHistorical: true, recordCompleteness: true });
    preserveRequestContracts(tx, result); return result;
  });
  return { db, uid, account, start, end, keys, payments, key, creationTimes, resolve,
    status: () => invoke(payments.status), time: value => { now = value; },
    change: (path, change) => { const record = db.read(path); change(record); db.seed(path, record); },
    consume: () => consumeAccountQuota(db, { keyId: key.id, userId: uid, credential: key.credential, clock: () => now }) };
}

for (const index of [0, 1]) test(`historical demonstration ${index + 1}: status, billing and key projections are read-only and preserve exact period/500`, async () => {
  const f = fixture(index), before = f.db.dump();
  const status = await f.status(); assert.equal(status.statusCode, 200);
  assert.equal(status.body.activePro, true); assert.equal(status.body.apiRequestLimit, 500);
  assert.equal(status.body.subscriptionStartedAt, f.start); assert.equal(status.body.subscriptionExpiresAt, f.end);
  assert.deepEqual(status.body.purchaseRequestLimits, { pro: 1000, pro_max: null });
  const keys = await invoke(f.keys.list); assert.equal(keys.statusCode, 200); assert.equal(keys.body.usage.limit, 500);
  assert.equal(keys.body.usage.used, 237); assert.equal(keys.body.keys.length, 1);
  const resolved = await f.resolve(); assert.equal(resolved.changed, false); assert.deepEqual(resolved.contracts.plans, {});
  assert.deepEqual(f.db.dump(), before); assert.equal(f.db.commits, 0);
  assert.equal(f.db.read(`account_request_contracts/${f.uid}`), undefined);
  assert.equal(await normalizeExpiredAccount(f.db, f.uid, () => NOW), false); assert.deepEqual(f.db.dump(), before);
});

test('existing credentials consume the shared monthly Pro allowance without profile/contract backfill', async () => {
  const f = fixture(), profile = f.db.read(`users/${f.uid}`), pending = pendingRecords(f);
  // Admission alone uses nothing; delivered products are charged afterwards.
  const result = await f.consume(); assert.equal(result.usage.used, 0); assert.equal(result.usage.limit, 15000);
  assert.equal(result.productCharge.plan, 'pro');
  assert.equal(result.usage.period, 'monthly');
  assert.deepEqual(f.db.read(`users/${f.uid}`), profile); assert.equal(f.db.read(`account_request_contracts/${f.uid}`), undefined);
  assert.deepEqual(pendingRecords(f), pending);
  f.db.seed(`account_paid_monthly_usage/${f.uid}_2026-10_account`, { window: '2026-10', used: 15000 });
  await assert.rejects(f.consume(), error => error.status === 429);
});
function pendingRecords(f) { return Object.fromEntries(Object.entries(f.db.dump()).filter(([path]) => path.startsWith('payment_orders/pending-'))); }

test('Pro issuance keeps the one-key rule and does not grant a Trial or mutate legacy history', async () => {
  const f = fixture(), profile = f.db.read(`users/${f.uid}`), pending = pendingRecords(f);
  // This Pro account already has an active key, so another key is refused.
  const first = await invoke(f.keys.create, { body: { keyName: 'Synthetic key', linkedProductIds: [] } });
  assert.equal(first.statusCode, 409); assert.equal(first.body.error, 'PRO_SINGLE_KEY');
  assert.equal((await invoke(f.keys.create, { body: { keyName: 'Second' } })).statusCode, 409);
  assert.deepEqual(f.db.read(`users/${f.uid}`), profile); assert.deepEqual(pendingRecords(f), pending);
  assert.equal(f.db.read(`account_request_contracts/${f.uid}`), undefined);
});

const invalid = [
  ['missing paid receipt', f => f.db.remove(paths.receipt)],
  ['missing processed event', f => f.db.remove(paths.event)],
  ['missing session binding', f => f.db.remove(paths.session)],
  ['wrong receipt owner', f => f.change(paths.receipt, x => { x.userId = 'other'; })],
  ['wrong order ID', f => f.change(paths.order, x => { x.id = NEXT; })],
  ['wrong session order', f => f.change(paths.session, x => { x.orderId = NEXT; })],
  ['wrong payment binding', f => f.change(paths.event, x => { x.paymentId = 'pay_other'; })],
  ['contradictory receipt reference', f => f.change(paths.receipt, x => { x.paymongoReferenceId = 'pay_other'; })],
  ['wrong event binding', f => f.change(paths.receipt, x => { x.webhookEventId = 'evt_other'; })],
  ['TEST receipt', f => f.change(paths.receipt, x => { x.mode = 'test'; })],
  ['contradictory live marker', f => f.change(paths.event, x => { x.livemode = false; })],
  ['unpaid receipt', f => f.change(paths.receipt, x => { x.status = 'pending'; })],
  ['ungranted receipt', f => f.change(paths.receipt, x => { x.entitlementGranted = false; })],
  ['review-required event', f => f.change(paths.event, x => { x.reviewRequired = true; })],
  ['forged saved offer', f => f.change(paths.order, x => { x.providerRequestBody = '{}'; })],
  ['non-array offer items', f => f.change(paths.order, x => {
    const body = JSON.parse(x.providerRequestBody); const item = body.data.attributes.line_items[0];
    body.data.attributes.line_items = { 0: item, length: 1 }; x.providerRequestBody = JSON.stringify(body);
  })],
  ['5000/day offer is outside exception', f => f.change(paths.order, x => { x.apiRequestLimit = 5000; })],
  ['contradictory receipt terms', f => f.change(paths.receipt, x => { x.requestAllowance = { limit: 5000 }; })],
  ['changed paid period', f => f.change(`users/${f.uid}`, x => { x.subscriptionExpiresAt = '2026-12-01T00:00:00.000Z'; })],
  ['forged profile allowance', f => f.change(`users/${f.uid}`, x => { x.apiRequestLimit = null; })],
  ['changed profile start', f => f.change(`users/${f.uid}`, x => { x.subscriptionStartedAt = '2026-10-12T00:00:00.000Z'; })],
  ['late recreated order', f => f.creationTimes.set(paths.order, '2026-10-15T00:00:00.000Z')],
  ['late recreated receipt', f => f.creationTimes.set(paths.receipt, '2026-10-15T00:00:00.000Z')],
  ['late recreated event', f => f.creationTimes.set(paths.event, '2026-10-15T00:00:00.000Z')],
  ['late recreated session', f => f.creationTimes.set(paths.session, '2026-10-15T00:00:00.000Z')],
  ['pending order cannot confer grandfathering', f => f.change(paths.order, x => { x.state = 'pending'; })],
  ['ambiguous second paid history', f => f.db.seed('payment_orders/ambiguous', { ...f.db.read(paths.order), id: 'ambiguous' })],
  ['post-cutoff paid period', f => {
    const start = '2026-10-15T00:00:00.000Z', end = '2026-11-14T00:00:00.000Z';
    f.change(paths.order, x => Object.assign(x, { processedAt: start, subscriptionPeriodStart: start, subscriptionPeriodEnd: end }));
    f.change(`users/${f.uid}`, x => Object.assign(x, { lastSubscribedAt: start, subscriptionStartedAt: start, subscriptionExpiresAt: end }));
  }],
];
for (const [name, mutate] of invalid) test(`fail closed without writes: ${name}`, async () => {
  const f = fixture(); mutate(f); const before = f.db.dump();
  await assert.rejects(f.resolve(), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' });
  assert.ok((await f.status()).statusCode >= 400); assert.ok((await invoke(f.keys.list)).statusCode >= 400);
  assert.deepEqual(f.db.dump(), before); assert.equal(f.db.commits, 0);
});

test('historical entitlement expires exactly at recorded end without normalizer migration or counter reset', async () => {
  const f = fixture(), before = f.db.dump(); f.time(new Date(f.end));
  const status = await f.status(); assert.equal(status.statusCode, 200); assert.equal(status.body.activePro, false);
  assert.equal(status.body.apiRequestLimit, 0); assert.equal(status.body.expired, true);
  await assert.rejects(f.consume(), error => error.status === 403);
  assert.equal((await invoke(f.keys.create, { body: { keyName: 'Expired' } })).statusCode, 403);
  assert.equal(await normalizeExpiredAccount(f.db, f.uid, () => new Date(f.end)), false);
  assert.deepEqual(f.db.dump(), before);
});

test('actual scheduled job preserves active and expired demonstration profiles without snapshots', async () => {
  const f = fixture(), before = f.db.dump(), diagnostics = [];
  let at = NOW;
  const run = () => downgradeExpiredSubscriptions(f.db, (db, uid) => normalizeExpiredAccount(db, uid, () => at), { error: (...args) => diagnostics.push(args) });
  await run(); at = new Date(f.end); await run();
  assert.deepEqual(diagnostics, []); assert.deepEqual(f.db.dump(), before);
});

test('receipt changes during transaction force revalidation before usage can commit', async () => {
  const f = fixture();
  f.db.beforeCommit = () => { f.db.beforeCommit = null; f.change(paths.receipt, x => { x.mode = 'test'; }); };
  await assert.rejects(f.consume(), { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE' });
  assert.ok(f.db.retries > 0); assert.equal(f.db.read(`account_api_usage/${f.uid}`).used, 237);
  assert.equal(f.db.read(`account_request_contracts/${f.uid}`), undefined); assert.equal(f.db.userWrites, 0);
});

test('opaque grandfathering cannot be reused after profile period changes or serialized as proof', async () => {
  const f = fixture(), resolved = await f.resolve();
  assert.equal(evaluateEntitlement(f.account, NOW, LIMITS, resolved.contracts).limit, 500);
  assert.throws(() => evaluateEntitlement({ ...f.account, uid: 'other' }, NOW, LIMITS, resolved.contracts));
  assert.throws(() => evaluateEntitlement({ ...f.account, subscriptionExpiresAt: '2026-12-01T00:00:00.000Z' }, NOW, LIMITS, resolved.contracts));
  assert.throws(() => evaluateEntitlement(f.account, new Date(Date.parse(f.start) - 1), LIMITS, resolved.contracts));
  assert.deepEqual(JSON.parse(JSON.stringify(resolved.contracts)), { version: 1, plans: {} });
});

for (const [plan, limit] of [['pro', 1200], ['pro_max', null]]) test(`new ${plan} accepted contract stays isolated from legacy eligibility`, async () => {
  const f = fixture();
  f.db.seed(`account_request_contracts/${f.uid}`, { version: 1, plans: { [plan]: newRequestContract(limit) } });
  if (plan === 'pro_max') f.change(`users/${f.uid}`, x => { x.plan = 'Pro Max'; x.apiRequestLimit = null; });
  const status = await f.status(); assert.equal(status.statusCode, 200); assert.equal(status.body.apiRequestLimit, limit);
});

test('future renewal captures new Admin terms without persisting the grandfathered old-period allowance', async () => {
  const f = fixture(), before = f.db.read(`users/${f.uid}`);
  const result = await invoke(f.payments.checkout, { body: { plan: 'pro', requestPolicyVersion: requestPolicyVersion(LIMITS) } });
  assert.equal(result.statusCode, 200); assert.equal(f.db.read(`payment_orders/${NEXT}`).requestAllowance.limit, 1000);
  assert.equal(f.db.read(`account_request_contracts/${f.uid}`), undefined);
  assert.deepEqual(f.db.read(`users/${f.uid}`), before); assert.equal((await f.status()).body.apiRequestLimit, 500);
});

for (const plan of ['pro', 'pro_max']) test(`signed future ${plan} purchase grants only new verified terms and remains idempotent`, async () => {
  const f = fixture(), pending = pendingRecords(f);
  const response = await invoke(f.payments.checkout, { body: { plan, requestPolicyVersion: requestPolicyVersion(LIMITS) } });
  assert.equal(response.statusCode, 200);
  const order = f.db.read(`payment_orders/${NEXT}`), saved = JSON.parse(order.providerRequestBody).data.attributes;
  const event = { data: { id: 'evt_new', type: 'event', attributes: { livemode: false,
    type: 'checkout_session.payment.paid', data: { id: order.sessionId, type: 'checkout_session', attributes: {
      ...saved, status: 'active', livemode: false,
      payment_intent: { id: order.paymentIntentId, type: 'payment_intent', attributes: {
        amount: order.amount, currency: 'PHP', livemode: false, status: 'succeeded' } },
      payments: [{ id: 'pay_new', type: 'payment', attributes: { amount: order.amount, currency: 'PHP',
        livemode: false, payment_intent_id: order.paymentIntentId, status: 'paid', source: { type: 'qrph' } } }],
    } } } } };
  const hook = createPaymentWebhook({ getDb: () => f.db, clock: () => NOW,
    getConfig: () => ({ mode: 'test', secretKey: 'sk_test_synthetic', webhookSecret: 'synthetic', dashboardUrl: 'https://customer.invalid' }) });
  const rawBody = Buffer.from(JSON.stringify(event)), t = NOW.getTime() / 1000;
  const signature = createHmac('sha256', 'synthetic').update(`${t}.`).update(rawBody).digest('hex');
  const request = { rawBody, headers: { 'paymongo-signature': `t=${t},te=${signature}` } };
  assert.equal((await invoke(hook, { ...request, headers: { 'paymongo-signature': 'invalid' } })).statusCode, 403);
  assert.equal((await invoke(hook, request)).body.processed, true);
  const after = f.db.dump(); assert.equal((await invoke(hook, request)).body.duplicate, true); assert.deepEqual(f.db.dump(), after);
  const status = await f.status(); assert.equal(status.statusCode, 200); assert.equal(status.body.apiRequestLimit, plan === 'pro' ? 1000 : null);
  const contracts = f.db.read(`account_request_contracts/${f.uid}`); assert.deepEqual(Object.keys(contracts.plans), [plan]);
  assert.equal(contracts.plans[plan].limit, plan === 'pro' ? 1000 : null);
  assert.equal(f.db.read(`users/${f.uid}`).subscriptionExpiresAt, new Date(Date.parse(f.end) + 30 * 86400000).toISOString());
  assert.equal(f.db.read(`account_api_usage/${f.uid}`).used, 237); assert.deepEqual(pendingRecords(f), pending);
});

test('representative population of 19 profiles remains unchanged through read projections and scheduler inspection', async () => {
  const cases = [fixture(0), fixture(1)];
  for (let i = 0; i < 17; i++) {
    const f = fixture(); const account = { uid: f.uid, role: 'Developer', plan: i === 16 ? 'Expired' : 'Free', apiRequestLimit: 50 };
    if (i < 10) Object.assign(account, { hasUsedFreeTrial: true, trialVersion: 1,
      trialStartedAt: '2026-09-01T00:00:00.000Z', trialExpiresAt: '2026-09-08T00:00:00.000Z', trialConsumed: true });
    f.db.seed(`users/${f.uid}`, account); cases.push(f);
  }
  assert.equal(cases.length, 19);
  for (const f of cases) {
    const before = f.db.dump(), unsupported = before[`users/${f.uid}`].plan === 'Expired';
    const status = await f.status(); assert.equal(status.statusCode, unsupported ? 503 : 200);
    if (unsupported) await assert.rejects(normalizeExpiredAccount(f.db, f.uid, () => NOW));
    else assert.equal(await normalizeExpiredAccount(f.db, f.uid, () => NOW), false);
    assert.deepEqual(f.db.dump(), before); assert.equal(f.db.userWrites, 0);
  }
});
