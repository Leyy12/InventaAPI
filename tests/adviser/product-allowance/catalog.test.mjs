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

function get(server, path, key, origin = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'x-api-key': key.credential, ...(origin ? { origin } : {}) };
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, headers }, res => {
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
const telemetry = () => Object.entries(db.dump()).filter(([path]) => path.startsWith('api_telemetry/')).map(([, value]) => value);
const A = 'https://store-a.example', B = 'https://store-b.example';

test('Pro: each variant counts once per app per month; the same app re-syncing is free, a new app counts again', async t => {
  const server = await serve(t);
  setUsed('owner', 0);
  const first = await get(server, '/daas/v1/catalog?perPage=10', proKey, A);
  assert.equal(first.status, 200);
  assert.equal(first.body.products.length, 10);
  assert.equal(used('owner'), 20, '10 products with 2 variants each use 20');
  assert.deepEqual([first.body.meta.variantsSent, first.body.meta.variantsCounted, first.body.meta.app.source, first.body.meta.app.new], [20, 20, 'store-a.example', true]);

  await pause();
  const again = await get(server, '/daas/v1/catalog?perPage=10', proKey, A);
  assert.equal(again.body.products.length, 10, 'repeat products are still sent');
  assert.equal(again.body.meta.variantsCounted, 0);
  assert.equal(again.body.meta.app.new, false);
  assert.equal(used('owner'), 20, 'the same app re-syncing is not counted again');

  await pause();
  const more = await get(server, '/daas/v1/catalog?perPage=11', proKey, A);
  assert.equal(more.body.meta.variantsCounted, 2, 'only the 1 new product (2 variants) counts');
  assert.equal(used('owner'), 22);

  await pause();
  const other = await get(server, '/daas/v1/catalog?perPage=10', proKey, B);
  assert.equal(other.body.meta.app.new, true);
  assert.equal(used('owner'), 42, 'a different website counts the same products again');
  const rows = telemetry().filter(row => row.consumerDomain === 'store-b.example');
  assert.equal(rows.length, 1); assert.equal(rows[0].newConsumer, true); assert.equal(rows[0].consumerIp, '127.0.0.1');

  await pause();
  const server2 = await get(server, '/daas/v1/catalog?perPage=10', proKey);
  assert.equal(server2.body.meta.app.source, '127.0.0.0/24', 'no domain: the server IP range is the app');
  assert.equal(used('owner'), 62);
});

test('the last product is cut to what is left (new variants only); then 429', async t => {
  const server = await serve(t);
  setUsed('owner', 14985);
  const cut = await get(server, '/daas/v1/catalog?perPage=10&page=3', proKey, 'https://store-c.example');
  assert.equal(cut.status, 200);
  assert.deepEqual(cut.body.products.map(p => p.variants.length), [2, 2, 2, 2, 2, 2, 2, 1]);
  assert.equal(cut.body.meta.quotaLimited, true);
  assert.equal(used('owner'), 15000);
  await pause();
  const over = await get(server, '/daas/v1/catalog?perPage=10&page=4', proKey, 'https://store-c.example');
  assert.equal(over.status, 429);
  assert.match(over.body.message, /15,000 products/);
  assert.equal(used('owner'), 15000);
});

test('a blocked app is refused with 403 and recorded in history', async t => {
  const server = await serve(t);
  setUsed('owner', 0);
  await get(server, '/daas/v1/catalog?perPage=1', proKey, 'https://copycat.example');
  const [path] = Object.entries(db.dump()).find(([key, value]) => key.startsWith('api_key_consumers/') && value.label === 'copycat.example');
  db.seed(path, { ...db.read(path), blocked: true });
  await pause();
  const refused = await get(server, '/daas/v1/catalog?perPage=1', proKey, 'https://copycat.example');
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'CONSUMER_BLOCKED');
  assert.ok(telemetry().some(row => row.statusCode === 403 && row.consumerDomain === 'copycat.example'));
  assert.equal(used('owner'), 2, 'nothing more counted for the blocked app');
});

test('Pro Max: 20,000 shared total; each segment share recorded; ?segment= filters', async t => {
  const server = await serve(t);
  setUsed('maxowner', 0);
  const all = await get(server, '/daas/v1/catalog', maxKey, A);
  assert.deepEqual(all.body.products.map(p => p.name).sort(), ['Aspirin', 'Tuna']);
  assert.deepEqual([used('maxowner'), segUsed('maxowner', 'Grocery'), segUsed('maxowner', 'Pharmacy')], [3, 2, 1]);
  assert.deepEqual(all.body.meta.segmentUsage, [{ segment: 'Grocery', used: 2 }, { segment: 'Pharmacy', used: 1 }, { segment: 'Hardware', used: 0 }]);
  await pause();
  const pharmacy = await get(server, '/daas/v1/catalog?segment=pharmacy', maxKey, B);
  assert.deepEqual(pharmacy.body.products.map(p => p.name), ['Aspirin']);
  assert.deepEqual([used('maxowner'), segUsed('maxowner', 'Grocery'), segUsed('maxowner', 'Pharmacy')], [4, 2, 2]);
  setUsed('maxowner', 20000);
  await pause();
  const over = await get(server, '/daas/v1/catalog?segment=Grocery', maxKey, 'https://store-d.example');
  assert.equal(over.status, 429);
  assert.match(over.body.message, /20,000 products/);
});
