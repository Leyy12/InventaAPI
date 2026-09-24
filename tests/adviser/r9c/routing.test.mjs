// Run: node --test tests/adviser/r9c/routing.test.mjs
// Load the real production Express entry with synthetic SDK boundaries only.
// No Firebase SDK, dotenv files, credentials or outbound provider calls are used.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createServer, request } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';

const blocked = () => { throw new Error('External I/O is prohibited in R9C routing tests'); };
globalThis.fetch = blocked;
globalThis.WebSocket = class { constructor() { blocked(); } };
process.env.NODE_ENV = 'production';
process.env.VERCEL = '1';
process.env.PAYMONGO_MODE = 'test';
process.env.PAYMONGO_SECRET_KEY = 'sk_test_r9c_synthetic_only';
process.env.PAYMONGO_WEBHOOK_SECRET = 'r9c_synthetic_signing_secret';

const fixtures = new Map([
  ['firebase-admin/app', 'export const getApps = () => [{}]; export const initializeApp = () => { throw Error("Unexpected initialization"); }; export const cert = initializeApp;'],
  ['firebase-admin/auth', 'export const getAuth = () => ({ verifyIdToken: async () => { throw Error("Synthetic auth rejects credentials"); } });'],
  ['firebase-admin/firestore', `
    export const FieldPath = { documentId: () => '__name__' };
    export const FieldValue = { serverTimestamp: () => { throw Error('Writes prohibited'); } };
    export const getFirestore = () => ({ collection(name) {
      if (name !== 'products') throw Error('Unexpected collection');
      return { get: async () => ({ forEach: callback => callback({ id: 'r9c-fixture', data: () => ({ name: 'Synthetic product' }) }) }) };
    } });`],
  ['dotenv/config', 'export {};'],
  ['dotenv', 'export default { config: () => ({ parsed: {} }) };'],
]);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (fixtures.has(specifier)) return { url: `r9c:${specifier}`, shortCircuit: true };
    if (specifier.startsWith('firebase') || specifier.startsWith('@google-cloud/') || specifier === 'google-auth-library') {
      throw Error('Real cloud SDK prohibited');
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('r9c:')) return { format: 'module', source: fixtures.get(url.slice(4)), shortCircuit: true };
    return nextLoad(url, context);
  },
});
const { default: app } = await import('../../../server.js');
const server = createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  hooks.deregister();
});
function get(path) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1', port: server.address().port, path, method: 'GET', agent: false,
      // The fixture sets VERCEL=1, so model the platform-overwritten IP headers.
      headers: { 'x-forwarded-for': '203.0.113.77', 'x-vercel-forwarded-for': '203.0.113.77' },
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(Error('Local routing timeout')));
    req.end();
  });
}

test('native Express packaging has no competing root api filesystem functions', () => {
  const api = new URL('../../../api/', import.meta.url);
  assert.equal(existsSync(api) && readdirSync(api).length > 0, false);
  assert.equal(typeof app, 'function');
});
test('production health route succeeds', async () => {
  const response = await get('/daas/v1/health');
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.body).status, 'operational');
});
test('products reach the real router and return synthetic catalog data', async () => {
  const response = await get('/api/v1/products');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { products: [{ id: 'r9c-fixture', name: 'Synthetic product' }] });
});
test('subscription status remains authenticated, not missing', async () => {
  const response = await get('/api/v1/checkout/subscription-status');
  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).code, 'UNAUTHENTICATED');
});
test('Admin traffic remains authenticated, not missing', async () => {
  const response = await get('/api/v1/admin/traffic');
  assert.equal(response.status, 401);
});
test('unknown routes still return Express 404', async () => {
  for (const path of ['/r9c-unknown', '/api/v1/r9c-unknown']) {
    const response = await get(path);
    assert.equal(response.status, 404);
    assert.match(response.body, /Cannot GET/);
  }
});
