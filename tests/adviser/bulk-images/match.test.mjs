import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageMatcher, fileStem, normalizeKey } from '../../../admin-panel/src/lib/bulk-image-match.ts';

const products = [
  { id: 'p1', name: 'Sardines in Tomato Sauce', brand: '555', variants: [{ sku: '4800249001234' }] },
  { id: 'p2', name: 'Sardines', brand: '555' },
  { id: 'p3', name: 'Ajinomoto Umami Seasoning', sku: 'AJI-100' },
  { id: 'p4', name: 'Evaporated Milk', brand: 'Alaska' },
  { id: 'p5', name: 'Evaporated Milk', brand: 'Alpine' },
  { id: 'p6', product: 'Paracetamol 500mg', attributes: { brand: 'Biogesic' } },
];
const match = createImageMatcher(products);

test('file names are normalized without their extension', () => {
  assert.equal(fileStem('555 Sardines.JPG'), '555 Sardines');
  assert.equal(fileStem('Zesto Dalandan 1.5L'), 'Zesto Dalandan 1.5L');
  assert.equal(fileStem('Mr.chips'), 'Mr.chips');
  assert.equal(fileStem('Zesto Dalandan 1.5L.webp'), 'Zesto Dalandan 1.5L');
  assert.equal(normalizeKey('  Alaska_Evaporated-Milk & More '), 'alaska evaporated milk and more');
});
test('product ID and SKU win before names', () => {
  assert.deepEqual(match('p4.png'), { productIds: ['p4'], by: 'id' });
  assert.deepEqual(match('4800249001234.jpg'), { productIds: ['p1'], by: 'sku' });
  assert.deepEqual(match('aji-100.webp'), { productIds: ['p3'], by: 'sku' });
});
test('brand + name in either order matches one product', () => {
  assert.deepEqual(match('Alaska Evaporated Milk.jpg'), { productIds: ['p4'], by: 'name' });
  assert.deepEqual(match('evaporated-milk_alpine.png'), { productIds: ['p5'], by: 'name' });
  assert.deepEqual(match('Biogesic Paracetamol 500mg.jpg'), { productIds: ['p6'], by: 'name' });
});
test('extra words such as sizes still match, and the most specific product wins', () => {
  assert.deepEqual(match('555-sardines-in-tomato-sauce-155g.jpg'), { productIds: ['p1'], by: 'words' });
  assert.deepEqual(match('555 sardines 155g.jpg'), { productIds: ['p2'], by: 'words' });
});
test('ambiguous names are left for the admin and unknown names do not match', () => {
  assert.deepEqual(match('Evaporated Milk.jpg'), { productIds: ['p4', 'p5'], by: 'name' });
  assert.deepEqual(match('IMG_2041.jpg'), { productIds: [], by: 'none' });
});
test('CSV labels ending in a size or a dotted word still match', () => {
  const sized = createImageMatcher([{ id: 'z1', name: 'Zesto Dalandan 1.5L' }, { id: 'm1', name: 'Mr.chips', brand: 'JACK n JILL' }]);
  assert.deepEqual(sized('Zesto Dalandan 1.5L'), { productIds: ['z1'], by: 'name' });
  assert.deepEqual(sized('JACK n JILL Mr.chips'), { productIds: ['m1'], by: 'name' });
});
