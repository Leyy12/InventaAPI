import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
test('Customer Add Product CTA opens secured modal; no nonexistent request route', () => {
  const page = read('dashboard/src/app/dashboard/products/page.tsx');
  assert.match(page, /setShowAddProductModal\(true\)/u); assert.match(page, /<AddProductModal/u);
  assert.doesNotMatch(page + read('dashboard/src/components/product-request/ProductNotFound.tsx'), /\/dashboard\/requests\/new/u);
  const form = read('dashboard/src/components/products/AddProductModal.tsx');
  assert.doesNotMatch(form, /firebase\/firestore|addDoc|notifyAdminNewRequest|directly add the product/u);
  assert.match(form, /\/api\/v1\/product-submissions/u); assert.match(form, /Idempotency-Key/u);
  assert.match(form, /Submitted for review/u); assert.match(form, /attempt\.current\.body/u);
  assert.match(form, /busy\.current/u); assert.match(form, /image_url: normalizeProductImageUrl\(imageUrl\)/u);
});
test('Admin Add and Edit validate and persist canonical image URL without uploads', () => {
  const source = read('admin-panel/src/app/products/page.tsx');
  const edit = source.slice(source.indexOf('function EditModal'), source.indexOf('function AddProductModal'));
  const add = source.slice(source.indexOf('function AddProductModal'));
  assert.match(edit, /product\.image_url \?\? product\.image \?\? ""/u);
  assert.match(edit, /image_url: normalizeProductImageUrl\(imageUrl\)/u);
  assert.match(read('services/catalog-writer.js'), /product.image = ''/u);
  assert.match(edit, /catalogRequest/u);
  assert.match(add, /const image_url = normalizeProductImageUrl\(imageUrl\)/u);
  assert.match(add, /variants: cleaned, image_url/u);
  assert.match(add, /catalogRequest/u);
  assert.equal((source.match(/Image URL \(optional, HTTPS\)/gu) || []).length, 2);
  assert.doesNotMatch(edit + add, /uploadBytes|firebase\/storage/u);
});
test('Admin review navigation and endpoints are wired with revocation-aware SDK verification', () => {
  assert.match(read('admin-panel/src/components/layout/AdminSidebar.tsx'), /href: "\/submissions"/u);
  const ui = read('admin-panel/src/app/submissions/page.tsx');
  for (const value of ['approve', 'reject', 'image_url', 'userId', 'createdAt']) assert.ok(ui.includes(value));
  const route = read('routes/product-submissions.js');
  assert.match(route, /getAuth\(\)\.verifyIdToken\(token, checkRevoked\)/u);
  assert.match(route, /firebase-admin\/auth/u); assert.match(route, /firebase-admin\/firestore/u);
  const server = read('server.js');
  assert.match(server, /app.use\('\/api\/v1\/product-submissions', customerSubmissionsRouter\)/u);
  assert.match(server, /app.use\('\/api\/v1\/admin\/product-submissions', adminSubmissionsRouter\)/u);
  assert.match(server, /allowedHeaders: \[[^\]]*'Idempotency-Key'/u);
});
test('new server path has no remote image or provider I/O', () => {
  const service = read('services/product-submissions.js') + read('services/product-submission-contract.js');
  assert.doesNotMatch(service, /\bfetch\b|https\.get|axios|paymongo|firebase\/storage/iu);
});
test('active Customer submission guidance does not promise suspension', () => {
  const guidance = read('dashboard/src/components/product-request/ProductNotFound.tsx');
  const form = read('dashboard/src/components/products/AddProductModal.tsx');
  const catalog = read('dashboard/src/app/dashboard/products/page.tsx');
  assert.doesNotMatch(guidance + form + catalog, /suspension|suspend/iu);
  assert.match(guidance, /Fabricated or misleading details will be rejected\./u);
});
test('review page preserves status, uses tested conflict helper and gates stale actions', () => {
  const page = read('admin-panel/src/app/submissions/page.tsx');
  assert.match(page, /status: response.status/u);
  assert.match(page, /await reviewSubmission<Submission>/u);
  assert.match(page, /read: \(\) => request\(`/u);
  assert.match(page, /row.id === id \? result.submission : row/u);
  assert.match(page, /row.status === 'submitted' && row.content && !lockedIds.includes\(row.id\)/u);
});
