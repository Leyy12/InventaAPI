import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogHandlers } from '../../../services/catalog-management.js';
import { planSizeMerges, mergedName, nameKey } from '../../../services/catalog-merge.js';
import { identityId } from '../../../services/catalog-contract.js';
import { productIdentityKeys } from '../../../services/product-contract.js';
import { memoryStore, invoke } from '../r2a/memory-store.mjs';

// Three sizes of one tuna saved as separate products by imports, plus products that must stay apart.
const tuna = (name, brand, size, extra = {}) => ({ name, brand, segment: 'Grocery', category: 'Canned Goods', status: 'Active', is_active: true,
  variants: [{ size, sku: '' }], ...extra });
const seed = {
  'users/admin': { role: 'Admin' }, 'users/customer': { role: 'Developer' },
  'products/a': tuna('555 TUNA AFRITADA 110G', '555', '110 g', { image_url: 'https://img.example.net/a.jpg' }),
  'products/b': tuna('555 tuna afritada 110g', 'Generic', '110g'),
  'products/c': tuna('555 Tuna Afritada 155G', '555', '155 g'),
  'products/d': tuna('Paracetamol', 'Biogesic', '500mg', { segment: 'Pharmacy' }),
  'products/e': tuna('Paracetamol', 'Tylenol', '250mg', { segment: 'Pharmacy' }),
  'api_keys/k1': { userId: 'customer', linkedProductIds: ['b', 'd'], linkedVariantSelections: {} },
  'api_keys/k2': { userId: 'customer', linkedProductIds: [], linkedVariantSelections: { c: ['|155 g'] } },
};
function fixture() {
  const db = memoryStore(seed, { queryConflicts: false });
  // Reservations as the catalog writer leaves them: every identity bound to its product.
  for (const [path, data] of Object.entries(seed)) if (path.startsWith('products/')) {
    const id = path.split('/')[1];
    for (const key of productIdentityKeys({ ...data, id })) db.seed?.(`product_submission_identity/${identityId(key)}`, { version: 1, identity: key, productId: id, state: 'bound' });
  }
  const handlers = createCatalogHandlers({ getDb: () => db, now: () => new Date('2026-10-23T12:00:00Z'), verifyIdToken: async token => ({ uid: token }) });
  return { db, call: (name, body, token = 'admin') => invoke(handlers[name], { body, token }) };
}

test('names compare without sizes; tags such as (p) are kept', () => {
  assert.equal(nameKey('555 TUNA AFRITADA 110G'), nameKey('555 tuna afritada'));
  assert.equal(nameKey('century tuna 1.5 L'), nameKey('Century Tuna'));
  assert.notEqual(nameKey('century tuna (p) 155g'), nameKey('century tuna (h) 155g')); // tags may mean different kinds
  assert.equal(mergedName('555 TUNA AFRITADA 110G'), '555 TUNA AFRITADA');
});
test('plan groups sizes of one product; different real brands stay apart', () => {
  const records = Object.entries(seed).filter(([path]) => path.startsWith('products/')).map(([path, data]) => ({ id: path.split('/')[1], data }));
  const plan = planSizeMerges(records);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].name, '555 TUNA AFRITADA');
  assert.deepEqual([plan[0].keeperId, ...plan[0].duplicateIds].sort(), ['a', 'b', 'c']);
});
test('only admins can see or run a merge', async () => {
  const f = fixture();
  assert.equal((await f.call('mergePlan', {}, 'customer')).statusCode, 403);
  assert.equal((await f.call('merge', { groups: [{ keeperId: 'a', duplicateIds: ['b'] }] }, 'customer')).statusCode, 403);
});
test('merge keeps one product with every size, removes the rest and repoints API keys', async () => {
  const f = fixture();
  const plan = (await f.call('mergePlan', {})).body.groups[0];
  const result = await f.call('merge', { groups: [{ keeperId: plan.keeperId, duplicateIds: plan.duplicateIds }] });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.results[0].status, 'MERGED', JSON.stringify(result.body));
  const products = Object.entries(f.db.dump()).filter(([path]) => path.startsWith('products/'));
  assert.deepEqual(products.map(([path]) => path).sort(), ['products/a', 'products/d', 'products/e']);
  const kept = f.db.read('products/a');
  assert.equal(kept.name, '555 TUNA AFRITADA');
  assert.deepEqual(kept.variants.map(variant => variant.size), ['110 g', '155 g']); // "110g" is the same size as "110 g"
  assert.equal(kept.image_url, 'https://img.example.net/a.jpg');
  // A key that had the whole duplicate now has those sizes of the kept product.
  assert.deepEqual(f.db.read('api_keys/k1').linkedProductIds, ['d']);
  assert.deepEqual(f.db.read('api_keys/k1').linkedVariantSelections, { a: ['|110 g'] });
  assert.deepEqual(f.db.read('api_keys/k2').linkedVariantSelections, { a: ['|155 g'] });
  // Every identity of the merged product is reserved for it.
  for (const key of productIdentityKeys({ ...kept, id: 'a' })) {
    assert.equal(f.db.read(`product_submission_identity/${identityId(key)}`).productId, 'a');
  }
});
test('a stale selection is refused without changing anything', async () => {
  const f = fixture(), before = JSON.stringify(f.db.dump());
  const result = await f.call('merge', { groups: [{ keeperId: 'd', duplicateIds: ['e'] }] });
  assert.equal(result.body.results[0].status, 'FAILED');
  assert.equal(JSON.stringify(f.db.dump()), before);
  assert.equal((await f.call('merge', { groups: [] })).statusCode, 400);
});

test('word order and capitals do not matter for matching', () => {
  assert.equal(nameKey('100% Pure Tuna 150g'), nameKey('pure tuna 100%'));
});
test('manual merge: Admin picks the name; each product becomes a flavor and keeps its photo on its sizes', async () => {
  const f = fixture();
  f.db.seed('products/f', tuna('155 TUNA CALDERETA 155G', 'Generic', '155g', { image_url: 'https://img.example.net/caldereta.jpg' }));
  f.db.seed('products/g', tuna('555 tuna adobo 155g', '555', '155g', { image_url: 'https://img.example.net/adobo.jpg' }));
  const result = await f.call('merge', { groups: [{ keeperId: 'g', duplicateIds: ['f'], manual: true, name: '555 Tuna',
    flavors: { g: 'Adobo', f: 'Caldereta' } }] });
  assert.equal(result.body.results[0].status, 'MERGED', JSON.stringify(result.body));
  const kept = f.db.read('products/g');
  assert.equal(kept.name, '555 Tuna'); assert.equal(kept.brand, '555');
  assert.deepEqual(kept.variants.map(variant => [variant.flavor, variant.size, variant.image_url ?? '']),
    [['Adobo', '155g', ''], ['Caldereta', '155g', 'https://img.example.net/caldereta.jpg']]);
  assert.equal(kept.image_url, 'https://img.example.net/adobo.jpg');
  assert.equal(f.db.read('products/f'), undefined);
});
test('manual merge refuses mixed segments and bad input', async () => {
  const f = fixture();
  const mixed = await f.call('merge', { groups: [{ keeperId: 'a', duplicateIds: ['d'], manual: true, name: 'Mixed' }] });
  assert.equal(mixed.body.results[0].status, 'FAILED'); assert.match(mixed.body.results[0].reason, /one segment/u);
  assert.equal((await f.call('merge', { groups: [{ keeperId: 'a', duplicateIds: ['b'], manual: true, name: '' }] })).statusCode, 400);
  assert.equal((await f.call('merge', { groups: [{ keeperId: 'a', duplicateIds: ['b'], manual: true, name: 'X', flavors: { zz: 'Nope' } }] })).statusCode, 400);
});
test('a merged product photo fills an existing size of the same flavor', async () => {
  const f = fixture();
  f.db.seed('products/h', tuna('Century Tuna', 'Century', '155g', { image_url: 'https://img.example.net/flakes.jpg',
    variants: [{ flavor: 'Flakes in Oil', size: '155g' }, { flavor: 'Adobo', size: '155g' }] }));
  f.db.seed('products/i', tuna('CENTURY TUNA ADOBO 155G', 'Century-Tuna', '155 g', { image_url: 'https://img.example.net/adobo.jpg' }));
  const result = await f.call('merge', { groups: [{ keeperId: 'h', duplicateIds: ['i'], manual: true, name: 'Century Tuna', flavors: { i: 'Adobo' } }] });
  assert.equal(result.body.results[0].status, 'MERGED', JSON.stringify(result.body));
  assert.deepEqual(f.db.read('products/h').variants.map(variant => [variant.flavor, variant.size, variant.image_url ?? '']),
    [['Flakes in Oil', '155g', ''], ['Adobo', '155g', 'https://img.example.net/adobo.jpg']]);
});
