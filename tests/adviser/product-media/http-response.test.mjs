import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import http from 'node:http';
import { mediaHttpFixture, assetId, missingId } from './http-fixture.mjs';

const expected = process.env.PRODUCT_MEDIA_TEST_BEFORE === 'true' ? 'same-origin' : 'cross-origin';
let fixture;
before(async () => { fixture = await mediaHttpFixture(); });
after(async () => { await fixture?.close(); });
const request = (path = fixture.imagePath, options = {}) => fetch(fixture.origin + path,
  { ...options, signal: AbortSignal.timeout(10000) });
const protectedResponse = response => {
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
};
const denied = async (path, status, options) => {
  const response = await request(path, options);
  assert.equal(response.status, status); protectedResponse(response);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.text();
  assert.doesNotMatch(body, /product-media\/.*\.webp|firebaseStorageDownloadTokens|signedUrl|privateKey/);
};

test('anonymous published image: effective Helmet header, exact decodable bytes and existing cache policy', async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cross-origin-resource-policy'), expected);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await response.arrayBuffer()); assert.deepEqual(bytes, fixture.bytes);
  const { format, width, height } = await sharp(bytes).metadata();
  assert.deepEqual({ format, width, height }, { format: 'webp', width: 140, height: 240 });
  console.log(JSON.stringify({ phase: expected, status: response.status, contentType: response.headers.get('content-type'),
    corp: expected, cache: response.headers.get('cache-control'), bytes: bytes.length, width, height }));
});
for (const state of ['ready', 'pending', 'rejected', 'retired', 'uploading']) test(`${state} media cannot acquire public serving policy`, async () => {
  fixture.db.seed(`product_media/${assetId}`, { ...fixture.asset, state });
  try { await denied(fixture.imagePath, 404); } finally { fixture.db.seed(`product_media/${assetId}`, fixture.asset); }
});
for (const [name, product] of [['missing/deleted', null], ['wrong binding', { image_asset_id: missingId }],
  ['inactive', { is_active: false }], ['archived', { status: 'Archived' }]]) test(`${name} product denies published media`, async () => {
  if (product) fixture.db.seed('products/fixture', { ...fixture.product, ...product }); else fixture.db.remove('products/fixture');
  try { await denied(fixture.imagePath, 404); } finally { fixture.db.seed('products/fixture', fixture.product); }
});
for (const [name, path] of [['missing asset', `/api/v1/product-media/${missingId}/image`],
  ['invalid ID', '/api/v1/product-media/not-an-id/image'], ['unexpected query', `/api/v1/product-media/${assetId}/image?token=forged`],
  ['malformed encoded path', '/api/v1/product-media/%ZZ/image']]) test(name, async () => {
  if (name === 'malformed encoded path') { const response = await request(path); assert.equal(response.status, 500); protectedResponse(response); }
  else await denied(path, 404);
});
for (const actor of ['owner', 'admin']) test(`private pending ${actor} access retains restricted policy and bytes`, async () => {
  fixture.db.seed(`product_media/${assetId}`, { ...fixture.asset, state: 'pending' });
  try {
    const response = await request(`/api/v1/product-media/${assetId}/private`, { headers: { Authorization: `Bearer ${actor}` } });
    assert.equal(response.status, 200); protectedResponse(response);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixture.bytes);
  } finally { fixture.db.seed(`product_media/${assetId}`, fixture.asset); }
});
for (const [name, token, status] of [['anonymous', '', 401], ['cross-account', 'other', 403], ['revoked token', 'revoked', 401]])
  test(`private ${name} denial`, async () => {
    fixture.db.seed(`product_media/${assetId}`, { ...fixture.asset, state: 'pending' });
    try { await denied(`/api/v1/product-media/${assetId}/private`, status, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
    finally { fixture.db.seed(`product_media/${assetId}`, fixture.asset); }
  });
for (const fault of ['read', 'corrupt']) test(`storage ${fault} failure does not gain public policy`, async () => {
  fixture.faults[fault] = true;
  try { await denied(fixture.imagePath, 503); } finally { fixture.faults[fault] = false; }
});
test('disabled feature remains protected', async () => {
  const disabled = await mediaHttpFixture({ enabled: false });
  try { const response = await fetch(disabled.origin + disabled.imagePath); assert.equal(response.status, 503); protectedResponse(response); }
  finally { await disabled.close(); }
});
test('unrelated real API endpoint retains global Helmet/CSP protections', async () => {
  const response = await request('/api'); assert.equal(response.status, 200); protectedResponse(response);
  const image = await request();
  for (const header of ['content-security-policy', 'x-frame-options', 'referrer-policy', 'cross-origin-opener-policy']) {
    assert.ok(response.headers.get(header)); assert.equal(image.headers.get(header), response.headers.get(header));
  }
});
test('existing Express conditional 304 keeps the authorized image policy and cache TTL', async () => {
  const original = await request(); const etag = original.headers.get('etag'); assert.ok(etag);
  // fetch adds Cache-Control: no-cache to conditional requests. Use native HTTP
  // to exercise the browser/CDN revalidation path without changing server caches.
  const response = await new Promise((resolve, reject) => {
    http.get(fixture.origin + fixture.imagePath, { headers: { 'If-None-Match': etag }, timeout: 10000 }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(Error('Conditional request timed out')); });
  });
  assert.equal(response.status, 304); assert.equal(response.headers['cross-origin-resource-policy'], expected);
  assert.equal(response.headers['cache-control'], 'public, max-age=300'); assert.equal(response.bytes.length, 0);
});
