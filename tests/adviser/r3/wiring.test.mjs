import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
test('active Admin mutations exclusively use authenticated backend and preserve variants', () => {
  const page = read('admin-panel/src/app/products/page.tsx'), importer = read('admin-panel/src/components/admin/ImportCsvModal.tsx');
  assert.doesNotMatch(page + importer, /\b(?:addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/u);
  assert.match(page, /\.\.\.v, price: catalogPrice\(v.price\)/u);
  assert.match(page, /expectedRevision: product.catalogRevision \?\? 0/u);
  assert.match(page, /expectedRevision: p.catalogRevision \?\? 0/u);
  assert.doesNotMatch(page, /ADD_NEW|Variants will be appended/u);
  const client = read('admin-panel/src/lib/catalog-client.ts');
  assert.match(client, /user.getIdToken\(\)/u); assert.match(client, /Authorization: `Bearer/u);
  assert.match(client, /\/api\/v1\/admin\/catalog/u);
});
test('PapaParse errors block preview and duplicate headers survive for server validation', () => {
  const source = read('admin-panel/src/components/admin/ImportCsvModal.tsx');
  assert.match(source, /header: false/u); assert.match(source, /parsed.errors.length/u);
  assert.match(source, /\/import\/preview/u); assert.match(source, /\/import\/commit/u);
  assert.match(source, /previewId: preview.previewId/u); assert.match(source, /acknowledgePossible: acknowledge/u);
  assert.match(source, /row.status === 'NEW'/u);
});
test('submission approval delegates product mutation while keeping final decision in its transaction', () => {
  const source = read('services/product-submissions.js');
  assert.match(source, /await prepareCatalogWrite/u); assert.match(source, /prepared\?\.apply\(\)/u);
  assert.match(source, /tx.update\(ref, \{ status: decision/u);
  assert.doesNotMatch(source, /tx.set\(productRef|product_submission_identity/u);
});
test('all catalog endpoints are mounted and use verified Admin SDK token dependencies', () => {
  const router = read('routes/catalog-management.js');
  assert.match(router, /getAuth\(\).verifyIdToken\(token, revoked\)/u);
  for (const action of ['create', 'edit', 'archive', 'restore', 'delete', 'preview', 'commit']) assert.ok(router.includes('handlers.' + action));
  assert.match(read('server.js'), /app.use\('\/api\/v1\/admin\/catalog', catalogManagementRouter\)/u);
});
test('runtime isolation blocks network/SDK/configuration and preserves Phase 1 authority', async () => {
  for (const module of ['firebase-admin', 'node:http', 'node:dns', '../../../database/firebase.js']) await assert.rejects(import(module));
  assert.throws(() => globalThis['fetch']('https://example.invalid'));
  assert.match(read('services/catalog-writer.js'), /productIdentityKeys/u);
  assert.doesNotMatch(read('services/catalog-writer.js') + read('services/catalog-import.js'), /\bfetch\s*\(|\bdns\b|firebase\/storage/u);
});
