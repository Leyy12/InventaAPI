// Run with --experimental-test-module-mocks. No Firebase app or external IO.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import express from 'express';

const calls = { firestore: 0, auth: 0, middleware: 0 };
mock.module('firebase-admin/firestore', { namedExports: { getFirestore() {
  calls.firestore++; throw new Error('Database access forbidden in route-removal test');
} } });
mock.module('firebase-admin/auth', { namedExports: { getAuth() {
  calls.auth++; throw new Error('Firebase authentication forbidden in route-removal test');
} } });
const { default: daas } = await import('../../routes/daas.js');
const { default: insights } = await import('../../routes/customer-insights.js');
for (const router of [daas, insights]) {
  for (const layer of router.stack) for (const entry of layer.route?.stack || []) {
    const original = entry.handle;
    entry.handle = function(req, res, next) { calls.middleware++; return original(req, res, next); };
  }
}
const app = express();
app.use('/daas/v1', daas);
app.use('/api/v1/customer/insights', insights);
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

function get(server, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject); req.end();
  });
}

test('both removed real Express routes return 404 before auth, quota, catalog, sales or telemetry', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const path of ['/daas/v1/recommendations', '/api/v1/customer/insights/recommendations']) {
    for (const headers of [{}, { 'x-api-key': 'synthetic-not-a-key', authorization: 'Bearer synthetic-not-a-token' }]) {
      const response = await get(server, path, headers);
      assert.deepEqual(response, { status: 404, body: { error: 'NOT_FOUND' } });
      assert.deepEqual(calls, { firestore: 0, auth: 0, middleware: 0 });
    }
  }
  assert.equal((await get(server, '/daas/v1/health')).status, 200);
  assert.equal(calls.firestore, 0);
  assert.equal(calls.auth, 0);
});

test('actual routers retain exactly the expected supported route/method surface', () => {
  const routes = router => router.stack.filter(layer => layer.route).map(layer =>
    `${Object.keys(layer.route.methods).join(',')} ${layer.route.path}`);
  assert.deepEqual(routes(daas), ['get /health', 'get /catalog', 'post /sales', 'get /sales-feed']);
  assert.deepEqual(routes(insights), ['get /sales-feed']);
});
