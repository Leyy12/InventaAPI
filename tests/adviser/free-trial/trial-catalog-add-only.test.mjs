import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trialSelectionState, toggleTrialPending, trialAdditionScope } from '../../../dashboard/src/lib/trial-catalog-selection.ts';
import { trialCapacityMessage } from '../../../dashboard/src/lib/trial-display.mjs';
import { subscribeAccountUsage, invalidateAccountUsage } from '../../../dashboard/src/lib/account-usage-events.ts';
import { createQuotaRefresh } from '../../../dashboard/src/lib/quota-refresh.ts';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { createFreeTrialHandlers } from '../../../services/free-trial.js';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';

const ids = n => Array.from({ length: n }, (_, i) => `product-${i}`);
const catalog = n => ({ productsIncluded: n, productsAvailable: Math.max(50 - n, 0), activeKeys: 1, expiresAt: '2026-10-10T00:00:00Z' });
const key = n => ({ id: 'key-a', scopeVersion: 0, linkedProductIds: ids(n), linkedVariantSelections: {}, productIds: ids(n) });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');

for (const n of [0, 45, 49, 50, 51]) test(`Customer summary measures persisted ${n}, not pending/filtered cards`, () => {
  const state = trialSelectionState(catalog(n), key(n), new Set(['new-a', 'new-b', 'new-c']));
  assert.equal(state.remaining, Math.max(50 - n, 0));
  assert.equal(state.included.size, n);
  assert.equal(state.pending.size, 3);
  assert.equal(catalog(n).productsIncluded, n);
});

test('45 persisted: included cards lock, three pending toggle independently, clear leaves included intact', () => {
  const measured = catalog(45), saved = key(45);
  let pending = new Set();
  const included = new Set(saved.productIds);
  pending = toggleTrialPending(pending, 'product-0', included, 5, true);
  assert.equal(pending.size, 0); assert.equal(included.size, 45);
  for (const id of ['new-a', 'new-b', 'new-c']) pending = toggleTrialPending(pending, id, included, 5, true);
  assert.equal(pending.size, 3); assert.equal(measured.productsIncluded, 45); assert.equal(measured.activeKeys, 1);
  assert.equal(trialSelectionState(measured, saved, pending).remaining, 5);
  pending = toggleTrialPending(pending, 'new-c', included, 5, true);
  assert.equal(pending.size, 2); assert.equal(measured.productsIncluded, 45);
  pending = new Set();
  assert.equal(trialSelectionState(measured, saved, pending).included.size, 45);
});

test('45+3 becomes 48 only after authoritative success; new products are then locked', () => {
  const pending = new Set(ids(48).slice(45));
  const before = trialSelectionState(catalog(45), key(45), pending);
  assert.equal(before.canSubmit, true); assert.equal(before.remaining, 5);
  const after = trialSelectionState(catalog(48), key(48), pending);
  assert.equal(after.pending.size, 0); assert.equal(after.remaining, 2);
  assert.equal(toggleTrialPending(after.pending, 'product-47', after.included, 2, true).size, 0);
});

test('remaining slots bound pending selection; 50 and legacy over-cap disable additions but not pending cancellation', () => {
  let pending = new Set();
  for (const id of ids(6)) pending = toggleTrialPending(pending, id, new Set(), 5, true);
  assert.equal(pending.size, 5);
  for (const n of [50, 51]) {
    const state = trialSelectionState(catalog(n), key(n), new Set());
    assert.equal(state.canSelect, false); assert.equal(state.canSubmit, false);
    assert.equal(toggleTrialPending(new Set(), 'new', state.included, 0, true).size, 0);
  }
  assert.equal(toggleTrialPending(new Set(['pending']), 'pending', new Set(), 0, true).size, 0);
  assert.equal(trialCapacityMessage(50), 'Free Trial product limit reached — 50 of 50 products.');
});

test('unverified or inconsistent catalog cannot select/add or invent measured usage', () => {
  for (const measured of [null, catalog(0), { ...catalog(0), activeKeys: 2 }]) {
    const state = trialSelectionState(measured, null, new Set());
    assert.equal(state.canSelect, false); assert.equal(state.canSubmit, false);
  }
  assert.equal(toggleTrialPending(new Set(), 'new', new Set(), 50, false).size, 0);
});

test('verified zero-key Trial selects locally before generation, including zero-product generation', () => {
  const measured = { ...catalog(0), activeKeys: 0 };
  let pending = new Set();
  const state = trialSelectionState(measured, null, pending);
  assert.equal(state.mode, 'first-key'); assert.equal(state.canSelect, true);
  assert.equal(state.canSubmit, false); assert.equal(state.canGenerateFirstKey, true);
  pending = toggleTrialPending(pending, 'new', state.included, state.remaining, state.canToggle);
  assert.equal(pending.has('new'), true);
  pending = toggleTrialPending(pending, 'new', state.included, state.remaining, state.canToggle);
  assert.equal(pending.size, 0); assert.equal(measured.productsIncluded, 0);
});

test('all inconsistent key/count evidence fails closed, never creates a first-key allowance', () => {
  for (const [measured, saved] of [
    [catalog(0), null], [{ ...catalog(0), activeKeys: 0 }, key(0)],
    [{ ...catalog(0), activeKeys: 2 }, key(0)],
    [{ ...catalog(1), activeKeys: 0 }, null], [catalog(2), key(1)],
    [{ ...catalog(0), productsIncluded: -1, activeKeys: 0 }, null],
    [{ ...catalog(0), productsIncluded: NaN, activeKeys: 0 }, null],
  ]) {
    const state = trialSelectionState(measured, saved, new Set());
    assert.equal(state.mode, 'blocked'); assert.equal(state.canSelect, false);
    assert.equal(state.canGenerateFirstKey, false); assert.equal(state.canSubmit, false);
    assert.equal(toggleTrialPending(new Set(), 'new', state.included, state.remaining, state.canToggle).size, 0);
  }
});

test('first-key 49/50/51 boundaries and existing 40+10 count unique products, not variants', () => {
  const measured = { ...catalog(0), activeKeys: 0 };
  let pending = new Set(ids(49));
  let state = trialSelectionState(measured, null, pending);
  assert.equal(state.canSelect, true);
  pending = toggleTrialPending(pending, 'product-49', state.included, state.remaining, state.canToggle);
  state = trialSelectionState(measured, null, pending);
  assert.equal(pending.size, 50); assert.equal(state.canSelect, false);
  assert.equal(state.canGenerateFirstKey, true);
  assert.equal(toggleTrialPending(pending, 'product-50', state.included, state.remaining, state.canToggle).size, 50);
  assert.equal(trialSelectionState(measured, null, new Set(ids(51))).canGenerateFirstKey, false);
  const saved = key(40); state = trialSelectionState(catalog(40), saved, new Set());
  pending = new Set();
  for (const id of ids(11).map(id => 'new-' + id)) pending = toggleTrialPending(pending, id, state.included, state.remaining, state.canToggle);
  assert.equal(pending.size, 10); assert.equal(state.mode, 'existing-key');
});

for (const segment of ['Hardware', 'Grocery', 'Pharmacy']) test(`${segment}: backend first Trial key persists selected full/partial scope and one active key`, async () => {
  const db = memoryFirestore({
    'users/owner': { role: 'Developer', plan: 'Free', businessSegment: segment },
    'products/full': { name: 'Synthetic full', segment },
    'products/partial': { name: 'Synthetic partial', segment, variants: [{ flavor: 'a', size: 'each' }, { flavor: 'b', size: 'each' }] },
  });
  const options = { getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }), clock: () => new Date('2026-10-05T00:00:00Z') };
  assert.equal((await invoke(createFreeTrialHandlers(options).session)).statusCode, 200);
  assert.equal(db.read('users/owner').businessSegment, segment);
  const handlers = createApiKeyHandlers(options);
  const before = (await invoke(handlers.list)).body;
  assert.equal(trialSelectionState(before.trialCatalog, null, new Set()).mode, 'first-key');
  const result = await invoke(handlers.create, { body: { keyName: 'Synthetic first key', linkedProductIds: ['full'],
    linkedVariantSelections: { partial: ['a|each'] }, linkedProducts: [{ id: 'full' }, { id: 'partial' }] } });
  assert.equal(result.statusCode, 200);
  const stored = db.read('api_keys/' + result.body.id);
  assert.deepEqual(stored.linkedProductIds, ['full']); assert.deepEqual(stored.linkedVariantSelections, { partial: ['a|each'] });
  const after = (await invoke(handlers.list)).body;
  assert.equal(after.keys.length, 1); assert.equal(after.trialCatalog.activeKeys, 1);
  assert.equal(after.trialCatalog.productsIncluded, 2);
  const saved = { ...after.keys[0], productIds: ['full', 'partial'] };
  const state = trialSelectionState(after.trialCatalog, saved, new Set(['full', 'partial']));
  assert.equal(state.mode, 'existing-key'); assert.equal(state.pending.size, 0);
  assert.equal(state.included.size, 2);
});

test('Hardware first-key backend rejects Grocery scope without creating any key', async () => {
  const db = memoryFirestore({ 'users/owner': { role: 'Developer', plan: 'Free', businessSegment: 'Hardware' },
    'products/food': { segment: 'Grocery' } });
  const options = { getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }), clock: () => new Date('2026-10-05T00:00:00Z') };
  await invoke(createFreeTrialHandlers(options).session);
  const handlers = createApiKeyHandlers(options);
  const result = await invoke(handlers.create, { body: { keyName: 'Wrong segment', linkedProductIds: ['food'] } });
  assert.equal(result.statusCode, 403); assert.equal(result.body.error, 'PLAN_SEGMENT_RESTRICTION');
  assert.equal((await invoke(handlers.list)).body.keys.length, 0);
});

test('addition payload preserves unavailable persisted IDs and exact partial variants, deduplicates additions', () => {
  const saved = { ...key(1), linkedVariantSelections: { hidden: ['500mg|Tablet'] }, productIds: ['product-0', 'hidden'] };
  const body = trialAdditionScope(saved, ['new', 'new'], { hidden: ['forged|changed'], another: ['a|b'] });
  assert.deepEqual(body.linkedProductIds, ['product-0', 'new']);
  assert.deepEqual(body.linkedVariantSelections, { hidden: ['500mg|Tablet'], another: ['a|b'] });
  assert.equal(body.expectedScopeVersion, 0);
});

test('account invalidation refreshes authoritative Overview usage, isolates UID and cleans up', async () => {
  const requests = [], timers = new Map(); let next = 0, source;
  const refresh = createQuotaRefresh({ read: signal => new Promise(resolve => requests.push({ signal, resolve })),
    onState: value => { source = value; }, schedule: callback => { timers.set(++next, callback); return next; }, cancel: id => timers.delete(id) });
  let other = 0;
  const unsubscribe = subscribeAccountUsage('fixture', () => refresh.refresh());
  const unsubscribeOther = subscribeAccountUsage('other', () => other++);
  refresh.start(); await flush(); requests[0].resolve({ keys: [{}], usage: {}, trialCatalog: catalog(45) }); await flush();
  assert.equal(source.trialCatalog.productsIncluded, 45);
  invalidateAccountUsage('fixture'); await flush();
  assert.equal(requests.length, 2); assert.equal(other, 0);
  requests[1].resolve({ keys: [{}], usage: {}, trialCatalog: catalog(48) }); await flush();
  assert.equal(source.trialCatalog.productsIncluded, 48);
  assert.equal(source.trialCatalog.productsAvailable, 2);
  unsubscribe(); unsubscribeOther(); refresh.stop(); invalidateAccountUsage('fixture');
  assert.equal(requests.length, 2); assert.equal(timers.size, 0);
});

test('manual usage refresh cancels stale reads; late responses and unmounted subscriptions cannot overwrite newer counts', async () => {
  const requests = []; let source;
  const refresh = createQuotaRefresh({ read: signal => new Promise(resolve => requests.push({ signal, resolve })),
    onState: value => { source = value; } });
  refresh.start(); await flush(); refresh.refresh(); await flush();
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve({ keys: [{}], usage: {}, trialCatalog: catalog(48) }); await flush();
  requests[0].resolve({ keys: [{}], usage: {}, trialCatalog: catalog(45) }); await flush();
  assert.equal(source.trialCatalog.productsIncluded, 48);
  refresh.stop(); refresh.refresh(); assert.equal(requests.length, 2);
});

test('Customer wiring uses server trialCatalog for Products/Overview, locks cards/chips, and exposes add/clear-pending semantics', () => {
  const products = read('dashboard/src/app/dashboard/products/page.tsx');
  const overview = read('dashboard/src/components/reports/CustomerUsageSummary.tsx');
  assert.match(products, /Products: \{trialCatalog.productsIncluded\}/);
  assert.match(products, /Active API keys: \{trialCatalog.activeKeys\}/);
  assert.match(overview, /trial.productsIncluded/);
  assert.match(products, /trialState.included.has\(productId\)/);
  assert.match(products, /disabled=\{selectionDisabled\}/);
  assert.match(products, />Included<\/span>/);
  assert.match(products, /selected to add/);
  assert.match(products, /Add Selected Products/);
  assert.doesNotMatch(products, /Save Trial Catalog|saveTrialCatalog|trialCatalogChangeAllowed/);
  assert.match(products, /Clear New Selections/);
  assert.match(products, /Select products to link to your first API key, then generate the key/);
  assert.doesNotMatch(products, /Create your API key before adding products/);
  assert.match(products, /receiveTrialCatalog\(await apiKeyRequest\(user\), user.uid\)/);
  assert.match(products, /invalidateAccountUsage\(user.uid\)/);
  assert.match(overview, /subscribeAccountUsage\(user.uid, \(\) => refresh.refresh\(\)\)/);
  assert.match(products, /<AddProductModal/); // Existing submission workflow remains separate.
});

async function fixture(initial = ids(3), paidPlan = null, extras = {}) {
  const db = memoryFirestore({ 'users/owner': { role: 'Developer', plan: paidPlan ?? 'Free', businessSegment: 'Grocery', selectedSegment: 'Grocery',
    ...(paidPlan ? { subscription_status: 'active', subscriptionExpiresAt: '2026-10-25T00:00:00Z', apiRequestLimit: paidPlan === 'Pro Max' ? null : 500 } : {}) },
    'api_keys/key-a': { userId: 'owner', status: 'active', linkedProductIds: initial, scopeVersion: 0 },
    ...Object.fromEntries(ids(60).map(id => [`products/${id}`, { name: id, segment: 'Grocery' }])), ...extras });
  const options = { getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }), clock: () => new Date('2026-10-05T00:00:00Z') };
  if (!paidPlan) await invoke(createFreeTrialHandlers({ ...options, revokeRefreshTokens: async () => {} }).session);
  const handlers = createApiKeyHandlers(options);
  return { db, handlers, update: (requested, version = 0, id = 'key-a') => invoke(handlers.products, { id,
    body: { linkedProductIds: requested, expectedScopeVersion: version } }) };
}

for (const [label, requested, allowed] of [['addition', ids(4), true], ['removal', ids(2), false],
  ['replacement', ['product-0', 'product-2', 'product-3'], false], ['no-op', ids(3), true]])
  test(`transactional Trial ${label}: exact persisted subset rule`, async () => {
    const f = await fixture(); const before = f.db.read('api_keys/key-a');
    const result = await f.update(requested);
    assert.equal(result.statusCode, allowed ? 200 : 400);
    if (!allowed) {
      assert.equal(result.body.error, 'TRIAL_PRODUCT_REMOVAL_NOT_ALLOWED');
      assert.deepEqual(f.db.read('api_keys/key-a'), before);
    } else assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, requested);
  });

test('49+1 succeeds, 50+1 rejects and duplicates cannot inflate counts', async () => {
  const f = await fixture(ids(49));
  assert.equal((await f.update([...ids(50), 'product-49'])).statusCode, 200);
  assert.equal((await invoke(f.handlers.list)).body.trialCatalog.productsIncluded, 50);
  assert.equal((await f.update(ids(51), 1)).body.error, 'TRIAL_PRODUCT_MAXIMUM');
  assert.equal((await f.update([...ids(50), 'product-0'], 1)).statusCode, 200);
  assert.equal((await invoke(f.handlers.list)).body.trialCatalog.productsIncluded, 50);
});

test('45+3: persisted summary/key refresh to 48; no active key rejects additions', async () => {
  const f = await fixture(ids(45));
  const before = (await invoke(f.handlers.list)).body;
  assert.equal(before.trialCatalog.productsIncluded, 45); assert.equal(before.trialCatalog.productsAvailable, 5);
  assert.equal(before.trialCatalog.activeKeys, 1);
  assert.equal((await f.update(ids(48))).statusCode, 200);
  const after = (await invoke(f.handlers.list)).body;
  assert.equal(after.trialCatalog.productsIncluded, 48); assert.equal(after.trialCatalog.productsAvailable, 2);
  assert.equal(after.keys[0].linkedProductIds.length, 48);
  await invoke(f.handlers.revoke);
  assert.equal((await f.update(ids(49), 1)).statusCode, 401);
  const missing = await fixture([], null, { 'api_keys/key-a': null });
  assert.equal((await missing.update(ids(1))).statusCode, 404);
});

test('legacy over-cap preserves reads and idempotent scope, forbids removals/additions without deleting data', async () => {
  const f = await fixture(ids(51)); const before = f.db.read('api_keys/key-a');
  assert.equal((await invoke(f.handlers.list)).body.trialCatalog.productsIncluded, 51);
  assert.deepEqual(f.db.read('api_keys/key-a'), before);
  assert.equal((await f.update(ids(51))).statusCode, 200);
  assert.equal((await f.update(ids(50), 1)).body.error, 'TRIAL_PRODUCT_REMOVAL_NOT_ALLOWED');
  assert.equal((await f.update(ids(52), 1)).body.error, 'TRIAL_PRODUCT_MAXIMUM');
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, ids(51));
});

test('multiple active keys cannot multiply capacity or permit scope updates', async () => {
  const f = await fixture(ids(45), null, { 'api_keys/key-b': { userId: 'owner', status: 'active', linkedProductIds: ids(3) } });
  assert.equal((await f.update(ids(48))).body.error, 'TRIAL_KEY_LIMIT');
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, ids(45));
});

for (const plan of ['Pro', 'Pro Max']) test(`${plan} preserves existing removal and replacement semantics`, async () => {
  const f = await fixture(ids(3), plan);
  assert.equal((await f.update(ids(2))).statusCode, 200);
  assert.equal((await f.update(['product-0', 'product-3'], 1)).statusCode, 200);
  assert.deepEqual(f.db.read('api_keys/key-a').linkedProductIds, ['product-0', 'product-3']);
});
