// Run with --experimental-test-module-mocks. Real Express catalog route, in-memory data.
// Paid plans count product variants delivered: each variant sent uses one, and a
// product without variants uses one.
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
const mainKey = issueCredential();
const plainKey = issueCredential();
const maxKey = issueCredential();
const db = memoryStore({
  'users/owner': { uid: 'owner', role: 'Developer', plan: 'Pro', apiRequestLimit: 5000, subscription_status: 'active',
    subscriptionStartedAt: '2026-01-01T00:00:00.000Z', subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
    businessSegment: 'Grocery', selectedSegment: 'Grocery' },
  'account_request_contracts/owner': { version: 1, plans: { pro: { version: 1, period: 'utc_daily', limit: 500 } } },
  [`api_keys/${mainKey.id}`]: { ...mainKey.stored, userId: 'owner', status: 'active', name: 'Store', segment: 'Grocery', linkedProductIds: productIds },
  [`api_keys/${plainKey.id}`]: { ...plainKey.stored, userId: 'owner', status: 'active', name: 'Plain', segment: 'Grocery', linkedProductIds: ['plain'] },
  ...Object.fromEntries(productIds.map(id => [`products/${id}`, withVariants(id)])),
  'products/plain': { name: 'Plain product', segment: 'Grocery', category: 'Beverages', status: 'active' },
  // Pro Max: one key holding products from two segments.
  'users/maxowner': { uid: 'maxowner', role: 'Developer', plan: 'Pro Max', apiRequestLimit: null, subscription_status: 'active',
    subscriptionStartedAt: '2026-01-01T00:00:00.000Z', subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
    businessSegment: 'Grocery', selectedSegment: 'Grocery' },
  'account_request_contracts/maxowner': { version: 1, plans: { pro_max: { version: 1, period: 'utc_daily', limit: null } } },
  [`api_keys/${maxKey.id}`]: { ...maxKey.stored, userId: 'maxowner', status: 'active', name: 'Pro Max API key', linkedProductIds: ['tuna', 'aspirin'] },
  'products/tuna': { name: 'Tuna', segment: 'Grocery', category: 'Canned Goods', status: 'active',
    variants: [{ sku: 'T1' }, { sku: 'T2' }, { sku: 'T3' }] },
  'products/aspirin': { name: 'Aspirin', segment: 'Pharmacy', category: 'Medicine', status: 'active', variants: [{ sku: 'A1' }, { sku: 'A2' }] },
});
mock.module('../../../database/data-store.js', { namedExports: { getDataStore: () => db } });
const { default: daas } = await import('../../../routes/daas.js');
const app = express();
app.use('/daas/v1', daas);

function get(server, path, key = mainKey) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, headers: { 'x-api-key': key.credential } }, res => {
      let data = ''; res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject); req.end();
  });
}
const used = () => db.read(`account_paid_monthly_usage/owner_${month}_account`)?.used ?? 0;
const setUsed = value => db.seed(`account_paid_monthly_usage/owner_${month}_account`, { userId: 'owner', window: month, bucket: 'account', used: value });
const pause = () => new Promise(resolve => setTimeout(resolve, 2100)); // past the 2-second repeat guard
async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server;
}

test('each variant sent uses one; the last product is cut to the variants left; then 429', async t => {
  const server = await serve(t);
  setUsed(0);
  const full = await get(server, '/daas/v1/catalog?perPage=10');
  assert.equal(full.status, 200);
  assert.equal(full.body.products.length, 10);
  assert.equal(used(), 20, '10 products with 2 variants each use 20');
  assert.deepEqual([full.body.meta.variantsSent, full.body.meta.quota.used, full.body.meta.quota.remaining], [20, 20, 14980]);

  setUsed(14985);
  await pause();
  const cut = await get(server, '/daas/v1/catalog?perPage=10');
  assert.equal(cut.status, 200);
  assert.equal(cut.body.products.length, 8, '7 full products and 1 with one variant');
  assert.deepEqual(cut.body.products.map(p => p.variants.length), [2, 2, 2, 2, 2, 2, 2, 1]);
  assert.equal(cut.body.meta.variantsSent, 15);
  assert.equal(cut.body.meta.quotaLimited, true);
  assert.equal(used(), 15000);

  await pause();
  const over = await get(server, '/daas/v1/catalog?perPage=10');
  assert.equal(over.status, 429);
  assert.match(over.body.message, /15,000 products/);
  assert.equal(used(), 15000, 'never more than 15,000');
});

test('a product without variants uses one; a search with no matches uses none', async t => {
  const server = await serve(t);
  setUsed(100);
  const plain = await get(server, '/daas/v1/catalog', plainKey);
  assert.equal(plain.status, 200);
  assert.equal(plain.body.products.length, 1);
  assert.equal(used(), 101);
  const none = await get(server, '/daas/v1/catalog?search=zzz-no-match');
  assert.equal(none.status, 200);
  assert.equal(none.body.products.length, 0);
  assert.equal(used(), 101);
});

const maxUsed = segment => db.read(`account_paid_monthly_usage/maxowner_${month}_${segment}`)?.used ?? 0;
test('Pro Max: one key; each variant counts against its own product segment; ?segment= filters', async t => {
  const server = await serve(t);
  const all = await get(server, '/daas/v1/catalog', maxKey);
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.products.map(p => p.name).sort(), ['Aspirin', 'Tuna']);
  assert.deepEqual([maxUsed('Grocery'), maxUsed('Pharmacy')], [3, 2]);

  await pause();
  const pharmacy = await get(server, '/daas/v1/catalog?segment=pharmacy', maxKey);
  assert.deepEqual(pharmacy.body.products.map(p => p.name), ['Aspirin']);
  assert.deepEqual([maxUsed('Grocery'), maxUsed('Pharmacy')], [3, 4], 'only Pharmacy was charged');

  // Grocery used up: Tuna is left out, Aspirin still arrives.
  db.seed(`account_paid_monthly_usage/maxowner_${month}_Grocery`, { userId: 'maxowner', window: month, bucket: 'Grocery', used: 15000 });
  await pause();
  const partial = await get(server, '/daas/v1/catalog', maxKey);
  assert.equal(partial.status, 200);
  assert.deepEqual(partial.body.products.map(p => p.name), ['Aspirin']);
  assert.equal(partial.body.meta.quotaLimited, true);
  assert.deepEqual(partial.body.meta.quota.buckets.map(b => [b.bucket, b.used]), [['Grocery', 15000], ['Pharmacy', 6], ['Hardware', 0]]);

  await pause();
  const groceryOnly = await get(server, '/daas/v1/catalog?segment=Grocery', maxKey);
  assert.equal(groceryOnly.status, 429);
  assert.match(groceryOnly.body.message, /Grocery/);
});
