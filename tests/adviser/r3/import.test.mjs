import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImportUpdate, previewCatalogImport } from '../../../services/catalog-import.js';
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
  assert.equal(result.rows[0].status, 'NEW'); assert.deepEqual(result.warnings, []);
  assert.equal(Object.hasOwn(result.rows[0].product.variants[0], 'price'), false);
});
test('price columns are skipped silently and any value in them is ignored', () => {
  for (const price of ['', '10', 'abc', '-1', '₱10']) {
    const row = [...values]; row[headers.indexOf('price')] = price;
    const result = preview(headers, [row]);
    assert.equal(result.rows[0].status, 'NEW'); assert.deepEqual(result.warnings, []);
    assert.equal(Object.hasOwn(result.rows[0].product.variants[0], 'price'), false);
  }
  assert.equal(preview(headers.filter(h => h !== 'price'), [values.filter((_, i) => headers[i] !== 'price')]).rows[0].status, 'NEW');
});
test('the admin Products export layout imports: Specs and Flavors map, Pricing and Status are skipped quietly', () => {
  const result = preview(['Name', 'Brand', 'Segment', 'Category', 'Flavors', 'Specs', 'Pricing', 'Status', 'image_url', 'Barcode'],
    [['Lucky Me Pancit Canton', 'Lucky Me!', 'Grocery', 'Instant Noodles', 'Chilimansi', '60g', '₱15.00', 'Active', '', '4807770270017']]);
  assert.deepEqual(result.warnings, []); assert.equal(result.rows[0].status, 'NEW');
  assert.deepEqual(result.rows[0].product.variants[0], { size: '60g', flavor: 'Chilimansi', sku: '4807770270017', expirationDate: '' });
});
test('Open Food Facts style columns map without a template', () => {
  const result = preview(['barcode_sku', 'product_name', 'brands', 'quantity_grams', 'image_url', 'category', 'segment'],
    [['4800361403764', 'Nescafe Original', 'Nestlé', '20g', 'https://images.openfoodfacts.org/a.jpg', 'Coffee', 'Grocery']]);
  assert.deepEqual(result.warnings, []); assert.equal(result.rows[0].status, 'NEW');
  assert.deepEqual(result.rows[0].product.variants[0], { size: '20g', flavor: '', sku: '4800361403764', expirationDate: '' });
});
test('missing required header name', () => {
  assert.throws(() => preview(headers.filter(h => h !== 'name'), [values.filter((_, i) => headers[i] !== 'name')]), /Missing required column: name/);
});
test('segment and category columns are optional: a segment is worked out and the category is "Uncategorized"', () => {
  const without = field => preview(headers.filter(h => h !== field), [values.filter((_, i) => headers[i] !== field)]).rows[0];
  const noSegment = without('segment');
  assert.equal(noSegment.status, 'NEW'); assert.equal(noSegment.product.segment, 'Grocery'); assert.deepEqual(noSegment.inferred, { segment: 'category' });
  const noCategory = without('category');
  assert.equal(noCategory.status, 'NEW'); assert.equal(noCategory.product.category, 'Uncategorized');
  assert.equal(noCategory.product.segment, 'Grocery'); assert.deepEqual(noCategory.inferred, { category: 'default' });
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
// A blank segment or category is worked out instead (see segment-inference.test.mjs);
// a segment the catalog does not have is still refused.
for (const [field, value] of [['name', ''], ['segment', 'Unknown'], ['segment', 'medical-unknown']]) {
  test(`invalid row ${field}=${value}`, () => {
    const row = [...values]; row[headers.indexOf(field)] = value;
    const result = preview(headers, [row]); assert.equal(result.rows[0].status, 'INVALID'); assert.ok(result.rows[0].reason);
  });
}
test('optional SKU uses Phase 1 fallback', () => {
  const row = [...values]; row[5] = '';
  const product = preview(headers, [row]).rows[0].product;
  assert.match(productIdentityKeys(product)[0], /^fallback:/);
});
test('column count mismatch is reported as invalid row', () => assert.equal(preview(headers, [values.slice(1)]).rows[0].status, 'INVALID'));
test('identical within-file rows have one new operation and an explicit skipped duplicate', () => {
  assert.deepEqual(preview(headers, [values, values]).rows.map(row => row.status), ['NEW', 'EXACT_EXISTING_MATCH']);
});
test('conflicting within-file rows all become conflicts including later exact repeats', () => {
  const other = [...values]; other[6] = '1L';
  assert.deepEqual(preview(headers, [values, other, values]).rows.map(row => row.status), ['CONFLICT', 'CONFLICT', 'CONFLICT']);
});
test('catalog canonical match with a new size updates only that variant, keeping siblings', () => {
  const data = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', variants: [
    { sku: 'A', size: '300ml', arbitrary: { nested: 5 } }, { sku: 'B', size: '1.5L' }] };
  const before = structuredClone(data), result = preview(headers, [values], [{ id: 'catalog', data }]);
  assert.equal(result.rows[0].status, 'UPDATE'); assert.match(result.rows[0].reason, /size: "300ml" → "330ml"/u);
  assert.deepEqual(data, before);
  const { input } = planImportUpdate(data, result.rows[0].product);
  assert.deepEqual(input.variants, [{ sku: 'A', size: '330ml', arbitrary: { nested: 5 } }, { sku: 'B', size: '1.5L' }]);
});
test('blank CSV cells never clear existing fields', () => {
  const data = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', description: 'Keep me',
    image_url: 'https://example.invalid/a.jpg', variants: [{ sku: 'A', price: 10, size: '330ml', expirationDate: '2027-01-01' }] };
  assert.equal(planImportUpdate(data, preview().rows[0].product), null);
});
test('a stored price alone is not a change worth an update', () => {
  const data = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', variants: [{ sku: 'A', price: 25, size: '330ml' }] };
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
test('invalid rows keep their name and brand for the preview table', () => {
  const row = preview(headers, [values.map((value, i) => headers[i] === 'segment' ? 'Unknown' : value)]).rows[0];
  assert.equal(row.status, 'INVALID'); assert.equal(row.product, null);
  assert.deepEqual(row.display, { name: 'Coke', brand: 'Coca-Cola' });
});
