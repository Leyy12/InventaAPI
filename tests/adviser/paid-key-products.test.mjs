import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiKeyHandlers, mergeScope } from '../../services/api-key-management.js';
import { consumeAccountQuota } from '../../services/account-quota.js';
import { memoryStore, invoke } from './phase2a/memory-store.mjs';
import { chargeMonthlyBuckets } from '../../services/paid-monthly-quota.js';

// Pro: products go into one API key in the account's segment.
// Pro Max: each product goes into its segment's key (at most one per segment).
const NOW = new Date('2026-10-20T12:00:00.000Z');
const paid = plan => ({ uid: 'owner', role: 'Developer', plan, apiRequestLimit: plan === 'Pro Max' ? null : 5000,
  subscription_status: 'active', subscriptionStartedAt: '2026-10-01T00:00:00.000Z', subscriptionExpiresAt: '2026-10-31T00:00:00.000Z',
  businessSegment: 'Grocery', selectedSegment: 'Grocery' });
const contracts = plan => ({ version: 1, plans: plan === 'Pro Max'
  ? { pro_max: { version: 1, period: 'utc_daily', limit: null } } : { pro: { version: 1, period: 'utc_daily', limit: 500 } } });
const products = {
  'products/rice': { name: 'Rice', segment: 'Grocery' }, 'products/milk': { name: 'Milk', segment: 'Grocery' },
  'products/aspirin': { name: 'Aspirin', segment: 'Pharmacy' }, 'products/hammer': { name: 'Hammer', segment: 'Hardware' },
};
function setup(plan, extra = {}) {
  const db = memoryStore({ 'users/owner': paid(plan), 'account_request_contracts/owner': contracts(plan), ...products, ...extra });
  const handlers = createApiKeyHandlers({ getDb: () => db, clock: () => new Date(NOW),
    verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (token !== 'owner-token') throw new Error('invalid'); return { uid: 'owner', email: 'owner@example.test' }; } });
  const add = body => invoke(handlers.addProducts, { body });
  const keys = async () => (await db.collection('api_keys').get()).docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { db, handlers, add, keys };
}

test('Pro: the first add creates one key; later adds go into the same key', async () => {
  const f = setup('Pro');
  const first = await f.add({ linkedProductIds: ['rice'] });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.results.length, 1);
  const [created] = first.body.results;
  assert.deepEqual([created.segment, created.created, created.added, created.total], ['Grocery', true, 1, 1]);
  assert.match(created.key, /^daas_v2_[a-f0-9]{32}\.[a-f0-9]{64}$/);
  const second = await f.add({ linkedProductIds: ['milk', 'rice'] });
  assert.equal(second.statusCode, 200);
  assert.deepEqual(second.body.results.map(r => [r.keyId, r.created, r.added, r.total, 'key' in r]), [[created.keyId, false, 1, 2, false]]);
  const stored = await f.keys();
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].linkedProductIds.sort(), ['milk', 'rice']);
  assert.equal(stored[0].segment, 'Grocery');
  assert.equal(stored[0].scopeVersion, 1);
  assert.equal(JSON.stringify(stored).includes(created.key), false, 'the secret is never stored');
});

test('Pro: products outside the account segment are refused and nothing changes', async () => {
  const f = setup('Pro');
  await f.add({ linkedProductIds: ['rice'] });
  const before = await f.keys();
  const refused = await f.add({ linkedProductIds: ['milk', 'aspirin'] });
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.body.error, 'PLAN_SEGMENT_RESTRICTION');
  assert.match(refused.body.message, /Grocery segment only/);
  assert.deepEqual(await f.keys(), before);
});

test('Pro: an older key without a segment receives the products and is tagged', async () => {
  const f = setup('Pro', { 'api_keys/old': { userId: 'owner', status: 'active', key: 'daas_old', name: 'Old key', linkedProductIds: ['milk'] } });
  const result = await f.add({ linkedProductIds: ['rice'] });
  assert.deepEqual(result.body.results.map(r => [r.keyId, r.created, r.total]), [['old', false, 2]]);
  const [key] = await f.keys();
  assert.equal(key.segment, 'Grocery');
  assert.equal(key.key, 'daas_old', 'the existing credential keeps working');
});

test('Pro: generating a second key is refused', async () => {
  const f = setup('Pro');
  await f.add({ linkedProductIds: ['rice'] });
  const generated = await invoke(f.handlers.create, { body: { keyName: 'Another', linkedProductIds: ['milk'] } });
  assert.equal(generated.statusCode, 409);
  assert.equal(generated.body.error, 'PRO_SINGLE_KEY');
  assert.equal((await f.keys()).length, 1);
});

test('Pro Max: one add puts products from every segment into ONE key and returns its secret once', async () => {
  const f = setup('Pro Max');
  const result = await f.add({ linkedProductIds: ['rice', 'aspirin', 'hammer', 'milk'] });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.results.length, 1);
  const [created] = result.body.results;
  assert.deepEqual([created.segment, created.created, created.total, created.name], [null, true, 4, 'Pro Max API key']);
  assert.match(created.key, /^daas_v2_/);
  const [stored] = await f.keys();
  assert.equal((await f.keys()).length, 1);
  assert.equal(stored.segment, undefined, 'the one key is not tied to a segment');
  // Adding more reuses the same key and creates nothing new.
  const more = await f.add({ linkedProductIds: ['milk'], linkedVariantSelections: { aspirin: ['500mg'] } });
  assert.deepEqual(more.body.results.map(r => [r.keyId, r.created, 'key' in r]), [[created.keyId, false, false]]);
  assert.equal((await f.keys()).length, 1);
});

test('Pro Max: Generate allows mixed segments once and refuses a second key', async () => {
  const f = setup('Pro Max');
  const mixed = await invoke(f.handlers.create, { body: { keyName: 'All stores', linkedProductIds: ['rice', 'aspirin', 'hammer'] } });
  assert.equal(mixed.statusCode, 200);
  assert.equal((await f.keys())[0].segment, undefined);
  // A second key is refused by the one-key rule (checked on an account whose key came from Add products).
  const g = setup('Pro Max');
  await g.add({ linkedProductIds: ['rice'] });
  const again = await invoke(g.handlers.create, { body: { keyName: 'Second', linkedProductIds: ['milk'] } });
  assert.equal(again.statusCode, 409); assert.equal(again.body.error, 'PRO_MAX_SINGLE_KEY');
  assert.equal((await g.keys()).length, 1);
});

test('Pro Max: an account with older per-segment keys adds into one of them, not a new key', async () => {
  const f = setup('Pro Max', {
    'api_keys/g': { userId: 'owner', status: 'active', key: 'daas_g', name: 'Grocery API key', segment: 'Grocery', linkedProductIds: ['rice'], createdAt: '2026-10-01T00:00:00.000Z' },
    'api_keys/p': { userId: 'owner', status: 'active', key: 'daas_p', name: 'Pharmacy API key', segment: 'Pharmacy', linkedProductIds: ['aspirin'], createdAt: '2026-10-02T00:00:00.000Z' },
  });
  const result = await f.add({ linkedProductIds: ['hammer'] });
  assert.deepEqual(result.body.results.map(r => [r.keyId, r.created, r.total]), [['g', false, 2]]);
  assert.equal((await f.keys()).length, 2);
});

test('Pro Max: the one key draws from each product segment\'s own 15,000 monthly allowance', async () => {
  const f = setup('Pro Max');
  const [created] = (await f.add({ linkedProductIds: ['rice', 'aspirin'] })).body.results;
  f.db.collection('account_paid_monthly_usage').doc('owner_2026-10_Grocery').set({ window: '2026-10', used: 15000 });
  const consume = () => consumeAccountQuota(f.db, { keyId: created.keyId, userId: 'owner', credential: created.key, clock: () => new Date(NOW) });
  // Grocery is used up but Pharmacy is not, so the call is still admitted.
  const ok = await consume();
  assert.deepEqual(ok.usage.buckets.map(b => [b.bucket, b.used]), [['Grocery', 15000], ['Pharmacy', 0], ['Hardware', 0]]);
  const charged = await chargeMonthlyBuckets(f.db, { ...ok.productCharge, requested: { Grocery: 2, Pharmacy: 3 }, clock: () => new Date(NOW) });
  assert.deepEqual(charged.granted, { Grocery: 0, Pharmacy: 3 });
  const listed = (await invoke(f.handlers.list)).body;
  assert.deepEqual(listed.monthlyUsage.buckets.map(b => [b.bucket, b.used]), [['Grocery', 15000], ['Pharmacy', 3], ['Hardware', 0]]);
  for (const segment of ['Pharmacy', 'Hardware']) {
    f.db.collection('account_paid_monthly_usage').doc(`owner_2026-10_${segment}`).set({ window: '2026-10', used: 15000 });
  }
  await assert.rejects(consume(), error => error.status === 429 && /every segment/.test(error.message));
});

test('Pro Max: the one key may hold up to 1,500 products', async () => {
  const many = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`products/g${i}`, { name: `G${i}`, segment: 'Grocery' }]));
  const ids = Object.keys(many).map(path => path.split('/')[1]);
  const max = setup('Pro Max', many);
  assert.equal((await max.add({ linkedProductIds: ids.slice(0, 400) })).statusCode, 200);
  const grown = await max.add({ linkedProductIds: ids.slice(400) });
  assert.equal(grown.statusCode, 200);
  assert.equal(grown.body.results[0].total, 501);
  const pro = setup('Pro', many);
  assert.equal((await pro.add({ linkedProductIds: ids.slice(0, 400) })).statusCode, 200);
  const over = await pro.add({ linkedProductIds: ids.slice(400) });
  assert.equal(over.statusCode, 400); assert.equal(over.body.error, 'KEY_PRODUCT_LIMIT');
});

test('Free Trial and inactive accounts cannot use Add products', async () => {
  const f = setup('Pro', { 'users/owner': { ...paid('Pro'), subscriptionExpiresAt: '2026-10-01T00:00:00.000Z' } });
  const result = await f.add({ linkedProductIds: ['rice'] });
  assert.equal(result.statusCode, 403);
  assert.equal((await f.keys()).length, 0);
});

test('mergeScope keeps existing products, upgrades partial selections and combines variants', () => {
  const merged = mergeScope({ linkedProductIds: ['a'], linkedVariantSelections: { b: ['x'], c: ['y'] } }, ['b'], { c: ['z'], d: ['w'] });
  assert.deepEqual(merged.linkedProductIds.sort(), ['a', 'b']);
  assert.deepEqual(merged.linkedVariantSelections, { c: ['y', 'z'], d: ['w'] });
});
