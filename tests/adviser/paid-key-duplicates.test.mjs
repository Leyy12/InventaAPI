// Pro / Pro Max: products already in the API key can't be picked again, and the
// server reports when an addition changed nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyCoverage, keyProductUsage } from '../../dashboard/src/lib/product-filters.ts';
import { mergeScope, sameScope } from '../../services/api-key-management.js';

const usage = keyProductUsage([{ id: 'key-1', name: 'Pro Max API key',
  linkedProductIds: ['full-product'], linkedVariantSelections: { 'some-variants': ['Cheese|85g'], 'every-variant': ['A|1', 'B|2'] } }]);
const product = (id, variants = []) => ({ id, variants: variants.map(([flavor, size]) => ({ flavor, size })) });

test('a product fully in the key is covered, with every variant', () => {
  const coverage = keyCoverage(usage, product('full-product', [['Cheese', '85g'], ['BBQ', '85g']]));
  assert.equal(coverage.full, true);
  assert.deepEqual([...coverage.variants].sort(), ['BBQ|85g', 'Cheese|85g']);
});

test('a product with only some variants in the key stays selectable for the rest', () => {
  const coverage = keyCoverage(usage, product('some-variants', [['Cheese', '85g'], ['BBQ', '85g']]));
  assert.equal(coverage.full, false);
  assert.deepEqual([...coverage.variants], ['Cheese|85g']);
});

test('a variant-only selection that already lists every variant counts as full', () => {
  assert.equal(keyCoverage(usage, product('every-variant', [['A', '1'], ['B', '2']])).full, true);
});

test('a product not in any key is not covered', () => {
  const coverage = keyCoverage(usage, product('new-product', [['A', '1']]));
  assert.equal(coverage.full, false); assert.equal(coverage.variants.size, 0);
  assert.equal(keyCoverage([], product('new-product')).full, false);
});

test('a variant-only product is not also listed as fully included', () => {
  const [key] = keyProductUsage([{ id: 'k', linkedProductIds: ['p'], linkedVariantSelections: { p: ['A|1'] } }]);
  assert.equal(key.fullIds.has('p'), false);
  assert.deepEqual([...key.variantSelections.get('p')], ['A|1']);
});

test('the server reports no change when everything picked was already in the key', () => {
  const existing = { linkedProductIds: ['a'], linkedVariantSelections: { x: ['1|a'] } };
  assert.equal(sameScope(existing, mergeScope(existing, ['a'], { x: ['1|a'] })), true);
});

test('new products, new variants and upgrading to every variant all count as changes', () => {
  const existing = { linkedProductIds: ['a'], linkedVariantSelections: { x: ['1|a'] } };
  assert.equal(sameScope(existing, mergeScope(existing, ['b'], {})), false);
  assert.equal(sameScope(existing, mergeScope(existing, [], { x: ['2|b'] })), false);
  assert.equal(sameScope(existing, mergeScope(existing, ['x'], {})), false);
});
