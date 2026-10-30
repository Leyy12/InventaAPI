// Run with --experimental-test-module-mocks. Real Express catalog route, in-memory data.
// Paid plans count product variants delivered: Pro 15,000, Pro Max 20,000 a month
// (one account allowance; Pro Max also records each segment's share).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import express from 'express';
import { memoryStore } from '../r2a/memory-store.mjs';
import { issueCredential } from '../../../services/api-key-security.js';

const month = new Date().toISOString().slice(0, 7);
const productIds = Array.from({ length: 60 }, (_, i) => `p${i}`);
const withVariants = id => ({ name: `Product ${id}`, segment: 'Grocery', category: 'Beverages', status: 'active',
  variants: [{ sku: `${id}-A`, size: '1L' }, { sku: `${id}-B`, size: '2L' }] });
const proKey = issueCredential();
const maxKey = issueCredential();
const paid = (uid, plan) => ({
  [`users/${uid}`]: { uid, role: 'Developer', plan, apiRequestLimit: plan === 'Pro' ? 5000 : null, subscription_status: 'active',
    subscriptionStartedAt: '2026-01-01T00:00:00.000Z', subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
    businessSegment: 'Grocery', selectedSegment: 'Grocery' },
  [`account_request_contracts/${uid}`]: { version: 1, plans: plan === 'Pro'
    ? { pro: { version: 1, period: 'utc_daily', limit: 500 } } : { pro_max: { version: 1, period: 'utc_daily', limit: null } } },
});
const db = memoryStore({
  ...paid('owner', 'Pro'),
  [`api_keys/${proKey.id}`]: { ...proKey.stored, userId: 'owner', status: 'active', name: 'Store', segment: 'Grocery', linkedProductIds: productIds },
  ...Object.fromEntries(productIds.map(id => [`products/${id}`, withVariants(id)])),
  ...paid('maxowner', 'Pro Max'),
  [`api_keys/${maxKey.id}`]: { ...maxKey.stored, userId: 'maxowner', status: 'active', name: 'Pro Max API key', linkedProductIds: ['tuna', 'aspirin'] },
  'products/tuna': { name: 'Tuna', segment: 'Grocery', category: 'Canned Goods', status: 'active', variants: [{ sku: 'T1' }, { sku: 'T2' }] },
  'products/aspirin': { name: 'Aspirin', segment: 'Pharmacy', category: 'Medicine', status: 'active', variants: [{ sku: 'A1' }] },
});
mock.module('../../../database/data-store.js', { namedExports: { getDataStore: () => db } });
const { default: daas } = await import('../../../routes/daas.js');
const app = express();
app.use('/daas/v1', daas);

function get(server, path, key) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, headers: { 'x-api-key': key.credential } }, res => {
      let data = ''; res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject); req.end();
  });
}
const used = uid => db.read(`account_paid_monthly_usage/${uid}_${month}_account`)?.used ?? 0;
const setUsed = (uid, value) => db.seed(`account_paid_monthly_usage/${uid}_${month}_account`, { userId: uid, window: month, bucket: 'account', used: value });
const pause = () => new Promise(resolve => setTimeout(resolve, 2100)); // past the 2-second repeat guard
async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server;
}

const segUsed = (uid, segment) => db.read(`account_paid_monthly_usage/${uid}_${month}_${segment}`)?.used ?? 0;

test('Pro: each variant sent uses one of 15,000; the last product is cut to what is left; then 429', async t => {
  const server = await serve(t);
  setUsed('owner', 0);
  const page = await get(server, '/daas/v1/catalog?perPage=10', proKey);
  assert.equal(page.status, 200);
  assert.equal(page.body.products.length, 10);
  assert.equal(used('owner'), 20, '10 products with 2 variants each use 20');
  assert.deepEqual([page.body.meta.variantsSent, page.body.meta.quota.used, page.body.meta.quota.limit], [20, 20, 15000]);

  await pause();
  const empty = await get(server, '/daas/v1/catalog?search=zzz-no-match', proKey);
  assert.equal(empty.status, 200);
  assert.equal(used('owner'), 20, 'a search with no matches uses nothing');

  setUsed('owner', 14985);
  await pause();
  const cut = await get(server, '/daas/v1/catalog?perPage=10', proKey);
  assert.equal(cut.status, 200);
  assert.deepEqual(cut.body.products.map(p => p.variants.length), [2, 2, 2, 2, 2, 2, 2, 1]);
  assert.equal(cut.body.meta.quotaLimited, true);
  assert.equal(used('owner'), 15000);

  await pause();
  const over = await get(server, '/daas/v1/catalog?perPage=10', proKey);
  assert.equal(over.status, 429);
  assert.match(over.body.message, /15,000 products/);
  assert.equal(used('owner'), 15000);
});

test('Pro Max: one 20,000 total shared by segments; each segment share recorded; ?segment= filters', async t => {
  const server = await serve(t);
  setUsed('maxowner', 0);
  const all = await get(server, '/daas/v1/catalog', maxKey);
  assert.deepEqual(all.body.products.map(p => p.name).sort(), ['Aspirin', 'Tuna']);
  assert.deepEqual([used('maxowner'), segUsed('maxowner', 'Grocery'), segUsed('maxowner', 'Pharmacy')], [3, 2, 1]);
  assert.deepEqual(all.body.meta.segmentUsage, [{ segment: 'Grocery', used: 2 }, { segment: 'Pharmacy', used: 1 }, { segment: 'Hardware', used: 0 }]);
  await pause();
  const pharmacy = await get(server, '/daas/v1/catalog?segment=pharmacy', maxKey);
  assert.deepEqual(pharmacy.body.products.map(p => p.name), ['Aspirin']);
  assert.deepEqual([used('maxowner'), segUsed('maxowner', 'Grocery'), segUsed('maxowner', 'Pharmacy')], [4, 2, 2]);
  setUsed('maxowner', 20000);
  await pause();
  const over = await get(server, '/daas/v1/catalog?segment=Grocery', maxKey);
  assert.equal(over.status, 429);
  assert.match(over.body.message, /20,000 products/);
});
