import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function files(dir) {
  return readdirSync(new URL(dir + '/', root), { withFileTypes: true }).flatMap(entry => {
    const path = dir + '/' + entry.name;
    if (['node_modules', '.next', '.git', 'lib'].includes(entry.name) && dir === 'functions') return [];
    return entry.isDirectory() ? files(path) : /\.(?:[cm]?js|tsx?|backup)$/u.test(path) ? [path] : [];
  });
}
const frontends = ['dashboard', 'admin-panel'];
const dormant = ['admin-panel/src/components/admin/AdminProductTable.tsx', 'dashboard/src/app/dashboard/products/page.tsx.backup'];
const storage = /firebase\/storage|uploadBytes|uploadBytesResumable|getDownloadURL|deleteObject|getStorage/u;
test('Storage references are confined to initialization and the two dormant sources', () => {
  const found = frontends.flatMap(app => files(app + '/src')).filter(path => storage.test(read(path))).sort();
  assert.deepEqual(found, [...dormant, ...frontends.map(app => app + '/src/lib/firebase/config.ts')].sort());
  for (const app of frontends) {
    for (const path of files(app + '/src').filter(path => !dormant.includes(path))) {
      assert.doesNotMatch(read(path), /AdminProductTable|page\.tsx\.backup|\.storage\s*\(|\.bucket\s*\(|\b(?:uploadString|uploadBytes|uploadBytesResumable|deleteObject)\s*\(/u, path);
    }
  }
});
test('actual product pages mount URL workflows, not binary upload components', () => {
  const customer = read('dashboard/src/app/dashboard/products/page.tsx');
  const form = read('dashboard/src/components/products/AddProductModal.tsx');
  const admin = read('admin-panel/src/app/products/page.tsx');
  assert.match(customer, /<AddProductModal/u);
  assert.match(form, /image_url: normalizeProductImageUrl\(imageUrl\)/u);
  assert.match(form, /\/api\/v1\/product-submissions/u);
  assert.match(admin, /<AddProductModal/u); assert.match(admin, /<EditModal/u);
  assert.match(admin, /image_url: normalizeProductImageUrl\(imageUrl\)/u);
  assert.match(admin, /const image_url = normalizeProductImageUrl\(imageUrl\)/u);
  assert.doesNotMatch(customer + form, /type="file"|firebase\/storage/u);
});
for (const app of frontends) test(`${app}: image markup wires validated URL, local fallback and reset on URL changes`, () => {
  const page = read(app + '/src/app/' + (app === 'dashboard' ? 'dashboard/' : '') + 'products/page.tsx');
  assert.match(page, /<div key=\{productImageSource\(product\)\}/u);
  assert.match(page, /<img\s+src=\{productImageSource\(product\)\}/u);
  assert.match(page, /onError=\{showProductImageFallback\}/u);
  assert.match(page, /referrerPolicy="no-referrer"/u);
  assert.match(page, /productImageSource\(product\) \? 'hidden' : ''/u);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|next\/image|src=\{product\.image/u);
  assert.doesNotMatch(read(app + '/next.config.ts'), /remotePatterns|domains\s*:/u);
});
test('backend and Functions contain no Storage object operations or image URL transport', () => {
  const paths = ['server.js', ...['routes', 'services', 'functions'].flatMap(files)];
  for (const path of paths) {
    const source = read(path);
    assert.doesNotMatch(source, /firebase\/storage|\.storage\s*\(|\.bucket\s*\(|uploadBytes|downloadURL/iu, path);
    if (/image_url|imageUrl/u.test(source)) {
      assert.doesNotMatch(source, /\bfetch\s*\(|\baxios\b|https?\.(?:get|request)|\bsharp\s*\(/u, path);
    }
  }
});
test('Storage remains absent from deployment/emulators, with explicit non-deployment documentation', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.equal(config.storage, undefined); assert.equal(config.emulators.storage, undefined);
  assert.equal(config.firestore.rules, 'firestore.rules');
  const doc = read('docs/adviser-r2b-media-storage.md');
  for (const phrase of ['MODE A — URL-ONLY', 'DORMANT / NOT PART OF ACTIVE PRODUCT FLOW',
    'DO NOT DEPLOY', 'alerts NOT implemented', 'NOT APPLICABLE', 'do not cap charges']) assert.ok(doc.includes(phrase), phrase);
  assert.match(read('docs/release-runbook.md'), /Do NOT deploy `storage.rules`/u);
  assert.match(read('docs/release-environment.md'), /R2B is URL-only/u);
  assert.match(doc, /firebase\.google\.com\/docs\/storage\/monitor-storage/u);
});
test('standalone frontend image contracts stay identical', () => {
  assert.equal(read('dashboard/src/lib/product-image-url.ts'), read('admin-panel/src/lib/product-image-url.ts'));
});
