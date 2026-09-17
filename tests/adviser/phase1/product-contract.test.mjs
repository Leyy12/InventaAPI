import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateProductVisibility,
  normalizeCategory,
  normalizeSegment,
  productIdentity,
  productIdentityKeys,
  projectProduct,
} from '../../../services/product-contract.js';

test('projects the current variants shape without mutating the source', () => {
  const source = {
    name: '  Vitamin   C ',
    brand: ' Health Co ',
    segment: ' pharmacy ',
    category: ' Supplements ',
    status: 'Active',
    is_active: true,
    variants: [
      { dosage: '500 mg', form: 'Tablet', price: '12.50', sku: ' vc-500 ' },
      { dosage: '1000 mg', form: 'Tablet', price: 20, sku: 'VC-1000' },
    ],
  };

  const projected = projectProduct(source, 'product-current');
  assert.equal(projected.id, 'product-current');
  assert.equal(projected.name, 'Vitamin C');
  assert.equal(projected.segment, 'Pharmacy');
  assert.equal(projected.category, 'Supplements');
  assert.equal(projected.price, 12.5);
  assert.equal(projected.visibility.visible, true);
  assert.deepEqual(projected.identityKeys, ['sku:VC-1000', 'sku:VC-500']);
  assert.equal(source.variants[0].sku, ' vc-500 ');
});

test('projects legacy root fields and variations into the compatibility shape', () => {
  const projected = projectProduct({
    barcode: ' 4800000000100 ',
    name: 'Hammer',
    description: 'Steel claw hammer',
    category: ' Hardware ',
    businessType: 'hardware',
    price: 64,
    size: 'Standard',
    image: 'https://example.test/hammer.png',
    status: 'Active',
    variations: [{ type: 'Weight', options: ['8 oz', '16 oz'] }],
    attributes: { brand: 'Generic Premium' },
  }, 'legacy-hammer');

  assert.equal(projected.sku, '4800000000100');
  assert.equal(projected.brand, 'Generic Premium');
  assert.equal(projected.segment, 'Hardware');
  assert.equal(projected.price, 64);
  assert.equal(projected.variants.length, 1);
  assert.equal(projected.variants[0].size, 'Standard');
  assert.equal(projected.variations[0].type, 'Weight');
  assert.equal(projected.image_url, 'https://example.test/hammer.png');
});

test('normalizes only the supported business segments and preserves category meaning', () => {
  assert.equal(normalizeSegment(' GROCERY '), 'Grocery');
  assert.equal(normalizeSegment('medicine'), 'Pharmacy');
  assert.equal(normalizeSegment('Tools'), 'Hardware');
  assert.equal(normalizeSegment('Clothing'), null);
  assert.equal(normalizeCategory('  Canned   Goods '), 'Canned Goods');
});

test('prefers meaningful SKU identities and ignores placeholder SKU values', () => {
  assert.equal(productIdentity({ name: 'Rice', sku: ' ab-12 ', status: 'Active' }), 'sku:AB-12');
  assert.ok(productIdentity({
    name: 'Rice', sku: 'N/A', segment: 'Grocery', category: 'Grains', brand: 'Farm Co', size: '1 kg', status: 'Active',
  }).startsWith('fallback:'));
});

test('fallback identity is deterministic across compatible legacy and current shapes', () => {
  const legacy = {
    product: 'Brown   Rice',
    businessType: 'grocery',
    category: 'Grains',
    attributes: { brand: 'Farm Co', size: '1 kg' },
    size: '1 kg',
    status: 'Active',
  };
  const current = {
    name: ' brown rice ',
    segment: 'Grocery',
    category: ' grains ',
    brand: 'farm co',
    variants: [{ size: '1 KG' }],
    status: 'Active',
  };
  assert.equal(productIdentity(legacy), productIdentity(current));
});

test('equivalent legacy variation options and current variants share a fallback identity', () => {
  const shared = { name: 'Rice', segment: 'Grocery', category: 'Grains', brand: 'Farm Co', status: 'Active' };
  const legacy = { ...shared, variations: [{ type: 'Size', options: ['1 kg', '2 kg'] }] };
  const current = { ...shared, variants: [{ size: '2 KG' }, { size: '1 KG' }] };
  assert.equal(productIdentity(legacy), productIdentity(current));
});

test('fallback identity resists collisions across meaningful product discriminators', () => {
  const base = { name: 'Drill', segment: 'Hardware', category: 'Power Tools', status: 'Active' };
  const identities = [
    productIdentity({ ...base, brand: 'Brand A', size: '10 mm' }),
    productIdentity({ ...base, brand: 'Brand B', size: '10 mm' }),
    productIdentity({ ...base, brand: 'Brand A', size: '13 mm' }),
    productIdentity({ ...base, brand: 'Brand A', size: '10 mm', segment: 'Grocery' }),
  ];
  assert.equal(new Set(identities).size, identities.length);
});

test('all meaningful variant SKUs become deterministic identity keys', () => {
  const keys = productIdentityKeys({
    name: 'Juice',
    segment: 'Grocery',
    category: 'Beverages',
    status: 'Active',
    variants: [{ sku: 'JUICE-B' }, { sku: ' juice-a ' }, { sku: 'JUICE-B' }],
  });
  assert.deepEqual(keys, ['sku:JUICE-A', 'sku:JUICE-B']);
});

test('publication visibility requires a positive signal and honors every blocker', () => {
  const cases = [
    [{ status: 'Active' }, true, 'positive_status'],
    [{ status: 'published' }, true, 'positive_status'],
    [{ is_active: true }, true, 'positive_flag'],
    [{ status: 'Active', is_active: false }, false, 'is_active_false'],
    [{ status: 'Archived', is_active: true }, false, 'archived'],
    [{ status: 'Pending', is_active: true }, false, 'pending'],
    [{ status: 'Active', published: false }, false, 'published_false'],
    [{ status: 'Unexpected', is_active: true }, false, 'unknown_status'],
    [{ name: 'Ambiguous product' }, false, 'no_publication_signal'],
    [{ status: 'Active', archived: true }, false, 'archived'],
  ];

  for (const [product, visible, reason] of cases) {
    assert.deepEqual(evaluateProductVisibility(product), { visible, reason });
  }
});

test('canonical publication remains fail-closed when required product meaning is absent', () => {
  assert.deepEqual(
    projectProduct({ status: 'Active', segment: 'Grocery', category: 'Food' }).visibility,
    { visible: false, reason: 'missing_name' },
  );
  assert.deepEqual(
    projectProduct({ status: 'Active', name: 'Rice', segment: 'Grocery' }).visibility,
    { visible: false, reason: 'missing_category' },
  );
  assert.deepEqual(
    projectProduct({ status: 'Active', name: 'Shirt', category: 'Clothing', segment: 'Clothing' }).visibility,
    { visible: false, reason: 'unsupported_segment' },
  );
});
