import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewCatalogImport } from '../../../services/catalog-import.js';
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
  assert.equal(result.rows[0].status, 'NEW'); assert.equal(result.rows[0].product.variants[0].price, 10);
});
for (const field of ['name', 'segment', 'category', 'price']) test(`missing required header ${field}`, () => {
  assert.throws(() => preview(headers.filter(h => h !== field), [values.filter((_, i) => headers[i] !== field)]), /Missing required columns/);
});
test('unknown fields including unsupported image_url are visible ignored warnings', () => {
  const result = preview([...headers, 'mystery', 'image_url'], [[...values, 'unused', 'javascript:bad']]);
  assert.equal(result.warnings.length, 2); assert.equal(result.rows[0].product.image_url, '');
  assert.equal(result.rows[0].product.mystery, undefined);
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
  ['segment', 'medical-unknown'], ['price', ''], ['price', 'abc'], ['price', '10abc'], ['price', '-1'], ['price', 'NaN'], ['price', 'Infinity'], ['price', '₱10'], ['price', '1,234.00']]) {
  test(`invalid row ${field}=${value}`, () => {
    const row = [...values]; row[headers.indexOf(field)] = value;
    const result = preview(headers, [row]); assert.equal(result.rows[0].status, 'INVALID'); assert.ok(result.rows[0].reason);
  });
}
test('literal zero is valid and optional SKU uses Phase 1 fallback', () => {
  const row = [...values]; row[4] = '0'; row[5] = '';
  const product = preview(headers, [row]).rows[0].product;
  assert.equal(product.variants[0].price, 0); assert.match(productIdentityKeys(product)[0], /^fallback:/);
});
test('column count mismatch is reported as invalid row', () => assert.equal(preview(headers, [values.slice(1)]).rows[0].status, 'INVALID'));
test('identical within-file rows have one new operation and an explicit skipped duplicate', () => {
  assert.deepEqual(preview(headers, [values, values]).rows.map(row => row.status), ['NEW', 'EXACT_EXISTING_MATCH']);
});
test('conflicting within-file rows all become conflicts including later exact repeats', () => {
  const other = [...values]; other[4] = '50';
  assert.deepEqual(preview(headers, [values, other, values]).rows.map(row => row.status), ['CONFLICT', 'CONFLICT', 'CONFLICT']);
});
test('catalog canonical match skips even different prices without changing siblings', () => {
  const data = { name: 'Coke', brand: 'Coca-Cola', segment: 'Grocery', category: 'Drinks', variants: [
    { sku: 'A', price: 100, size: '330ml', arbitrary: { nested: 5 } }, { sku: 'B', price: 150, size: '1.5L' }] };
  const before = structuredClone(data), result = preview(headers, [values], [{ id: 'catalog', data }]);
  assert.equal(result.rows[0].status, 'EXACT_EXISTING_MATCH'); assert.deepEqual(data, before);
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
test('file limits reject oversized/malformed inputs before preview state', () => {
  assert.throws(() => previewCatalogImport([headers, ...Array(201).fill(values)], []), /1–200/);
  assert.throws(() => previewCatalogImport([headers, [1]], []), /parsed data/);
});
