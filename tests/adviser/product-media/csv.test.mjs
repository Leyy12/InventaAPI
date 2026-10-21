import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from '../../../admin-panel/node_modules/papaparse/papaparse.js';
import { catalogCsv } from '../../../admin-panel/src/lib/catalog-csv.ts';
import { productImageSource } from '../../../admin-panel/src/lib/product-image-url.ts';

test('CSV export quotes commas, quotes and newlines, exports a canonical public URL, and leaves missing images blank', () => {
  const url='https://example.invalid/pack.webp?q=one,two';
  const csv=catalogCsv([['A "quoted", package\nlarge','Brand','Grocery','Food','plain','1kg','Active',productImageSource({image_url:url})],
    ['B','B','Grocery','Food','','','Active',productImageSource({})]]);
  const parsed=Papa.parse(csv,{header:true});assert.equal(parsed.errors.length,0);
  assert.equal(parsed.data[0].Name,'A "quoted", package\nlarge');assert.equal(parsed.data[0].image_url,url);assert.equal(parsed.data[1].image_url,'');
});
test('unsafe legacy images are blank and spreadsheet formulas cannot execute', () => {
  assert.equal(productImageSource({image_url:'javascript:evil',image:'https://example.invalid/old'}),'');
  const row=Papa.parse(catalogCsv([['=EVIL()','@formula','','','','','','']]),{header:true}).data[0];
  assert.equal(row.Name,"'=EVIL()");assert.equal(row.Brand,"'@formula");
});
