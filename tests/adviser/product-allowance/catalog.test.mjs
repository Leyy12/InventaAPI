// Run with --experimental-test-module-mocks. Real Express catalog route, in-memory data.
// Paid plans count products delivered: a response uses one per product it sends.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import express from 'express';
import { memoryStore } from '../r2a/memory-store.mjs';
import { issueCredential } from '../../../services/api-key-security.js';

const month = new Date().toISOString().slice(0, 7);
const productIds = Array.from({ length: 60 }, (_, i) => `p${i}`);
const credential = issueCredential();
const db = memoryStore({
  'users/owner': { uid: 'owner', role: 'Developer', plan: 'Pro', apiRequestLimit: 5000, subscription_status: 'active',
    subscriptionStartedAt: '2026-01-01T00:00:00.000Z', subscriptionExpiresAt: '2099-01-01T00:00:00.000Z',
    businessSegment: 'Grocery', selectedSegment: 'Grocery' },
  'account_request_contracts/owner': { version: 1, plans: { pro: { version: 1, period: 'utc_daily', limit: 500 } } },
  [`api_keys/${credential.id}`]: { ...credential.stored, userId: 'owner', status: 'active', name: 'Store', segment: 'Grocery', linkedProductIds: productIds },
  ...Object.fromEntries(productIds.map(id => [`products/${id}`, { name: `Product ${id}`, segment: 'Grocery', category: 'Beverages', status: 'active' }])),
});
mock.module('../../../database/data-store.js', { namedExports: { getDataStore: () => db } });
const { default: daas } = await import('../../../routes/daas.js');
const app = express();
app.use('/daas/v1', daas);

function get(server, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, headers: { 'x-api-key': credential.credential } }, res => {
      let data = ''; res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject); req.end();
  });
}
const used = () => db.read(`account_paid_monthly_usage/owner_${month}_account`)?.used ?? 0;
const pause = () => new Promise(resolve => setTimeout(resolve, 2100)); // past the 2-second repeat guard

test('each delivered product uses one; the last page is cut to what is left; then 429', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const full = await get(server, '/daas/v1/catalog?perPage=25');
  assert.equal(full.status, 200, JSON.stringify(full.body).slice(0, 400));
  assert.ok(full.body.products.length, JSON.stringify(full.body).slice(0, 600));
  assert.equal(full.body.products.length, 25);
  assert.equal(used(), 25, 'a 25-product page uses 25');
  assert.deepEqual([full.body.meta.quota.used, full.body.meta.quota.remaining, full.body.meta.quota.unit], [25, 14975, 'products']);

  db.seed(`account_paid_monthly_usage/owner_${month}_account`, { userId: 'owner', window: month, bucket: 'account', used: 14990 });
  await pause();
  const cut = await get(server, '/daas/v1/catalog?perPage=25');
  assert.equal(cut.status, 200);
  assert.equal(cut.body.products.length, 10, 'only the 10 products left are sent');
  assert.equal(cut.body.meta.quotaLimited, true);
  assert.equal(used(), 15000);

  await pause();
  const over = await get(server, '/daas/v1/catalog?perPage=25');
  assert.equal(over.status, 429);
  assert.match(over.body.message, /15,000 products/);
  assert.equal(used(), 15000, 'never more than 15,000');
});

test('a search with no matches uses no products', async t => {
  db.seed(`account_paid_monthly_usage/owner_${month}_account`, { userId: 'owner', window: month, bucket: 'account', used: 100 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const none = await get(server, '/daas/v1/catalog?search=zzz-no-match');
  assert.equal(none.status, 200);
  assert.equal(none.body.products.length, 0);
  assert.equal(used(), 100);
});
