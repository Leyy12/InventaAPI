import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as customer from '../../../dashboard/src/lib/product-image-url.ts';
import * as admin from '../../../admin-panel/src/lib/product-image-url.ts';
import { normalizeProductImageUrl } from '../../../services/product-submission-contract.js';
import { createProductSubmissionHandlers } from '../../../services/product-submissions.js';
import { projectProduct } from '../../../services/product-contract.js';
import { memoryFirestore, invoke } from '../r2a/memory-firestore.mjs';

const url = 'https://images.example.invalid/photo.jpg';
for (const [name, api] of Object.entries({ customer, admin })) {
  for (const value of ['', url, ' ' + url + '?size=2#photo ']) test(`${name}: valid URL ${value}`, () => {
    assert.equal(api.normalizeProductImageUrl(value), value.trim());
    assert.equal(api.productImageSource({ image_url: value }), value.trim());
  });
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,aA==', 'file:///a', 'http://example.invalid/a',
    'https://user:pass@example.invalid/a', 'https://', '//example.invalid/a', 'https://example.invalid/a b',
    'https://example.invalid\\a', url + 'a'.repeat(2048), 42, {}]) {
    test(`${name}: invalid URL rejected ${String(value).slice(0, 60)}`, () => {
      assert.throws(() => api.normalizeProductImageUrl(value));
      assert.throws(() => normalizeProductImageUrl(value));
      assert.equal(api.productImageSource({ image_url: value }), '');
      assert.equal(api.productImageSource({ image: value }), '');
    });
  }
  for (const record of [{}, { image_url: null }, { image_url: undefined }, { image: '' },
    { image_url: '', image: url }, { image_url: 'javascript:x', image: url }]) {
    test(`${name}: missing/cleared/invalid canonical has safe fallback ${JSON.stringify(record)}`, () => {
      assert.equal(api.productImageSource(record), '');
    });
  }
  test(`${name}: legacy HTTPS image and canonical precedence`, () => {
    assert.equal(api.productImageSource({ image: url }), url);
    assert.equal(api.productImageSource({ image_url: url, image: 'https://other.invalid/x' }), url);
  });
  test(`${name}: broken image hides locally and exposes icon without a replacement request`, () => {
    const classes = new Set(['hidden', 'fallback']);
    const img = { src: url, style: {}, nextElementSibling: { classList: { remove: key => classes.delete(key) } } };
    api.showProductImageFallback({ currentTarget: img });
    api.showProductImageFallback({ currentTarget: img });
    assert.equal(img.style.display, 'none'); assert.equal(classes.has('hidden'), false);
    assert.equal(classes.has('fallback'), true); assert.equal(img.src, url);
    assert.doesNotThrow(() => api.showProductImageFallback({ currentTarget: { style: {}, nextElementSibling: null } }));
  });
}

test('Customer URL persists only as reviewed metadata before Admin publication', async () => {
  const db = memoryFirestore({ 'users/customer': { role: 'Developer', plan: 'Free' }, 'users/admin': { role: 'Admin' } });
  const handlers = createProductSubmissionHandlers({ getDb: () => db, now: () => new Date('2026-09-20T01:00:00.000Z'),
    makeId: () => 'media-review', verifyIdToken: async token => ({ uid: token }) });
  const result = await invoke(handlers.submit, { token: 'customer', headers: { 'idempotency-key': 'media-operation-0001' },
    body: { name: 'Media Test', brand: 'Brand', segment: 'Grocery', category: 'Food', variants: [{ size: '1kg', price: 10 }], image_url: url } });
  assert.equal(result.statusCode, 201);
  assert.equal(db.read('product_requests/media-review').content.image_url, url);
  assert.equal(Object.keys(db.dump()).filter(key => key.startsWith('products/')).length, 0);
  assert.equal((await invoke(handlers.approve, { token: 'customer', params: { id: result.body.id } })).statusCode, 403);
  assert.equal((await invoke(handlers.approve, { token: 'admin', params: { id: result.body.id } })).statusCode, 200);
  const products = Object.entries(db.dump()).filter(([key]) => key.startsWith('products/'));
  assert.equal(products.length, 1); assert.equal(products[0][1].image_url, url);
});

test('canonical projection supports products without any image', () => {
  assert.equal(projectProduct({ name: 'Old', brand: 'Brand', segment: 'Grocery' }).image_url, '');
});
test('test runtime disallows Firebase, transports and production bootstrap', async () => {
  for (const module of ['node:https', 'node:net', 'firebase/storage', 'firebase-admin', '../../../database/firebase.js']) {
    await assert.rejects(import(module));
  }
  assert.throws(() => globalThis['fetch'](url));
  assert.throws(() => new globalThis.WebSocket(url));
});
