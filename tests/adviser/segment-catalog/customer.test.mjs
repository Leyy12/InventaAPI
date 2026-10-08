import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogQuery, catalogResult, createCustomerCatalogHandler } from '../../../services/customer-catalog.js';
import { loadSegmentCatalog, searchCatalog, catalogSelectableIds, catalogPresentationState, createCatalogRefresh } from '../../../dashboard/src/lib/segment-catalog.ts';
import { trialSelectionState } from '../../../dashboard/src/lib/trial-catalog-selection.ts';
import { selectedLinkedProducts } from '../../../dashboard/src/lib/linked-product-selection.ts';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';

function documents(segment, count, prefix) {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, data: () => ({ name: `${prefix} ${i}`, category: 'Synthetic', segment, status: 'Active', origin: i < 3 ? 'customer-submission' : 'system' }) }));
}
const docs = [...documents('Hardware', 123, 'hardware'), ...documents('Grocery', 82, 'grocery')];
const page = (segment, offset = 0, limit = '20') => catalogResult(docs, catalogQuery({ businessSegment: segment, offset: String(offset), limit }));
const load = (segment, signal = new AbortController().signal) => loadSegmentCatalog(async offset => page(segment, offset), segment, signal);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function scheduler() {
  let id = 0;
  const timers = new Map();
  return { timers, schedule: (callback, delay) => { timers.set(++id, { callback, delay }); return id; }, cancel: key => timers.delete(key) };
}

for (const [segment, total] of [['Hardware', 123], ['Grocery', 82]]) test(`Customer consumes all ${segment} pages, correct availability ${total} and scoped generated cards`, async () => {
  const result = await load(segment);
  assert.equal(result.total, total); assert.equal(result.products.length, total);
  assert.ok(result.products.every(product => product.segment === segment));
  assert.equal(result.products.filter(product => product.origin === 'customer-submission').length, 3);
  assert.equal(catalogSelectableIds(result.products, new Set(), null).length, total);
});

test('full mounted-handler-to-Customer page assembly uses scoped query and total', async () => {
  const records = Object.fromEntries(docs.map(doc => [`products/${doc.id}`, doc.data()]));
  const handler = createCustomerCatalogHandler({ getDb: () => memoryFirestore(records) });
  const result = await loadSegmentCatalog(async offset => (await invoke(handler, {
    query: { businessSegment: 'Grocery', limit: '20', offset: String(offset) },
  })).body, 'Grocery', new AbortController().signal);
  assert.equal(result.total, 82); assert.equal(result.products.length, 82);
});

test('search result count differs from unchanged segment total; no cross-segment results', async () => {
  const result = await load('Grocery');
  assert.equal(searchCatalog(result.products, 'grocery 7').length, 11);
  assert.equal(result.total, 82); assert.equal(searchCatalog(result.products, 'hardware').length, 0);
  assert.equal(catalogSelectableIds(searchCatalog(result.products, 'grocery 7'), new Set(), null).length, 11);
});

test('availability 123, persisted Trial products 45/50, remaining 5, selections limited and included locked', async () => {
  const available = await load('Hardware');
  const includedIds = available.products.slice(0, 45).map(product => product.id);
  const saved = { id: 'key', linkedProductIds: includedIds, linkedVariantSelections: {}, productIds: includedIds, scopeVersion: 0 };
  const measured = { productsIncluded: 45, productsAvailable: 5, activeKeys: 1, expiresAt: '2026-10-20T00:00:00Z' };
  const state = trialSelectionState(measured, saved, new Set());
  assert.equal(available.total, 123); assert.equal(state.included.size, 45); assert.equal(state.remaining, 5);
  const selectable = catalogSelectableIds(available.products, new Set(), { ...state, allowed: true });
  assert.equal(selectable.length, 5); assert.equal(selectable.some(id => state.included.has(id)), false);
  const pending = new Set(selectable.slice(0, 3));
  assert.equal(catalogSelectableIds(available.products, pending, { ...state, allowed: true }).length, 2);
  assert.equal(catalogSelectableIds(available.products, pending, { ...state, allowed: false }).length, 0);
  assert.equal(measured.productsIncluded, 45); assert.equal(measured.productsAvailable, 5);
});

test('paid selections from previous categories remain available to generation without leaking into current grid', async () => {
  const hardware = await load('Hardware'), grocery = await load('Grocery');
  const selected = new Set([hardware.products[0].id, grocery.products[0].id]);
  assert.equal(selectedLinkedProducts([...hardware.products, ...grocery.products], { plan: 'Pro' }, selected).length, 2);
  assert.equal(grocery.products.some(product => product.segment === 'Hardware'), false);
});

test('segment switch: canceled slow Hardware response cannot replace Grocery products/count', async () => {
  const requests = [], states = [], clock = scheduler();
  const start = segment => createCatalogRefresh({ segment, read: signal => new Promise(resolve => requests.push({ signal, resolve })), onState: value => states.push(value), ...clock });
  const old = start('Hardware'); old.refresh(); await flush(); old.stop();
  const current = start('Grocery'); current.refresh(); await flush();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(states.at(-1).status, 'loading'); assert.deepEqual(states.at(-1).products, []); assert.equal(states.at(-1).total, 0);
  requests[1].resolve(await load('Grocery')); await flush();
  requests[0].resolve(await load('Hardware')); await flush();
  assert.equal(states.at(-1).segment, 'Grocery'); assert.equal(states.at(-1).total, 82);
  assert.ok(states.at(-1).products.every(product => product.segment === 'Grocery'));
  current.stop(); assert.equal(clock.timers.size, 0);
});

test('explicit refresh invalidates prior request and unmount prevents late publication', async () => {
  const requests = [], states = [], clock = scheduler();
  const refresh = createCatalogRefresh({ segment: 'Hardware', read: signal => new Promise(resolve => requests.push({ signal, resolve })), onState: state => states.push(state), ...clock });
  refresh.refresh(); await flush(); refresh.refresh(); await flush();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(await load('Hardware')); await flush();
  const published = states.length;
  requests[0].resolve({ total: 999, products: [] }); await flush(); assert.equal(states.length, published);
  refresh.refresh(); await flush(); refresh.stop();
  const stopped = states.length; requests[2].resolve(await load('Hardware')); await flush(); assert.equal(states.length, stopped);
});

test('explicit refresh observes changed catalog with atomic grid/count updates and no periodic timer', async () => {
  let total = 120, source;
  const clock = scheduler();
  const refresh = createCatalogRefresh({ segment: 'Hardware', read: async () => ({ total, products: documents('Hardware', total, 'h').map(doc => ({ ...doc.data(), id: doc.id })) }), onState: value => { source = value; }, ...clock });
  refresh.refresh(); await flush(); assert.equal(source.total, 120);
  assert.equal(clock.timers.size, 0);
  total = 121; refresh.refresh(); await flush(); assert.equal(source.total, 121); assert.equal(source.products.length, 121);
  refresh.stop();
});

test('timeout fails visibly with no stale/global fallback and late success ignored', async () => {
  let resolve, source; const clock = scheduler();
  const refresh = createCatalogRefresh({ segment: 'Grocery', read: () => new Promise(done => { resolve = done; }), onState: value => { source = value; }, ...clock });
  refresh.refresh(); await flush(); [...clock.timers.values()].find(value => value.delay === 15000).callback();
  assert.equal(source.status, 'error'); assert.deepEqual(source.products, []);
  resolve(await load('Grocery')); await flush(); assert.equal(source.status, 'error'); refresh.stop();
});

test('incompatible HTTP 200 schema becomes unavailable without inventing an empty result or total', async () => {
  let source; const clock = scheduler();
  const refresh = createCatalogRefresh({ segment: 'Grocery', read: signal => loadSegmentCatalog(async () => {
    signal.throwIfAborted(); return { products: docs.filter(doc => doc.data().segment === 'Grocery') };
  }, 'Grocery', signal), onState: value => { source = value; }, ...clock });
  refresh.refresh(); await flush();
  assert.equal(source.status, 'error'); assert.deepEqual(source.products, []); assert.equal(source.total, 0);
  assert.equal(catalogPresentationState(source, 0, ''), 'error');
  assert.equal(clock.timers.size, 0, 'failure must not start an infinite retry loop');
  refresh.stop();
});

test('HTTP failure is unavailable state rather than successful empty catalog', async () => {
  let source; const clock = scheduler();
  const refresh = createCatalogRefresh({ segment: 'Grocery', read: async () => { throw new Error('Catalog unavailable.'); },
    onState: value => { source = value; }, ...clock });
  refresh.refresh(); await flush();
  assert.equal(source.status, 'error'); assert.equal(catalogPresentationState(source, 0, ''), 'error');
  refresh.stop();
});

test('verified segment-empty, zero-search, and product states stay distinct', async () => {
  const empty = { segment: 'Pharmacy', status: 'ready', products: [], total: 0 };
  assert.equal(catalogPresentationState(empty, 0, ''), 'empty-segment');
  const grocery = await load('Grocery');
  assert.equal(catalogPresentationState({ segment: 'Grocery', status: 'ready', ...grocery }, 0, 'unmatched'), 'empty-search');
  assert.equal(catalogPresentationState({ segment: 'Grocery', status: 'ready', ...grocery }, 82, ''), 'products');
  assert.equal(catalogPresentationState(null, 0, ''), 'loading');
});

test('catalog UI copy keeps errors, empty segments, and search-empty states separate', () => {
  const page = readFileSync(new URL('../../../dashboard/src/app/dashboard/products/page.tsx', import.meta.url), 'utf8');
  const empty = readFileSync(new URL('../../../dashboard/src/components/product-request/ProductNotFound.tsx', import.meta.url), 'utf8');
  assert.match(page, /catalogView === 'error'[\s\S]*?Catalog unavailable[\s\S]*?catalogRefresh.current\?\.refresh\(\)[\s\S]*?Retry catalog/);
  assert.match(page, /catalogView === 'empty-segment' \|\| catalogView === 'empty-search'/);
  assert.match(page, /<ProductCatalogEmptyState[\s\S]*?onClearSearch=\{\(\) => setSearchQuery\(""\)\}/);
  assert.doesNotMatch(`${page}\n${empty}`, /404\s*[·.-]\s*Not Found|Product Not Found/);
  assert.match(empty, /No products available/); assert.match(empty, /There are currently no available products in/);
  assert.match(empty, /No matching products/); assert.match(empty, /No products in .* match/);
  assert.match(empty, /Clear Search/); assert.doesNotMatch(empty, /matching\s+["']\s*["']/);
  assert.match(page, /currentCatalog\?\.status === 'ready' \? currentCatalog\.total : null/);
  assert.doesNotMatch(page, /addEventListener\(['"](?:focus|visibilitychange)/); assert.match(page, /refresh\.stop\(\)/);
});

for (const label of ['global-total', 'wrong-segment', 'duplicate', 'old-backend', 'incomplete', 'changed-count']) test(`mixed/invalid backend ${label} fails closed rather than inventing availability`, async () => {
  await assert.rejects(loadSegmentCatalog(async offset => {
    const result = page('Grocery', offset);
    if (label === 'global-total') result.pagination.total = 205;
    if (label === 'wrong-segment') result.products[0].segment = 'Hardware';
    if (label === 'duplicate') result.products[1] = result.products[0];
    if (label === 'old-backend') return { products: result.products };
    if (label === 'incomplete') { result.products = []; result.pagination.returned = 0; }
    if (label === 'changed-count' && offset) { result.availability.total++; result.pagination.total++; }
    return result;
  }, 'Grocery', new AbortController().signal));
});

test('already aborted read performs no request; invalid selection cannot fetch global products', async () => {
  let calls = 0; const controller = new AbortController(); controller.abort();
  await assert.rejects(loadSegmentCatalog(async () => { calls++; }, 'Grocery', controller.signal));
  await assert.rejects(loadSegmentCatalog(async () => { calls++; }, '', new AbortController().signal));
  assert.equal(calls, 0);
});

test('legitimate empty segment is ready with zero, not an error or hard-coded fallback', async () => {
  const result = await loadSegmentCatalog(async () => catalogResult([], catalogQuery({ segment: 'Pharmacy', limit: '200' })),
    'Pharmacy', new AbortController().signal);
  assert.deepEqual(result, { products: [], total: 0 });
});

test('malformed page-size metadata cannot assemble a misleading total', async () => {
  await assert.rejects(loadSegmentCatalog(async () => ({ ...page('Grocery'),
    pagination: { ...page('Grocery').pagination, limit: undefined } }), 'Grocery', new AbortController().signal));
});

test('Customer wiring uses same response for grid/count, safe segment identity, independent search and Trial usage', () => {
  const source = readFileSync(new URL('../../../dashboard/src/app/dashboard/products/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /key=\{user\?\.uid/);
  assert.match(source, /isFreePlan\(appUser\?\.plan\) \? activeCustomerSegment\(appUser\)/);
  assert.match(source, /businessSegment: activeSegment, limit: '200'/);
  assert.match(source, /catalogSource\?\.segment === activeSegment/);
  assert.match(source, /currentCatalog\.total/);
  assert.match(source, /catalogPresentationState\(currentCatalog, searchedProducts\.length, searchQuery\)/);
  assert.match(source, /currentCatalog.products.map/);
  assert.match(source, /Product Available: \{productAvailable/);
  assert.match(source, /filteredProducts.length\} results/);
  assert.match(source, /Select All \(\{selectableIds.length\}\)/);
  assert.match(source, /if \(additions.has\(p.id!\)/); // Does not reset already-selected partial variants.
  assert.doesNotMatch(source, /addEventListener\(['"](?:focus|visibilitychange)/);
  assert.match(source, /catalogRefresh.current\?\.refresh\(\)/);
  assert.match(source, /refresh.stop\(\)/);
  assert.match(source, /Products: \{trialCatalog.productsIncluded\}/);
  assert.match(source, /trialRemainingSlots\(trialCatalog.productsIncluded\)/);
  assert.match(source, /Add Selected Products|Clear New Selections/);
  assert.match(source, /trialState.included.has\(productId\)/);
  assert.doesNotMatch(source, /getAllProducts|Save Trial Catalog|\b497\b|products.length.*Product Available/);
});
