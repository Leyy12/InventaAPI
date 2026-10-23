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
const dormant = ['dashboard/src/app/dashboard/products/page.tsx.backup'];
const storage = /firebase\/storage|uploadBytes|uploadBytesResumable|getDownloadURL|deleteObject|getStorage/u;
test('Storage references are confined to initialization and the dormant backup source', () => {
  const found = frontends.flatMap(app => files(app + '/src')).filter(path => storage.test(read(path))).sort();
  // Browsers never touch photo storage: uploads go through the API.
  assert.deepEqual(found, dormant);
  for (const app of frontends) {
    for (const path of files(app + '/src').filter(path => !dormant.includes(path))) {
      assert.doesNotMatch(read(path), /AdminProductTable|page\.tsx\.backup|\.storage\s*\(|\.bucket\s*\(|\b(?:uploadString|uploadBytes|uploadBytesResumable|deleteObject)\s*\(/u, path);
    }
  }
});
test('actual product pages mount managed pickers and retain HTTPS compatibility without direct Storage access', () => {
  const customer = read('dashboard/src/app/dashboard/products/page.tsx');
  const form = read('dashboard/src/components/products/AddProductModal.tsx');
  const admin = read('admin-panel/src/app/products/page.tsx');
  assert.match(customer, /<AddProductModal/u);
  assert.match(form, /image_url: normalizeProductImageUrl\(imageUrl\)/u);
  assert.match(form, /\/api\/v1\/product-submissions/u);
  assert.match(admin, /<AddProductModal/u); assert.match(admin, /<EditModal/u);
  assert.match(admin, /image_url: normalizeProductImageUrl\(imageUrl\)/u);
  assert.match(admin, /const image_url = normalizeProductImageUrl\(imageUrl\)/u);
  assert.match(form + admin, /<ProductImageField/u);
  assert.match(read('dashboard/src/components/products/ProductImageField.tsx'), /type="file"/u);
  assert.match(read('dashboard/src/lib/product-media-client.ts'), /\/api\/v1\/product-media\/upload\//u);
  assert.doesNotMatch(customer + form + admin, /firebase\/storage|uploadBytes|deleteObject/u);
});
for (const app of frontends) test(`${app}: image markup wires validated URL, local fallback and reset on URL changes`, () => {
  const page = read(app + '/src/app/' + (app === 'dashboard' ? 'dashboard/' : '') + 'products/page.tsx');
  // The customer card may show the photo of a picked variant; it is validated the same way.
  const image = String.raw`productImageSource\((?:product|variantPhoto\(product, productVars\))\)`;
  assert.match(page, new RegExp(String.raw`<div key=\{` + image + String.raw`\}`, 'u'));
  assert.match(page, new RegExp(String.raw`<img\s+src=\{` + image + String.raw`\}`, 'u'));
  assert.match(page, /onError=\{showProductImageFallback\}/u);
  assert.match(page, /referrerPolicy="no-referrer"/u);
  assert.match(page, new RegExp(image + String.raw` \? 'hidden' : ''`, 'u'));
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|next\/image|src=\{product\.image/u);
  assert.doesNotMatch(read(app + '/next.config.ts'), /remotePatterns|domains\s*:/u);
});
test('only the managed adapter handles object bytes; URL metadata is never fetched by catalog/Functions', () => {
  const paths = ['server.js', ...['routes', 'services', 'functions'].flatMap(files)];
  for (const path of paths) {
    const source = read(path);
    if (['routes/product-media.js', 'services/product-media-processing.js'].includes(path)) continue;
    assert.doesNotMatch(source, /firebase\/storage|\.storage\s*\(|\.bucket\s*\(|uploadBytes|downloadURL/iu, path);
    if (/image_url|imageUrl/u.test(source)) {
      assert.doesNotMatch(source, /\bfetch\s*\(|\baxios\b|https?\.(?:get|request)|\bsharp\s*\(/u, path);
    }
  }
  const route = read('routes/product-media.js'), adapter = read('services/supabase-storage.js');
  assert.match(route, /PRODUCT_MEDIA_ENABLED === 'true'/u); assert.match(route, /createSupabaseStorage\(/u);
  // Write once, never overwrite; private bucket only; no public or signed links.
  assert.match(adapter, /'x-upsert': 'false'/u);
  assert.match(adapter, /meta\.public !== false\) throw/u);
  assert.doesNotMatch(route + adapter, /\/object\/public\/|\/object\/sign\/|createSignedUrl|getPublicUrl/u);
  assert.match(adapter, /mediaDigest\(await read\(path\)\) !== digest\) throw/u);
  assert.match(read('product-media.storage.rules'), /allow read, write: if false/u);
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
