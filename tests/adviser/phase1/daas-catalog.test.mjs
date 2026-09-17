import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorizedProductIds,
  formatDaaSProduct,
  resolveCurrentCatalogProducts,
} from '../../../services/daas-catalog.js';

function memoryLoader(store) {
  return async id => {
    const value = store.get(id);
    return value ? structuredClone(value) : null;
  };
}

test('the same existing API key dereferences the current product on every request', async () => {
  const apiKeyData = Object.freeze({
    id: 'key-document-1',
    key: 'existing-key-value',
    linkedProductIds: ['product-x'],
    linkedVariantSelections: {},
  });
  const store = new Map([['product-x', {
    name: 'Original name', segment: 'Grocery', category: 'Food', status: 'Active',
    variants: [{ sku: 'PX-1', size: '1 kg', price: 100 }],
  }]]);
  const options = {
    apiKeyData,
    loadProductById: memoryLoader(store),
    userData: { plan: 'Free', selectedSegment: 'Grocery' },
  };

  const before = await resolveCurrentCatalogProducts(options);
  store.set('product-x', {
    name: 'Current approved name', segment: 'Grocery', category: 'Food', status: 'Active',
    variants: [{ sku: 'PX-1', size: '1 kg', price: 125 }],
  });
  const after = await resolveCurrentCatalogProducts(options);

  assert.equal(before.products[0].name, 'Original name');
  assert.equal(after.products[0].name, 'Current approved name');
  assert.equal(after.products[0].price, 125);
  assert.equal(apiKeyData.id, 'key-document-1');
  assert.deepEqual(apiKeyData.linkedProductIds, ['product-x']);
});

test('a legacy linkedProducts key reloads current data and ignores its stale embedded snapshot', async () => {
  const apiKeyData = {
    linkedProducts: [{
      id: 'legacy-product',
      name: 'Stale embedded name',
      sku: 'STALE-SKU',
      segment: 'Pharmacy',
      price: 1,
      status: 'Archived',
    }],
    linkedProductIds: [],
  };
  const store = new Map([['legacy-product', {
    name: 'Current catalog name', segment: 'Grocery', category: 'Food', status: 'Active',
    variants: [{ sku: 'CURRENT-SKU', size: '1 kg', price: 125 }],
  }]]);

  const before = await resolveCurrentCatalogProducts({ apiKeyData, loadProductById: memoryLoader(store) });
  store.set('legacy-product', {
    name: 'Updated current name', segment: 'Grocery', category: 'Food', status: 'Active',
    variants: [{ sku: 'CURRENT-SKU', size: '1 kg', price: 150 }],
  });
  const after = await resolveCurrentCatalogProducts({ apiKeyData, loadProductById: memoryLoader(store) });

  assert.equal(before.products[0].name, 'Current catalog name');
  assert.equal(after.products[0].name, 'Updated current name');
  assert.equal(after.products[0].price, 150);
  assert.notEqual(after.products[0].name, apiKeyData.linkedProducts[0].name);
  assert.notEqual(after.products[0].sku, apiKeyData.linkedProducts[0].sku);
});

test('a legacy linkedProducts key follows current visibility changes', async () => {
  const apiKeyData = { linkedProducts: [{ id: 'legacy-product', name: 'Embedded copy' }] };
  const store = new Map([['legacy-product', {
    name: 'Visible product', segment: 'Grocery', category: 'Food', status: 'Active',
  }]]);
  const loadProductById = memoryLoader(store);
  assert.equal((await resolveCurrentCatalogProducts({ apiKeyData, loadProductById })).products.length, 1);

  for (const currentState of [
    { status: 'Active', is_active: false },
    { status: 'Archived', is_active: true },
    { status: 'Active', published: false },
  ]) {
    store.set('legacy-product', {
      name: 'Current product', segment: 'Grocery', category: 'Food', ...currentState,
    });
    assert.deepEqual(
      (await resolveCurrentCatalogProducts({ apiKeyData, loadProductById })).products,
      [],
    );
  }
});

test('authorization deduplicates current, legacy, and partial-variant references', async () => {
  const apiKeyData = {
    linkedProductIds: ['product-x'],
    linkedProducts: [{ id: 'product-x', name: 'Embedded copy' }],
    linkedVariantSelections: { 'product-x': ['Original|1 kg'] },
  };
  let loads = 0;
  const result = await resolveCurrentCatalogProducts({
    apiKeyData,
    loadProductById: async id => {
      loads += 1;
      assert.equal(id, 'product-x');
      return {
        name: 'Current product', segment: 'Grocery', category: 'Food', status: 'Active',
        variants: [{ flavor: 'Original', size: '1 kg', sku: 'PX-1', price: 10 }],
      };
    },
  });

  assert.deepEqual(result.productIds, ['product-x']);
  assert.equal(result.products.length, 1);
  assert.equal(loads, 1);
});

test('malformed legacy linkedProducts entries do not grant product access', () => {
  const ids = authorizedProductIds({
    linkedProducts: [
      null,
      'product-x',
      {},
      { id: '' },
      { id: '   ' },
      { id: 42 },
      { id: 'products/product-x' },
      { id: '..' },
      { productId: 'not-an-observed-legacy-shape' },
      { name: 'Rice', sku: 'RICE-1', category: 'Food', segment: 'Grocery', price: 10 },
    ],
  });
  assert.deepEqual(ids, []);
});

test('legacy-ID fallback preserves flavor-size partial variant selection', async () => {
  const apiKeyData = {
    linkedProducts: [{ id: 'juice', name: 'Old juice name' }],
    linkedVariantSelections: { juice: ['Orange|1 L'] },
  };
  const resolved = await resolveCurrentCatalogProducts({
    apiKeyData,
    loadProductById: memoryLoader(new Map([['juice', {
      name: 'Current juice', segment: 'Grocery', category: 'Beverages', status: 'Active',
      variants: [
        { flavor: 'Orange', size: '1 L', sku: 'OJ-1L', price: 90 },
        { flavor: 'Orange', size: '250 ml', sku: 'OJ-250', price: 35 },
      ],
    }]])),
  });
  const formatted = formatDaaSProduct(resolved.products[0], {
    selectedVariants: apiKeyData.linkedVariantSelections.juice,
  });

  assert.deepEqual(formatted.variants.map(variant => variant.sku), ['OJ-1L']);
  assert.equal(formatted.sku, 'OJ-1L');
});

test('the same authorization stops exposing inactive, archived, and unpublished products', async () => {
  const apiKeyData = { linkedProductIds: ['product-x'] };
  const store = new Map([['product-x', {
    name: 'Eligible', segment: 'Grocery', category: 'Food', status: 'Active',
  }]]);
  const loadProductById = memoryLoader(store);
  const before = await resolveCurrentCatalogProducts({ apiKeyData, loadProductById });
  assert.equal(before.products.length, 1);

  const states = [
    { name: 'Inactive', status: 'Active', is_active: false },
    { name: 'Archived', status: 'Archived', is_active: true },
    { name: 'Unpublished', status: 'Active', published: false },
    { name: 'Unpublished status', status: 'Unpublished' },
    { name: 'Ambiguous' },
  ];

  for (const state of states) {
    store.set('product-x', {
      ...state, segment: 'Grocery', category: 'Food', variants: [{ sku: 'PX-1', price: 10 }],
    });
    const result = await resolveCurrentCatalogProducts({ apiKeyData, loadProductById });
    assert.deepEqual(result.products, [], state.name);
    assert.deepEqual(result.productIds, ['product-x']);
  }
});

test('segment compatibility keeps Free access single-segment and fail-closed for unknown values', async () => {
  const store = new Map([
    ['grocery', { name: 'Rice', segment: 'grocery', category: 'Food', status: 'Active' }],
    ['hardware', { name: 'Hammer', businessType: 'tools', category: 'Tools', status: 'Active' }],
  ]);
  const apiKeyData = { linkedProductIds: ['grocery', 'hardware'] };

  const grocery = await resolveCurrentCatalogProducts({
    apiKeyData, loadProductById: memoryLoader(store), userData: { plan: 'Starter', selectedSegment: ' GROCERY ' },
  });
  assert.deepEqual(grocery.products.map(product => product.id), ['grocery']);

  const unknown = await resolveCurrentCatalogProducts({
    apiKeyData, loadProductById: memoryLoader(store), userData: { plan: 'Free', selectedSegment: 'Clothing' },
  });
  assert.deepEqual(unknown.products, []);
});

test('DaaS withholds a published-looking product outside the canonical segment contract', async () => {
  const store = new Map([['clothing', {
    name: 'Shirt', segment: 'Clothing', category: 'Apparel', status: 'Active',
  }]]);
  const result = await resolveCurrentCatalogProducts({
    apiKeyData: { linkedProductIds: ['clothing'] },
    loadProductById: memoryLoader(store),
    userData: { plan: 'Pro' },
  });
  assert.deepEqual(result.products, []);
});

test('DaaS formatting preserves the response shape for current and legacy products', async () => {
  const store = new Map([
    ['current', {
      name: 'Juice', segment: 'Grocery', category: 'Beverages', status: 'Active', is_active: true,
      variants: [
        { flavor: 'Orange', size: '1 L', sku: 'OJ-1L', price: 90 },
        { flavor: 'Orange', size: '250 ml', sku: 'OJ-250', price: 35 },
      ],
    }],
    ['legacy', {
      name: 'Hammer', businessType: 'hardware', category: 'Hardware', barcode: 'HAM-1',
      price: 64, size: 'Standard', status: 'Active',
    }],
  ]);
  const result = await resolveCurrentCatalogProducts({
    apiKeyData: { linkedProductIds: ['current', 'legacy'] },
    loadProductById: memoryLoader(store),
  });

  const current = formatDaaSProduct(result.products[0], {
    selectedVariants: ['Orange|1 L'],
    availability: { availableSince: new Date('2026-01-02T03:04:05.000Z') },
  });
  assert.equal(current.sku, 'OJ-1L');
  assert.equal(current.price, 90);
  assert.equal(current.variants.length, 1);
  assert.equal(current.availableToConsumerSince, '2026-01-02T03:04:05.000Z');

  const legacy = formatDaaSProduct(result.products[1]);
  assert.equal(legacy.sku, 'HAM-1');
  assert.equal(legacy.price, 64);
  assert.equal(legacy.size, 'Standard');
});

test('DaaS preserves arbitrary stored variant payload fields and value types', async () => {
  const storedProduct = {
    name: 'Orange Juice',
    segment: 'Grocery',
    category: 'Beverages',
    status: 'Active',
    image_url: '  https://example.test/orange.png  ',
    metadata: { source: 'supplier-a', nested: { reviewed: true } },
    tags: ['  citrus  ', 12, false],
    variants: [
      {
        flavor: 'Orange',
        size: '1 L',
        sku: 'OJ-1L',
        price: '90.50',
        expirationDate: '2027-01-02',
        color: 'Orange',
        packageCount: 12,
        seasonal: false,
        attributes: { recyclable: true, deposit: 2.5 },
      },
      { flavor: 'Orange', size: '250 ml', sku: 'OJ-250', price: 35 },
    ],
  };
  const original = structuredClone(storedProduct);
  const resolved = await resolveCurrentCatalogProducts({
    apiKeyData: {
      linkedProductIds: ['orange-juice'],
      linkedVariantSelections: { 'orange-juice': ['Orange|1 L'] },
    },
    loadProductById: async () => storedProduct,
  });
  const formatted = formatDaaSProduct(resolved.products[0], {
    selectedVariants: ['Orange|1 L'],
  });

  assert.equal(formatted.variants.length, 1);
  assert.equal(formatted.price, 90.5);
  assert.equal(typeof formatted.price, 'number');
  assert.equal(formatted.variants[0].price, '90.50');
  assert.equal(typeof formatted.variants[0].price, 'string');
  assert.equal(formatted.variants[0].color, 'Orange');
  assert.equal(formatted.variants[0].packageCount, 12);
  assert.equal(formatted.variants[0].seasonal, false);
  assert.deepEqual(formatted.variants[0].attributes, { recyclable: true, deposit: 2.5 });
  assert.equal(formatted.expirationDate, '2027-01-02');
  assert.equal(formatted.image_url, '  https://example.test/orange.png  ');
  assert.deepEqual(formatted.metadata, storedProduct.metadata);
  assert.deepEqual(formatted.tags, storedProduct.tags);
  assert.deepEqual(storedProduct, original);
});

test('search operates on the canonical current projection', async () => {
  const store = new Map([['p1', {
    product: 'Cordless Drill', businessType: 'hardware', category: 'Power Tools',
    barcode: 'DRILL-18V', status: 'Active',
  }]]);
  const result = await resolveCurrentCatalogProducts({
    apiKeyData: { linkedProductIds: ['p1'] },
    loadProductById: memoryLoader(store),
    searchQuery: 'drill-18v',
  });
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].name, 'Cordless Drill');
});
