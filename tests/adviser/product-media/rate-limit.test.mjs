import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mediaHttpFixture, missingId } from './http-fixture.mjs';

const headers = ip => ({ 'x-forwarded-for': ip, 'x-vercel-forwarded-for': ip });
function request(f, route = f.imagePath, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(f.origin + route, { headers: headers('203.0.113.8'), ...options }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: new Headers(response.headers), bytes: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
}
async function fixture(t) { const f = await mediaHttpFixture({ vercel: true }); t.after(() => f.close()); return f; }

test('80-image reference burst never consumes ordinary API capacity', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 80; i++) assert.equal((await request(f)).status, 200, 'reference image ' + i);
  const api = await request(f, '/api/');
  assert.equal(api.status, 200); assert.equal(api.headers.get('ratelimit-remaining'), '59');
});

test('four shared-NAT users can scroll 200 cold images each; excess is bounded separately', async t => {
  const f = await fixture(t);
  for (let user = 0; user < 4; user++) {
    for (let i = 0; i < 200; i++) assert.equal((await request(f)).status, 200);
    const api = await request(f, '/api/');
    assert.equal(api.status, 200); assert.equal(api.headers.get('ratelimit-remaining'), String(59-user));
  }
  const excess = await request(f);
  assert.equal(excess.status, 429); assert.equal(excess.headers.get('ratelimit-limit'), '800');
  assert.ok(Number(excess.headers.get('retry-after')) > 0);
  assert.equal((await request(f, '/api/')).status, 200);
  assert.equal((await request(f, f.imagePath, { headers: headers('198.51.100.9') })).status, 200);
});

test('mixed API and DaaS retain their shared 60-request protection alongside images', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 60; i++) {
    assert.equal((await request(f)).status, 200);
    const api = await request(f, i % 2 ? '/daas/v1/health' : '/api/');
    assert.notEqual(api.status, 429); assert.equal(api.headers.get('ratelimit-limit'), '60');
  }
  assert.equal((await request(f, '/api/')).status, 429);
  assert.equal((await request(f)).status, 200);
});

test('200/304 preserve verified bindings, cache/CORP/MIME, and both count toward image capacity', async t => {
  const f = await fixture(t), first = await request(f), etag = first.headers.get('etag');
  assert.equal(first.status, 200); assert.deepEqual(first.bytes, f.bytes); assert.ok(etag);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(first.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(first.headers.get('content-type'), 'image/webp');
  assert.equal(first.headers.get('location'), null);
  for (let i = 0; i < 639; i++) {
    const cached = await request(f, f.imagePath, { headers: { ...headers('203.0.113.8'), 'if-none-match': etag } });
    assert.equal(cached.status, 304); assert.equal(cached.bytes.length, 0);
    assert.equal(cached.headers.get('ratelimit-remaining'), String(798-i));
  }
  assert.equal((await request(f, '/api/')).headers.get('ratelimit-remaining'), '59');
});

test('malformed/conflicting Vercel IPs fail closed before either bucket', async t => {
  const f = await fixture(t);
  for (const invalid of [{}, { 'x-forwarded-for': 'bad' }, { 'x-forwarded-for': '203.0.113.8, 198.51.100.9' },
    { ...headers('203.0.113.8'), 'x-vercel-forwarded-for': '198.51.100.9' }]) {
    assert.equal((await request(f, f.imagePath, { headers: invalid })).status, 503);
  }
  const publicImage = await request(f); assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get('ratelimit-remaining'), '799');
  assert.equal((await request(f, '/api/')).headers.get('ratelimit-remaining'), '59');
});

for (const [name, method, route, authorization, status] of [
  ['private unauthorized', 'GET', id => '/api/v1/product-media/' + id + '/private', null, 401],
  ['private owner', 'GET', id => '/api/v1/product-media/' + id + '/private', 'Bearer owner', 200],
  ['private other owner', 'GET', id => '/api/v1/product-media/' + id + '/private', 'Bearer other', 403],
  ['upload unauthorized', 'POST', () => '/api/v1/product-media/upload/submission', null, 401],
  ['upload invalid token', 'POST', () => '/api/v1/product-media/upload/catalog', 'Bearer invalid', 401],
  ['Admin mutation', 'POST', () => '/api/v1/admin/product-submissions/fixture/approve', null, 404],
  ['API key mutation', 'POST', () => '/api/v1/api-keys', null, 404],
  ['checkout', 'POST', () => '/api/v1/checkout', null, 404],
  ['authentication', 'POST', () => '/api/v1/auth/login', null, 404],
]) test(name + ' remains in the strict shared bucket', async t => {
  const f = await fixture(t), id = f.imagePath.split('/')[4];
  for (let i = 0; i < 60; i++) {
    const r = await request(f, route(id), { method, headers: { ...headers('203.0.113.8'), ...(authorization ? { authorization } : {}) } });
    assert.equal(r.status, status); assert.equal(r.headers.get('ratelimit-limit'), '60');
    if (name === 'private owner') assert.equal(r.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal((await request(f, route(id), { method })).status, 429);
  assert.equal((await request(f)).status, 200);
});

test('method/path variants cannot acquire the public GET policy', async t => {
  const f = await fixture(t);
  for (const [route, method] of [[f.imagePath, 'HEAD'], [f.imagePath, 'POST'], [f.imagePath+'/', 'GET'],
    [f.imagePath+'?token=unapproved', 'GET'], [f.imagePath.replace('/api/', '/API/'), 'GET'],
    [f.imagePath.replace('/image', '/%69mage'), 'GET'], [f.imagePath+'/private', 'GET'],
    [f.imagePath.replace('/image', '/images'), 'GET']]) {
    const r = await request(f, route, { method }); assert.equal(r.headers.get('ratelimit-limit'), '60', route);
  }
});

test('unpublished/missing/misbound/invisible images still deny bytes and consume bounded public capacity', async t => {
  const f = await fixture(t), id = f.imagePath.split('/')[4];
  f.asset.state = 'pending'; f.db.seed('product_media/' + id, f.asset);
  const pending = await request(f); assert.equal(pending.status, 404); assert.equal(pending.headers.get('cache-control'), 'no-store');
  f.asset.state = 'published'; f.db.seed('product_media/' + id, f.asset);
  f.product.image_asset_id = missingId; f.db.seed('products/fixture', f.product);
  assert.equal((await request(f)).status, 404);
  f.product.image_asset_id = id; f.product.status = 'Inactive'; f.product.is_active = false;
  f.db.seed('products/fixture', f.product);
  assert.equal((await request(f)).status, 404);
  assert.equal((await request(f, f.imagePath.replace(id, missingId))).status, 404);
});
