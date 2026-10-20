import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';
import { createPlaygroundPreviewHandler } from '../../../services/playground-preview.js';
import { playgroundHref, previewScopeFromQuery } from '../../../dashboard/src/lib/product-filters.ts';

const variants = [{ flavor: 'Lemon', size: '350g', sku: 'L-350', price: 40 }, { flavor: 'Lemon', size: '700g', sku: 'L-700', price: 70 }];
const records = () => ({
  'users/grocery-owner': { plan: 'Free', businessSegment: 'Grocery' },
  'users/pro-owner': { plan: 'Pro' },
  'products/paste': { name: 'Dish Paste', category: 'Cleaning', segment: 'Grocery', status: 'Active', variants },
  'products/pop': { name: 'Baby Pop', category: 'Candy', segment: 'Grocery', status: 'Active', variants },
  'products/hammer': { name: 'Hammer', category: 'Tools', segment: 'Hardware', status: 'Active', variants },
  'products/hidden': { name: 'Hidden', category: 'Candy', segment: 'Grocery', status: 'rejected', variants },
});
const tokens = { 'grocery-token': 'grocery-owner', 'pro-token': 'pro-owner', 'ghost-token': 'ghost' };
function preview() {
  const db = memoryFirestore(records());
  const handler = createPlaygroundPreviewHandler({ getDb: () => db, verifyIdToken: async token => {
    if (!tokens[token]) throw new Error('bad token');
    return { uid: tokens[token] };
  } });
  return { db, call: options => invoke(handler, options) };
}

test('signed-in preview returns only the selection, in catalog shape, with partial variants', async () => {
  const { db, call } = preview();
  const result = await call({ token: 'pro-token', body: { linkedProductIds: ['pop', 'hammer', 'hidden', 'missing'],
    linkedVariantSelections: { paste: ['Lemon|700g'] } } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.preview, true);
  assert.deepEqual(result.body.products.map(product => product.id).sort(), ['hammer', 'paste', 'pop']);
  const paste = result.body.products.find(product => product.id === 'paste');
  assert.deepEqual(paste.variants.map(variant => variant.sku), ['L-700']);
  assert.equal(paste.price, 70);
  assert.equal(result.body.products.find(product => product.id === 'pop').variants.length, 2);
  // Preview never issues keys, records usage or writes telemetry.
  for (const collection of ['api_keys', 'account_api_usage', 'api_telemetry', 'audit_logs']) {
    assert.equal((await db.collection(collection).get()).size, 0);
  }
});

test('segment-restricted accounts only see their own segment; search narrows the preview', async () => {
  const { call } = preview();
  const scoped = await call({ token: 'grocery-token', body: { linkedProductIds: ['pop', 'hammer', 'paste'] } });
  assert.deepEqual(scoped.body.products.map(product => product.id).sort(), ['paste', 'pop']);
  const searched = await call({ token: 'grocery-token', body: { linkedProductIds: ['pop', 'paste'], search: 'baby' } });
  assert.deepEqual(searched.body.products.map(product => product.id), ['pop']);
});

test('preview requires a valid session, an account and a well-formed bounded scope', async () => {
  const { call } = preview();
  assert.equal((await call({ token: null, body: { linkedProductIds: ['pop'] } })).statusCode, 401);
  assert.equal((await call({ token: 'forged', body: { linkedProductIds: ['pop'] } })).statusCode, 401);
  assert.equal((await call({ token: 'ghost-token', body: { linkedProductIds: ['pop'] } })).statusCode, 404);
  for (const body of [{ linkedProductIds: ['../users/x'] }, { linkedProductIds: 'pop' }, { linkedVariantSelections: { pop: [] } },
    { linkedProductIds: Array.from({ length: 501 }, (_, i) => `p-${i}`) }]) {
    assert.equal((await call({ token: 'pro-token', body })).statusCode, 400);
  }
});

test('Products link carries partial variants and the Playground reads back only selected products', () => {
  const products = [{ id: 'paste', variants }, { id: 'pop', variants }, { id: 'other', variants }];
  const href = playgroundHref(products, new Set(['paste', 'pop']), { paste: new Set(['Lemon|700g']), pop: new Set(['Lemon|350g', 'Lemon|700g']) });
  const query = new URL(href, 'https://synthetic.invalid').searchParams;
  assert.deepEqual(previewScopeFromQuery(query.get('products'), query.get('variants')),
    { linkedProductIds: ['pop'], linkedVariantSelections: { paste: ['Lemon|700g'] } });
  assert.deepEqual(previewScopeFromQuery('a,b', '{"c":["x"],"a":"bad"}'), { linkedProductIds: ['a', 'b'], linkedVariantSelections: {} });
  assert.deepEqual(previewScopeFromQuery('a', 'not json'), { linkedProductIds: ['a'], linkedVariantSelections: {} });
});
