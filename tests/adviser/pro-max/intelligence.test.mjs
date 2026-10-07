import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore, invoke } from '../phase2b1/memory-firestore.mjs';
import { validateSale, recordSale, salesRange, readSales, aggregateSales,
  paidSalesEligible } from '../../../services/customer-intelligence.js';
import { createCustomerIntelligenceHandlers, createDaaSIntelligenceHandlers } from '../../../services/customer-intelligence-handlers.js';
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { evaluateEntitlement } from '../../../functions/subscription-lifecycle.mjs';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const expires = '2026-10-27T12:00:00.000Z';
const grocery = { id: 'bread', name: 'Bread', category: 'Food', segment: 'Grocery' };
const pharmacy = { id: 'medicine', name: 'Medicine', category: 'Health', segment: 'Pharmacy' };
const sale = (id = 'sale-1', productId = 'bread', quantity = 2, unitPrice = 12.5, occurredAt = '2026-09-26T23:30:00.000Z') => ({
  externalTransactionId: id, occurredAt, currency: 'PHP', items: [{ productId, quantity, unitPrice }],
});
const account = (uid, plan = 'Pro') => ({ uid, role: 'Developer', plan, selectedSegment: 'Grocery', businessSegment: 'Grocery',
  subscription_status: 'active', subscriptionExpiresAt: expires, apiRequestLimit: plan === 'Pro Max' ? null : 5000 });
const seed = () => memoryFirestore({
  'users/a': account('a'), 'users/b': account('b'),
  'products/bread': { name: 'Bread', category: 'Food', segment: 'Grocery', status: 'active', price: 12.5 },
  'products/medicine': { name: 'Medicine', category: 'Health', segment: 'Pharmacy', status: 'active', price: 20 },
});

test('completed sale computes PHP minor-unit totals and stores no consumer PII', async () => {
  const db = seed();
  const validated = validateSale(sale(), [grocery], NOW);
  assert.equal(validated.totalMinor, 2500);
  assert.equal(validated.items[0].unitPriceMinor, 1250);
  const result = await recordSale(db, 'a', validated, NOW);
  assert.equal(result.created, true);
  const stored = db.read(`customer_sales/${result.id}`);
  assert.equal(stored.userId, 'a');
  assert.equal(stored.totalMinor, 2500);
  assert.deepEqual(Object.keys(stored).sort(), ['createdAt', 'currency', 'externalTransactionId', 'fingerprint',
    'items', 'occurredAt', 'totalMinor', 'userId'].sort());
});

test('strict schema rejects PII, client totals, malformed price/quantity/time/currency, unknown and duplicate products', () => {
  const invalid = [
    { ...sale(), customerEmail: 'not-needed@example.test' },
    { ...sale(), total: 1 },
    { ...sale(), currency: 'USD' },
    sale('a', 'bread', 0), sale('b', 'bread', 1.5), sale('c', 'bread', 1, -1),
    sale('d', 'bread', 1, 1.001), sale('e', 'bread', 1, 12, '2026-09-27T12:00:00'),
    sale('date-object', 'bread', 1, 12, new Date('2026-09-27T12:00:00.000Z')),
    sale('f', 'missing'), { ...sale(), items: [sale().items[0], sale().items[0]] },
  ];
  for (const body of invalid) assert.throws(() => validateSale(body, [grocery], NOW), error => [400, 403].includes(error.status));
});

test('same account retry is idempotent; conflicting payload rejects; account namespace is independent', async () => {
  const db = seed(), validated = validateSale(sale(), [grocery], NOW);
  const first = await recordSale(db, 'a', validated, NOW);
  const retry = await recordSale(db, 'a', validated, NOW);
  assert.equal(first.created, true); assert.equal(retry.created, false);
  assert.equal(db.dump()[`customer_sales/${first.id}`].totalMinor, 2500);
  await assert.rejects(recordSale(db, 'a', validateSale(sale('sale-1', 'bread', 3), [grocery], NOW), NOW),
    error => error.code === 'SALE_CONFLICT');
  const other = await recordSale(db, 'b', validated, NOW);
  assert.equal(other.created, true); assert.notEqual(other.id, first.id);
});

test('concurrent identical sale submissions commit one account transaction', async () => {
  const db = seed(), validated = validateSale(sale(), [grocery], NOW);
  const results = await Promise.all(Array.from({ length: 8 }, () => recordSale(db, 'a', validated, NOW, 'key-a')));
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(results.filter(result => !result.created).length, 7);
  assert.equal(Object.keys(db.dump()).filter(path => path.startsWith('customer_sales/')).length, 1);
  assert.ok(db.retries > 0);
});

test('bounded UTC reporting uses only own real sales and computes summary, daily series and top products', async () => {
  const db = seed();
  await recordSale(db, 'a', validateSale(sale('one', 'bread', 2, 12.5, '2026-09-26T23:30:00.000Z'), [grocery], NOW), NOW);
  await recordSale(db, 'a', validateSale(sale('two', 'medicine', 1, 5, '2026-09-27T00:30:00.000Z'), [pharmacy], NOW), NOW);
  await recordSale(db, 'b', validateSale(sale('three', 'bread', 50, 10), [grocery], NOW), NOW);
  const range = salesRange({ from: '2026-09-26', to: '2026-09-27' }, NOW);
  const rows = await readSales(db, 'a', range);
  assert.equal(rows.length, 2);
  const report = aggregateSales(rows, range);
  assert.deepEqual(report.summary, { totalSales: 30, totalTransactions: 2, unitsSold: 3, averageTransactionValue: 15 });
  assert.deepEqual(report.timeSeries.map(row => [row.date, row.sales]), [['2026-09-26', 25], ['2026-09-27', 5]]);
  assert.deepEqual(report.topProducts.map(row => row.productId), ['bread', 'medicine']);
  assert.equal((await readSales(db, 'a', salesRange({ from: '2026-09-27', to: '2026-09-27' }, NOW))).length, 1);
  const empty = aggregateSales(await readSales(db, 'a', salesRange({ from: '2026-09-25', to: '2026-09-25' }, NOW)),
    salesRange({ from: '2026-09-25', to: '2026-09-25' }, NOW));
  assert.equal(empty.hasData, false); assert.equal(empty.summary.totalSales, 0); assert.deepEqual(empty.timeSeries, []);
});

test('malformed or unbounded ranges fail closed', () => {
  for (const query of [{ from: 'bad' }, { to: '2026-09-28' }, { from: '2026-01-01' },
    { from: '2026-09-28', to: '2026-09-27' }, { userId: 'b' }]) {
    assert.throws(() => salesRange(query, NOW), error => error.code === 'INVALID_RANGE');
  }
});

test('corrupt persisted sale line totals fail closed instead of producing fabricated reporting metrics', async () => {
  const db = seed(), validated = validateSale(sale(), [grocery], NOW);
  const saved = await recordSale(db, 'a', validated, NOW);
  db.seed(`customer_sales/${saved.id}`, { ...db.read(`customer_sales/${saved.id}`),
    items: [{ ...validated.items[0], lineTotalMinor: 1 }] });
  await assert.rejects(readSales(db, 'a', salesRange({}, NOW)), error => error.code === 'SALES_DATA_UNAVAILABLE');
});

test('Customer Firebase UID controls reads; Free and Trial cannot read paid sales, Pro/Max can', async () => {
  const db = seed();
  await recordSale(db, 'a', validateSale(sale(), [grocery], NOW), NOW);
  const handlers = createCustomerIntelligenceHandlers({ getDb: () => db, clock: () => NOW,
    verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); return { uid: token }; } });
  assert.equal((await invoke(handlers.feed, { token: null })).statusCode, 401);
  const own = await invoke(handlers.feed, { token: 'a' });
  assert.equal(own.statusCode, 200); assert.equal(own.body.summary.totalSales, 25);
  const other = await invoke(handlers.feed, { token: 'b', query: { from: '2026-09-26', to: '2026-09-27' } });
  assert.equal(other.statusCode, 200); assert.equal(other.body.hasData, false);
  db.seed('users/a', { ...account('a'), plan: 'Free', apiRequestLimit: 50 });
  assert.equal((await invoke(handlers.feed, { token: 'a' })).statusCode, 403);
  db.seed('users/a', { ...account('a'), plan: 'Free', apiRequestLimit: 50, hasUsedFreeTrial: true, trialVersion: 1,
    trialStartedAt: '2026-09-26T12:00:00.000Z', trialExpiresAt: '2026-10-03T12:00:00.000Z' });
  assert.equal((await invoke(handlers.feed, { token: 'a' })).statusCode, 403);
  db.seed('users/a', account('a', 'Pro Max'));
  assert.equal((await invoke(handlers.feed, { token: 'a' })).statusCode, 200);
});

test('DaaS ingestion validates key-linked current products and never accepts cross-account catalog IDs', async () => {
  const db = seed();
  const handlers = createDaaSIntelligenceHandlers({ getDb: () => db, clock: () => NOW });
  const request = { headers: {}, query: {}, body: sale(), method: 'POST', path: '/sales',
    apiKeyData: { id: 'key-a', userId: 'a', linkedProductIds: ['bread'] }, userPlanData: account('a') };
  const response = await invoke(handlers.sale, request);
  assert.equal(response.statusCode, 200); assert.equal(response.body.created, true);
  db.remove('products/bread');
  const replay = await invoke(handlers.sale, request);
  assert.equal(replay.statusCode, 200); assert.equal(replay.body.created, false);
  const conflict = await invoke(handlers.sale, { ...request, body: sale('sale-1', 'bread', 3) });
  assert.equal(conflict.statusCode, 409);
  const wrongKey = await invoke(handlers.sale, { ...request, apiKeyData: { ...request.apiKeyData, id: 'key-other' } });
  assert.equal(wrongKey.statusCode, 403);
  const rejected = await invoke(handlers.sale, { ...request, body: sale('other', 'medicine') });
  assert.equal(rejected.statusCode, 403);
  assert.equal(Object.keys(db.dump()).filter(key => key.startsWith('customer_sales/')).length, 1);
});

test('Pro Max unlimited remains measured past 500; Pro denies request 501; paid-only gate excludes Trial', async () => {
  const db = seed();
  db.seed('api_keys/k', { userId: 'a', status: 'active', key: 'daas_a' });
  db.seed('account_api_usage/a', { window: '2026-09-27', used: 500 });
  await assert.rejects(consumeAccountQuota(db, { keyId: 'k', userId: 'a', credential: 'daas_a', clock: () => NOW }),
    error => error.status === 429);
  db.seed('users/a', account('a', 'Pro Max'));
  const admitted = await consumeAccountQuota(db, { keyId: 'k', userId: 'a', credential: 'daas_a', clock: () => NOW });
  assert.equal(admitted.usage.used, 501); assert.equal(admitted.usage.limit, null);
  assert.equal(admitted.usage.unlimited, true);
  const beyond = await consumeAccountQuota(db, { keyId: 'k', userId: 'a', credential: 'daas_a', clock: () => NOW });
  assert.equal(beyond.usage.used, 502);
  db.seed('users/a', { ...account('a'), plan: 'Free', apiRequestLimit: 50, hasUsedFreeTrial: true, trialVersion: 1,
    trialStartedAt: '2026-09-26T12:00:00.000Z', trialExpiresAt: '2026-10-03T12:00:00.000Z' });
  await assert.rejects(consumeAccountQuota(db, { keyId: 'k', userId: 'a', credential: 'daas_a',
    paidSubscriptionRequired: true, clock: () => NOW }), error => error.status === 403);
  assert.equal(evaluateEntitlement(account('a', 'Pro Max'), NOW).limit, null);
});

test('DaaS denies legacy Free, Trial leaves historical counters unchanged and paid Pro retains daily quota', async () => {
  const db = seed();
  db.seed('api_keys/k', { userId: 'a', status: 'active', key: 'daas_a', linkedProductIds: Array.from({ length: 50 }, (_, i) => `p${i}`) });
  db.seed('account_free_monthly_usage/a', { window: '2026-09', used: 0 });
  db.seed('account_api_usage/a', { window: '2026-09-27', used: 0 });
  db.seed('account_trial_usage/a', { used: 0, startedAt: '2026-09-26T12:00:00.000Z',
    expiresAt: '2026-10-03T12:00:00.000Z' });
  const consume = () => consumeAccountQuota(db, { keyId: 'k', userId: 'a', credential: 'daas_a', clock: () => NOW });
  db.seed('users/a', { ...account('a'), plan: 'Free', apiRequestLimit: 50 });
  await assert.rejects(consume(), { status: 403, code: 'UPGRADE_REQUIRED' });
  assert.equal(db.read('account_free_monthly_usage/a').used, 0);
  db.seed('users/a', { ...account('a'), plan: 'Free', apiRequestLimit: 50, hasUsedFreeTrial: true, trialVersion: 1,
    trialStartedAt: '2026-09-26T12:00:00.000Z', trialExpiresAt: '2026-10-03T12:00:00.000Z' });
  assert.equal((await consume()).usage.used, null);
  assert.equal(db.read('account_trial_usage/a').used, 0);
  assert.equal(db.read('account_free_monthly_usage/a').used, 0);
  db.seed('users/a', account('a'));
  assert.equal((await consume()).usage.used, 1);
  assert.equal(db.read('account_api_usage/a').used, 1);
});

test('sales report eligibility is paid-only, not effective Trial level one', () => {
  const paid = account('a', 'Pro Max');
  assert.equal(paidSalesEligible(paid, evaluateEntitlement(paid, NOW)), true);
  const trial = { ...account('a'), plan: 'Free', apiRequestLimit: 50, hasUsedFreeTrial: true, trialVersion: 1,
    trialStartedAt: '2026-09-26T12:00:00.000Z', trialExpiresAt: '2026-10-03T12:00:00.000Z' };
  assert.equal(paidSalesEligible(trial, evaluateEntitlement(trial, NOW)), false);
});
