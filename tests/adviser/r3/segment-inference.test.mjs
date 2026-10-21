import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSegmentInference } from '../../../services/segment-inference.js';
import { importUpdateInput, planImportUpdate, previewCatalogImport } from '../../../services/catalog-import.js';

const infer = createSegmentInference([]);
for (const [input, segment, source] of [
  [{ category: 'Canned Goods' }, 'Grocery', 'category'],
  [{ category: 'vitamins & supplements' }, 'Pharmacy', 'category'],
  [{ category: 'PVC Fittings' }, 'Hardware', 'category'],
  [{ category: 'Hand tools and accessories' }, 'Hardware', 'category'],
  [{ category: 'Beverages And Beverages Preparations' }, 'Grocery', 'category'],
  [{ category: 'Medicines' }, 'Pharmacy', 'category'],
  [{ name: 'Biogesic Paracetamol Tablet' }, 'Pharmacy', 'name'],
  [{ name: 'Allerkid', brand: 'Unilab', size: '10mg' }, 'Pharmacy', 'name'],
  [{ name: 'Fluimucil', size: 'Capsule' }, 'Pharmacy', 'name'],
  [{ name: 'Adjustable Wrench', brand: 'Generic' }, 'Hardware', 'name'],
  [{ name: 'royal elbow macaroni' }, 'Grocery', 'name'],
  [{ name: 'Vitamilk Double Choco Shake Soy Milk Drink', brand: 'vitamilk' }, 'Grocery', 'name'],
  [{ name: 'Aji-no-moto', flavor: 'Umami Seasoning' }, 'Grocery', 'name'],
  [{ name: 'Jessa', size: '90 g' }, 'Grocery', 'default'],
  [{ name: 'Coconut Tape' }, 'Grocery', 'default'], // one Grocery word, one Hardware word: no clear answer
  [{}, 'Grocery', 'default'],
]) test(`segment from ${JSON.stringify(input)} is ${segment} (${source})`, () => {
  assert.deepEqual(infer(input), { segment, source });
});

test('categories already in the catalog decide first, including custom ones', () => {
  const records = [
    { id: 'a', data: { name: 'Lotion', category: 'Personal Care', segment: 'Pharmacy', variants: [{ size: '100ml' }] } },
    { id: 'b', data: { name: 'Cream', category: 'Personal Care', segment: 'Pharmacy', variants: [{ size: '50g' }] } },
    { id: 'c', data: { name: 'Soap', category: 'Personal Care', segment: 'Grocery', variants: [{ size: '90g' }] } },
    { id: 'd', data: { name: 'Gizmo', category: 'Gadgets', segment: 'Hardware', variants: [{ size: '1pc' }] } },
  ];
  const learned = createSegmentInference(records);
  assert.deepEqual(learned({ category: 'personal care' }), { segment: 'Pharmacy', source: 'category' });
  assert.deepEqual(learned({ category: 'Gadgets', name: 'Chocolate gadget' }), { segment: 'Hardware', source: 'category' });
  // A tie between segments in the catalog falls back to the built-in categories.
  const tied = createSegmentInference(records.slice(1, 3));
  assert.deepEqual(tied({ category: 'Personal Care' }), { segment: 'Grocery', source: 'category' });
});

test('one file mixes segments without a segment column', () => {
  const plan = previewCatalogImport([['name', 'brand', 'category', 'size'],
    ['555 Sardines', '555', 'Canned Goods', '155g'],
    ['Cetirizine', 'Allerkid', 'Allergy Care', '10mg'],
    ['Adjustable Wrench', 'Generic', 'Hand Tools', '8 inch'],
    ['Biogesic', 'Unilab', '', '500mg'],
    ['Mystery Item', '', '', '']], []);
  assert.deepEqual(plan.rows.map(row => [row.status, row.product.segment, row.inferred?.segment]), [
    ['NEW', 'Grocery', 'category'], ['NEW', 'Pharmacy', 'category'], ['NEW', 'Hardware', 'category'],
    ['NEW', 'Pharmacy', 'name'], ['NEW', 'Grocery', 'default']]);
  assert.deepEqual(plan.rows.map(row => row.product.category), ['Canned Goods', 'Allergy Care', 'Hand Tools', 'Uncategorized', 'Uncategorized']);
  assert.deepEqual(plan.warnings, ['Segment worked out for 5 rows without one: 3 from its category, 1 from its name, brand or size, '
    + '1 from nothing in the row (set to Grocery). Existing products keep their segment and category.']);
});

test('a segment column keeps its values; only blank cells are worked out', () => {
  const plan = previewCatalogImport([['name', 'segment', 'category'],
    ['Hammer', 'Hardware', 'Tools'], ['Paracetamol', '', 'Pain & Fever Relief'], ['Odd', 'Electronics', 'Gadgets']], []);
  assert.deepEqual(plan.rows.map(row => [row.status, row.product?.segment ?? null, row.inferred ?? null]), [
    ['NEW', 'Hardware', null], ['NEW', 'Pharmacy', { segment: 'category' }], ['INVALID', null, null]]);
  assert.match(plan.rows[2].reason, /Segment must be Grocery, Pharmacy or Hardware/u);
});

test('an existing product keeps its segment and category when the CSV row has none', () => {
  const existing = { name: 'Ceelin', brand: 'Unilab', segment: 'Pharmacy', category: 'Vitamins & Supplements',
    variants: [{ sku: '4800010000017', size: '60ml' }] };
  const plan = previewCatalogImport([['name', 'brand', 'sku', 'size', 'image_url'],
    ['Ceelin', 'Unilab', '4800010000017', '60ml', 'https://images.openfoodfacts.org/c.jpg']], [{ id: 'ceelin', data: existing }]);
  const row = plan.rows[0];
  assert.equal(row.status, 'UPDATE'); assert.deepEqual(row.inferred, { segment: 'default', category: 'default' });
  assert.equal(row.reason, 'image_url: "" → "https://images.openfoodfacts.org/c.jpg"');
  const { input } = planImportUpdate(existing, importUpdateInput(row));
  assert.equal(input.image_url, 'https://images.openfoodfacts.org/c.jpg');
  assert.equal(Object.hasOwn(input, 'segment'), false); assert.equal(Object.hasOwn(input, 'category'), false);
  // A segment the CSV actually gives is still applied.
  const explicit = previewCatalogImport([['name', 'brand', 'segment', 'sku', 'size'],
    ['Ceelin', 'Unilab', 'Grocery', '4800010000017', '60ml']], [{ id: 'ceelin', data: existing }]).rows[0];
  assert.equal(explicit.status, 'UPDATE'); assert.match(explicit.reason, /segment: Pharmacy → Grocery/u);
});

test('an SKU-less row finds its existing product through the category the catalog already uses', () => {
  const existing = { name: '555 Sardines', brand: '555', segment: 'Grocery', category: 'Canned Goods', variants: [{ size: '155g' }] };
  const plan = previewCatalogImport([['name', 'brand', 'category', 'size'], ['555 Sardines', '555', 'Canned Goods', '155g']],
    [{ id: 'sardines', data: existing }]);
  assert.equal(plan.rows[0].status, 'EXACT_EXISTING_MATCH'); assert.deepEqual(plan.rows[0].matches, ['sardines']);
});
