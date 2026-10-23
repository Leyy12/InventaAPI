import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImportMerge, planImportUpdate, previewCatalogImport } from '../../../services/catalog-import.js';
import { productIdentityKeys } from '../../../services/product-contract.js';

const headers = ['name', 'brand', 'segment', 'category', 'price', 'sku', 'size'];
const values = ['Coke', 'Coca-Cola', 'Grocery', 'Drinks', '10', 'A', '330ml'];
const preview = (head = headers, rows = [values], records = []) => previewCatalogImport([head, ...rows], records);
test('normal and shuffled recognized columns produce identical canonical data', () => {
  const order = [4, 2, 6, 1, 0, 5, 3];
  assert.deepEqual(preview().rows, preview(order.map(i => headers[i]), [order.map(i => values[i])]).rows);
});
for (const alias of ['Product Name', 'product_name', 'ProductName', ' generic_name ']) test(`name alias ${alias}`, () => {
  assert.equal(preview([alias, ...headers.slice(1)]).rows[0].product.name, 'Coke');
});
test('BOM/header whitespace normalization and existing aliases', () => {
  const result = preview(['\uFEFF  Product Name  ', 'manufacturer', ' department ', 'product_category', 'srp', 'barcode', 'pack_size']);
  assert.equal(result.rows[0].status, 'NEW'); assert.equal('price' in result.rows[0].product.variants[0], false);
  assert.deepEqual(result.warnings, []); // price columns are dropped quietly
});
for (const field of ['name', 'segment', 'category']) test(`missing required header ${field}`, () => {
  assert.throws(() => preview(headers.filter(h => h !== field), [values.filter((_, i) => headers[i] !== field)]), /Missing required columns/);
});
test('unknown columns warn, but invalid image metadata blocks the row instead of being discarded', () => {
  const result = preview([...headers, 'mystery', 'image_url'], [[...values, 'unused', 'javascript:bad']]);
  assert.equal(result.warnings.length, 1); assert.equal(result.rows[0].status, 'INVALID');
  assert.match(result.rows[0].reason, /image URL/i);
});
for (const alias of ['image_url', 'Image URL', 'imageurl']) test(`optional image alias ${alias} preserves canonical identity`, () => {
  const result = preview([...headers, alias], [[...values, 'https://example.invalid/pack.webp?a=1&b=2']]);
  assert.equal(result.rows[0].product.image_url, 'https://example.invalid/pack.webp?a=1&b=2');
  assert.deepEqual(productIdentityKeys(result.rows[0].product), productIdentityKeys(preview().rows[0].product));
});
test('blank image remains optional and duplicate image aliases reject ambiguous headers', () => {
  assert.equal(preview([...headers, 'image_url'], [[...values, '']]).rows[0].status, 'NEW');
  assert.throws(() => preview([...headers, 'image_url', 'image url'], [[...values, '', '']]), /Duplicate column mapping/);
});
for (const value of ['C:\\photos\\a.jpg', 'file:///a.png', 'http://example.invalid/a', 'data:image/png;base64,eA==', 'https://u:p@example.invalid/a']) {
  test(`CSV rejects unsafe image value ${value}`, () => assert.equal(preview([...headers, 'image_url'], [[...values, value]]).rows[0].status, 'INVALID'));
}
test('existing canonical product with a new image is an update; identical rows are skipped', () => {
  const old = preview().rows[0].product;
  const result = preview([...headers, 'image_url'], [[...values, 'https://example.invalid/new.webp']], [{id:'existing',data:old}]);
  assert.equal(result.rows[0].status, 'UPDATE'); assert.equal(old.image_url, '');
  assert.deepEqual(result.rows[0].update, { productId: 'existing', catalogRevision: 0 });
  assert.equal(preview(headers, [values], [{ id: 'existing', data: old }]).rows[0].status, 'EXACT_EXISTING_MATCH');
});
for (const extra of ['name', 'Product Name', 'productname']) test(`ambiguous duplicate header ${extra}`, () => {
  assert.throws(() => preview([...headers, extra], [[...values, 'other']]), /Duplicate column mapping/);
});
test('legacy form and size alias collision is explicit, never first-wins', () => {
  assert.throws(() => preview([...headers, 'form'], [[...values, 'tablet']]), /Duplicate column mapping for size/);
});
for (const segment of ['Grocery', 'Pharmacy', 'Hardware', 'groceries', 'medicine', 'tools']) test(`supported canonical segment ${segment}`, () => {
  const row = [...values]; row[2] = segment; assert.equal(preview(headers, [row]).rows[0].status, 'NEW');
});
for (const [field, value] of [['name', ''], ['category', ''], ['segment', ''], ['segment', 'Unknown'],
  ['segment', 'medical-unknown']]) {
  test(`invalid row ${field}=${value}`, () => {
    const row = [...values]; row[headers.indexOf(field)] = value;
    const result = preview(headers, [row]); assert.equal(result.rows[0].status, 'INVALID'); assert.ok(result.rows[0].reason);
  });
}
test('any price value is dropped and optional SKU uses Phase 1 fallback', () => {
  for (const price of ['', 'abc', '-1', '₱10', '1,234.00']) {
    const row = [...values]; row[4] = price; row[5] = '';
    const result = preview(headers, [row]);
    assert.equal(result.rows[0].status, 'NEW'); assert.equal('price' in result.rows[0].product.variants[0], false);
    assert.match(productIdentityKeys(result.rows[0].product)[0], /^fallback:/);
  }
});
test('column count mismatch is reported as invalid row', () => assert.equal(preview(headers, [values.slice(1)]).rows[0].status, 'INVALID'));
test('identical within-file rows have one new operation and an explicit skipped duplicate', () => {
  assert.deepEqual(preview(headers, [values, values]).rows.map(row => row.status), ['NEW', 'EXACT_EXISTING_MATCH']);
});
test('conflicting within-file rows all become conflicts including later exact repeats', () => {
  const other = [...values]; other[6] = '500ml';
  assert.deepEqual(preview(headers, [values, other, values]).rows.map(row => row.status), ['CONFLICT', 'CONFLICT', 'CONFLICT']);
});
test('a price in the file never changes a product; other variant changes keep siblings', () => {
  const data = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', variants: [
    { sku: 'A', size: '330ml', arbitrary: { nested: 5 } }, { sku: 'B', size: '1.5L' }] };
  const before = structuredClone(data);
  assert.equal(preview(headers, [values], [{ id: 'catalog', data }]).rows[0].status, 'EXACT_EXISTING_MATCH');
  const row = [...values]; row[6] = '355ml';
  const result = preview(headers, [row], [{ id: 'catalog', data }]);
  assert.equal(result.rows[0].status, 'UPDATE'); assert.match(result.rows[0].reason, /size: "330ml" → "355ml"/u);
  assert.deepEqual(data, before);
  const { input } = planImportUpdate(data, result.rows[0].product);
  assert.deepEqual(input.variants, [{ sku: 'A', size: '355ml', arbitrary: { nested: 5 } }, { sku: 'B', size: '1.5L' }]);
});
test('blank CSV cells never clear existing fields', () => {
  const data = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', description: 'Keep me',
    image_url: 'https://example.invalid/a.jpg', variants: [{ sku: 'A', price: 10, size: '330ml', expirationDate: '2027-01-01' }] };
  assert.equal(planImportUpdate(data, preview().rows[0].product), null);
});
test('a match that cannot be tied to one variant is skipped with a reason', () => {
  const data = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', sku: 'A',
    variants: [{ price: 1, size: '1L' }, { price: 2, size: '2L' }] };
  const row = preview(headers, [values], [{ id: 'catalog', data }]).rows[0];
  assert.equal(row.status, 'EXACT_EXISTING_MATCH'); assert.match(row.reason, /exactly one of its variants/u);
});
test('same Brand+Name with different canonical variants flags both rows, no merge', () => {
  const other = [...values]; other[5] = 'B'; other[6] = '1.5L';
  const result = preview(headers, [values, other]);
  assert.deepEqual(result.rows.map(row => row.status), ['POSSIBLE_DUPLICATE', 'POSSIBLE_DUPLICATE']);
  assert.equal(result.rows[0].product.variants.length, 1); assert.equal(result.rows[1].product.variants[0].size, '1.5L');
});
test('multiple historical owners are conflict, never selected arbitrarily', () => {
  const data = preview().rows[0].product;
  assert.equal(preview(headers, [values], [{ id: 'a', data }, { id: 'b', data }]).rows[0].status, 'CONFLICT');
});
test('files of any row count preview; malformed inputs are still rejected', () => {
  const many = Array.from({ length: 1000 }, (_, i) => values.map((value, j) => headers[j] === 'sku' ? 'BULK-' + i : value));
  assert.equal(previewCatalogImport([headers, ...many], []).total, 1000);
  assert.throws(() => previewCatalogImport([headers], []), /at least 1 row/);
  assert.throws(() => previewCatalogImport([headers, [1]], []), /at least 1 row/);
});

test('merge mode reads the catalog export columns and ignores prices', () => {
  const head = ['Name', 'Brand', 'Segment', 'Category', 'Flavors', 'Specs', 'Pricing', 'Status', 'image_url'];
  const result = previewCatalogImport([head,
    ['Coke', 'Coca-Cola', 'Grocery', 'Drinks', 'Regular', '330ml', '₱25.50', 'Active', 'https://x.invalid/a.jpg'],
    ['Sprite', 'Coca-Cola', 'Grocery', 'Drinks', '', '1L', '₱20.00 – ₱45.00', 'Active', 'https://x.invalid/b.jpg'],
  ], [], { merge: true });
  assert.equal(result.rows[0].status, 'NEW');
  assert.deepEqual(result.rows[0].product.variants[0], { size: '330ml', flavor: 'Regular', sku: '', expirationDate: '' });
  assert.equal(result.rows[1].status, 'NEW');
  assert.equal('price' in result.rows[1].product.variants[0], false);
  assert.deepEqual(result.warnings, ['Ignored unknown column: Status']);
});
test('merge mode: an exported row listing every size only fills the photo; unknown listed sizes are skipped', () => {
  const existing = { id: 'p', data: { name: 'Milo', brand: 'Nestle', segment: 'Grocery', category: 'Drinks', status: 'Active', is_active: true,
    variants: [{ size: '22g', price: 8 }, { size: '300g', price: 99 }] } };
  const head = ['name', 'brand', 'segment', 'category', 'size', 'price', 'image_url'];
  const result = previewCatalogImport([head,
    ['Milo', 'Nestle', 'Grocery', 'Drinks', '22g, 300g', '', 'https://x.invalid/m.jpg'],
    ['Milo', 'Nestle', 'Grocery', 'Drinks', '22g, 1kg', '', 'https://x.invalid/m.jpg'],
  ], [existing], { merge: true, requireImage: true });
  assert.equal(result.rows[0].status, 'UPDATE'); assert.equal(result.rows[0].reason, 'photo added');
  assert.equal(result.rows[1].status, 'INVALID'); assert.match(result.rows[1].reason, /not all on the existing product/u);
  const update = planImportMerge(existing.data, result.rows[0].product, { keepPrice: true });
  assert.deepEqual(update.input, { image_url: 'https://x.invalid/m.jpg' });
});
test('merge mode never replaces an existing photo', () => {
  const old = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', image_url: 'https://x.invalid/old.jpg', variants: [{ sku: 'A', price: 10, size: '330ml' }] };
  const result = previewCatalogImport([[...headers, 'image_url'], ['Coke', 'Coca-Cola', 'Grocery', 'Drinks', '', 'A', '330ml', 'https://x.invalid/new.jpg']],
    [{ id: 'existing', data: old }], { merge: true });
  assert.equal(result.rows[0].status, 'EXACT_EXISTING_MATCH');
  assert.equal(result.rows[0].reason, 'Already in the catalog; skipped.');
});
test('merge mode: same brand and name on several products is skipped, never guessed', () => {
  const base = { brand: 'Alaska', segment: 'Grocery', status: 'Active', is_active: true };
  const records = [{ id: 'a', data: { ...base, name: 'Evap', category: 'Milk', variants: [{ size: '370ml', price: 1 }] } },
    { id: 'b', data: { ...base, name: 'Evap', category: 'Dairy', variants: [{ size: '154ml', price: 1 }] } }];
  const result = previewCatalogImport([['name', 'brand', 'segment', 'category', 'size', 'price'], ['Evap', 'Alaska', 'Grocery', 'Canned', '1L', '5']], records, { merge: true });
  assert.equal(result.rows[0].status, 'POSSIBLE_DUPLICATE'); assert.match(result.rows[0].reason, /Several products share/u);
});
