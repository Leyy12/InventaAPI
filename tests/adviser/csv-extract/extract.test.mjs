import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTemplateRows, fitsTemplate } from '../../../admin-panel/src/lib/csv-extract.ts';
import { previewCatalogImport } from '../../../services/catalog-import.js';

const defaults = { segment: 'Grocery', category: 'Uncategorized' };

test('template files go to the API unchanged', () => {
  assert.equal(fitsTemplate(['name', 'brand', 'segment', 'category', 'size', 'price', 'sku']), true);
  assert.equal(fitsTemplate(['Product Name', 'SRP', 'Department', 'Drug Category']), true);
});

test('Open Food Facts layout is reduced to the needed details', () => {
  const header = ['code', 'lc', 'product_name_en', 'product_name_fr', 'generic_name_en', 'quantity', 'packaging', 'brands', 'categories_tags', 'countries'];
  const matrix = [header,
    ['4800361403764', 'en', 'nescafe original 20g', '', '', '20g', 'sachet', 'Nestlé, Nescafe', 'en:beverages-and-beverages-preparations,en:coffees', 'Philippines'],
    ['4806531830040', 'fr', '', 'biscuits', '', '', '', '', '', ''],
    ['123', 'en', '', '', '', '', '', '', '', '']];
  assert.equal(fitsTemplate(header), false);
  const out = extractTemplateRows(matrix, defaults);
  assert.equal(out.used.name, 'product_name_en'); assert.equal(out.used.sku, 'code'); assert.equal(out.used.size, 'quantity');
  assert.equal(out.dropped, 1); assert.equal(out.missingPrice, 2);
  const [head, first, second] = out.rows;
  const row = Object.fromEntries(head.map((field, i) => [field, first[i]]));
  assert.deepEqual([row.name, row.brand, row.segment, row.category, row.size, row.sku, row.price],
    ['nescafe original 20g', 'Nestlé', 'Grocery', 'Beverages And Beverages Preparations', '20g', '4800361403764', '']);
  assert.equal(second[0], 'biscuits'); // falls back to another language's name
  // The API accepts the extracted header; price is optional, so rows without one import as new.
  const plan = previewCatalogImport(out.rows, []);
  assert.equal(plan.total, 2); assert.equal(plan.counts.NEW, 2);
});

test('extracted rows with a price preview as new products', () => {
  const out = extractTemplateRows([['Item Description', 'Selling Price', 'Barcode'], ['Lucky Me Pancit Canton', '15', '4807770270017']], defaults);
  assert.equal(out.used.price, 'Selling Price');
  const plan = previewCatalogImport(out.rows, []);
  assert.equal(plan.counts.NEW, 1); assert.equal(plan.rows[0].product.segment, 'Grocery');
});
