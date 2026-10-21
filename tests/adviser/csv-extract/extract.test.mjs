import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTemplateRows, fitsTemplate } from '../../../admin-panel/src/lib/csv-extract.ts';
import { previewCatalogImport } from '../../../services/catalog-import.js';

const head = out => out.rows[0];

test('template files go to the API unchanged', () => {
  assert.equal(fitsTemplate(['name', 'brand', 'segment', 'category', 'size', 'price', 'sku']), true);
  assert.equal(fitsTemplate(['Product Name', 'SRP', 'Department', 'Drug Category']), true);
  // The admin Products export layout (also used by the master catalog file).
  assert.equal(fitsTemplate(['Name', 'Brand', 'Segment', 'Category', 'Flavors', 'Specs', 'Status', 'image_url']), true);
});

test('Open Food Facts layout is reduced to the needed details', () => {
  const header = ['code', 'lc', 'product_name_en', 'product_name_fr', 'generic_name_en', 'quantity', 'packaging', 'brands', 'categories_tags', 'countries'];
  const matrix = [header,
    ['4800361403764', 'en', 'nescafe original 20g', '', '', '20g', 'sachet', 'Nestlé, Nescafe', 'en:beverages-and-beverages-preparations,en:coffees', 'Philippines'],
    ['4806531830040', 'fr', '', 'biscuits', '', '', '', '', '', ''],
    ['123', 'en', '', '', '', '', '', '', '', '']];
  assert.equal(fitsTemplate(header), false);
  const out = extractTemplateRows(matrix);
  assert.equal(out.used.name, 'product_name_en'); assert.equal(out.used.sku, 'code'); assert.equal(out.used.size, 'quantity');
  assert.equal(out.dropped, 1); assert.equal(head(out).includes('price'), false);
  const [columns, first, second] = out.rows;
  const row = Object.fromEntries(columns.map((field, i) => [field, first[i]]));
  // Blank segment and category cells stay blank; the API works them out per row.
  assert.deepEqual([row.name, row.brand, row.segment, row.category, row.size, row.sku],
    ['nescafe original 20g', 'Nestlé', '', 'Beverages And Beverages Preparations', '20g', '4800361403764']);
  assert.equal(second[0], 'biscuits'); // falls back to another language's name
  assert.equal(second[columns.indexOf('category')], '');
  // The API accepts the extracted header, and products carry no price.
  const plan = previewCatalogImport(out.rows, []);
  assert.equal(plan.total, 2); assert.equal(plan.counts.NEW, 2);
  assert.deepEqual(plan.rows.map(item => [item.product.segment, item.inferred]),
    [['Grocery', { segment: 'category' }], ['Grocery', { segment: 'name', category: 'default' }]]);
  assert.equal(plan.rows[1].product.category, 'Uncategorized');
});

test('price columns are left out and the rows preview as new products', () => {
  const out = extractTemplateRows([['Item Description', 'Selling Price', 'Barcode'], ['Lucky Me Pancit Canton', '15', '4807770270017']]);
  assert.equal(head(out).includes('price'), false); assert.equal(out.used.sku, 'Barcode');
  const plan = previewCatalogImport(out.rows, []);
  assert.equal(plan.counts.NEW, 1); assert.equal(plan.rows[0].product.segment, 'Grocery');
});

test('the Philippines products file maps barcode, brand and size', () => {
  const out = extractTemplateRows([['barcode_sku', 'product_name', 'brands', 'quantity_grams', 'image_url'],
    ['4800361403764', 'nescafe original 20g', 'Nestlé', '20g', 'https://images.openfoodfacts.org/a.jpg']]);
  assert.deepEqual(out.used, { name: 'product_name', brand: 'brands', size: 'quantity_grams', sku: 'barcode_sku', image_url: 'image_url' });
  const plan = previewCatalogImport(out.rows, []);
  assert.equal(plan.counts.NEW, 1); assert.equal(plan.rows[0].product.variants[0].sku, '4800361403764');
});
