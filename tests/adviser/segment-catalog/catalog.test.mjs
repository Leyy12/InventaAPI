import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogQuery, catalogResult, createCustomerCatalogHandler } from '../../../services/customer-catalog.js';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';

export function fixtureRecords() {
  const rows = {};
  const add = (segment, count, prefix, status = 'Active') => {
    for (let i = 0; i < count; i++) rows[`products/${prefix}-${i}`] = {
      name: `${prefix} ${i}`, category: 'Synthetic', segment, status,
      is_active: true, ...(prefix.includes('generated') ? { origin: 'customer-submission' } : {}),
    };
  };
  add('Hardware', 120, 'hardware-system'); add('Grocery', 80, 'grocery-system');
  add('Hardware', 3, 'hardware-generated'); add('Grocery', 2, 'grocery-generated');
  add('Hardware', 2, 'hardware-pending', 'pending'); add('Grocery', 1, 'grocery-rejected', 'rejected');
  rows['product_requests/not-reviewed'] = { status: 'submitted', content: { segment: 'Hardware' } };
  rows['products/unassigned'] = { name: 'Unassigned', category: 'Synthetic', status: 'Active' };
  rows['products/invalid-segment'] = { name: 'Unknown', category: 'Synthetic', segment: 'Other', status: 'Active' };
  return rows;
}

for (const [segment, total, other] of [['Hardware', 123, 'Grocery'], ['Grocery', 82, 'Hardware']]) {
  test(`${segment}: exact unique availability ${total}, generated products included, other segment absent`, async () => {
    const db = memoryFirestore(fixtureRecords());
    const calls = [], collection = db.collection;
    db.collection = name => {
      const query = collection(name);
      const where = query.where;
      query.where = (...args) => { calls.push(args); return where(...args); };
      query.get = () => { throw new Error('Global scan prohibited for selected segment'); };
      return query;
    };
    const result = await invoke(createCustomerCatalogHandler({ getDb: () => db }), { query: { businessSegment: segment } });
    assert.equal(result.statusCode, 200); assert.equal(result.body.availability.total, total);
    assert.equal(result.body.pagination.total, total); assert.equal(result.body.products.length, total);
    assert.deepEqual(calls, [['segment', '==', segment]]);
    assert.ok(result.body.products.every(product => product.segment === segment));
    assert.equal(result.body.products.some(product => product.segment === other), false);
    assert.equal(result.body.products.filter(product => product.origin === 'customer-submission').length, segment === 'Hardware' ? 3 : 2);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    assert.notEqual(result.body.availability.total, 497); assert.notEqual(result.body.availability.total, 500);
  });
}

test('pagination total spans all segment pages, page length is not availability', async () => {
  const handler = createCustomerCatalogHandler({ getDb: () => memoryFirestore(fixtureRecords()) });
  for (const offset of ['0', '20', '120', '200']) {
    const result = (await invoke(handler, { query: { segment: 'hardware', limit: '20', offset } })).body;
    assert.deepEqual(result.availability, { segment: 'Hardware', total: 123 });
    assert.equal(result.pagination.total, 123);
    assert.equal(result.products.length, offset === '120' ? 3 : offset === '200' ? 0 : 20);
  }
});

test('search stays scoped, availability remains full segment total, results metadata separate', async () => {
  const handler = createCustomerCatalogHandler({ getDb: () => memoryFirestore(fixtureRecords()) });
  const result = (await invoke(handler, { query: { businessSegment: 'Grocery', search: 'generated', limit: '1' } })).body;
  assert.equal(result.availability.total, 82); assert.equal(result.pagination.total, 2);
  assert.equal(result.products.length, 1); assert.equal(result.products[0].segment, 'Grocery');
  const absent = (await invoke(handler, { query: { businessSegment: 'Grocery', search: 'hardware' } })).body;
  assert.equal(absent.availability.total, 82); assert.equal(absent.pagination.total, 0);
});

test('duplicate snapshots/doc IDs counted once, stored id cannot forge another record identity', () => {
  const data = { name: 'Unique', category: 'Synthetic', segment: 'Grocery', status: 'Active', id: 'forged' };
  const doc = { id: 'real', data: () => data };
  const result = catalogResult([doc, doc], catalogQuery({ segment: 'Grocery' }));
  assert.equal(result.availability.total, 1); assert.equal(result.products[0].id, 'real');
});

for (const value of ['Other', '', ['Grocery'], {}, 'Grocery<script>']) test(`invalid segment fails before DB read: ${JSON.stringify(value)}`, async () => {
  const result = await invoke(createCustomerCatalogHandler({ getDb: () => { throw new Error('Must not read'); } }), { query: { businessSegment: value } });
  assert.equal(result.statusCode, 400);
});

test('canonicalization uses the existing segment contract, not fuzzy/substring matching', () => {
  assert.equal(catalogQuery({ segment: 'groceries' }).segment, 'Grocery');
  assert.equal(catalogQuery({ segment: 'tools' }).segment, 'Hardware');
  assert.throws(() => catalogQuery({ businessSegment: 'Hardware', segment: 'Grocery' }));
});

for (const query of [{ limit: '0' }, { limit: '-1' }, { limit: '501' }, { offset: '1x' }, { search: ['x'] }])
  test(`malformed pagination/search rejected: ${JSON.stringify(query)}`, () => assert.throws(() => catalogQuery(query)));

test('All/default preserves explicit paid all-categories discovery, excludes hidden/unassigned records', async () => {
  const handler = createCustomerCatalogHandler({ getDb: () => memoryFirestore(fixtureRecords()) });
  for (const query of [{}, { businessSegment: 'All' }]) {
    const result = (await invoke(handler, { query })).body;
    assert.equal(result.availability.total, 205); assert.equal(result.availability.segment, null);
    assert.equal(result.products.some(product => !['Hardware', 'Grocery'].includes(product.segment)), false);
  }
});

test('negative/malformed publication signals override active=true and exclude deleted/inactive/hidden generated records', () => {
  const values = ['pending', 'rejected', 'archived', 'deleted', 'inactive', 'draft', 'unknown'];
  const docs = values.map((status, i) => ({ id: String(i), data: () => ({ name: 'Generated', category: 'Synthetic', segment: 'Hardware', is_active: true, status }) }));
  docs.push({ id: 'hidden', data: () => ({ name: 'Hidden', category: 'Synthetic', segment: 'Hardware', status: 'Active', published: false }) });
  assert.equal(catalogResult(docs, catalogQuery({ segment: 'Hardware' })).availability.total, 0);
});

test('newly approved visible Hardware product increases only Hardware, no persistent catalog cache', async () => {
  const db = memoryFirestore(fixtureRecords()), handler = createCustomerCatalogHandler({ getDb: () => db });
  const count = async segment => (await invoke(handler, { query: { segment } })).body.availability.total;
  assert.equal(await count('Hardware'), 123);
  await db.collection('products').doc('submission_approved-fixture').set({ name: 'Approved', category: 'Synthetic', segment: 'Hardware', status: 'Active', is_active: true });
  assert.equal(await count('Hardware'), 124); assert.equal(await count('Grocery'), 82);
});

test('database failure is not a fabricated zero availability', async () => {
  const result = await invoke(createCustomerCatalogHandler({ getDb: () => { throw new Error('unavailable'); } }));
  assert.equal(result.statusCode, 500); assert.equal(result.body.availability, undefined);
});

test('historical missing/alternate/alias-only stored segment is not guessed into the selected canonical query', async () => {
  const db = memoryFirestore({
    'products/alternate': { name: 'Alternate', category: 'Synthetic', businessSegment: 'Grocery', status: 'Active' },
    'products/alias': { name: 'Alias', category: 'Synthetic', segment: 'food', status: 'Active' },
    'products/missing': { name: 'Missing', category: 'Synthetic', status: 'Active' },
  });
  const result = await invoke(createCustomerCatalogHandler({ getDb: () => db }), { query: { segment: 'Grocery' } });
  assert.equal(result.body.availability.total, 0); assert.deepEqual(result.body.products, []);
});

test('actual mounted public route reuses scoped handler; no duplicate catalog endpoint', () => {
  const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
  assert.match(read('routes/products.js'), /router.get\('\/', createCustomerCatalogHandler\(\{ getDb: getFirestore \}\)\)/);
  assert.match(read('server.js'), /app.use\('\/api\/v1\/products', productsRouter\)/);
  assert.match(read('services/product-submissions.js'), /productId = `submission_\$\{ref.id\}`/);
  assert.match(read('services/catalog-contract.js'), /result.segment = normalizeSegment/);
  assert.match(read('services/catalog-contract.js'), /result.is_active = result.status === 'Active'/);
});
