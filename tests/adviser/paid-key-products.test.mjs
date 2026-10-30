import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiKeyHandlers, mergeScope } from '../../services/api-key-management.js';
import { consumeAccountQuota } from '../../services/account-quota.js';
import { memoryStore, invoke } from './phase2a/memory-store.mjs';
import { chargeMonthlyProducts } from '../../services/paid-monthly-quota.js';

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

test('Pro Max: one add sorts products into one key per segment and returns each new secret once', async () => {
  const f = setup('Pro Max');
  const result = await f.add({ linkedProductIds: ['rice', 'aspirin', 'hammer', 'milk'] });
  assert.equal(result.statusCode, 200);
  const bySegment = Object.fromEntries(result.body.results.map(r => [r.segment, r]));
  assert.deepEqual(Object.keys(bySegment).sort(), ['Grocery', 'Hardware', 'Pharmacy']);
  assert.equal(bySegment.Grocery.total, 2);
  assert.ok(result.body.results.every(r => r.created && /^daas_v2_/.test(r.key)));
  const stored = await f.keys();
  assert.equal(stored.length, 3);
  for (const key of stored) assert.equal(key.name, `${key.segment} API key`);
  // Adding more reuses the matching segment key and creates nothing new.
  const more = await f.add({ linkedProductIds: ['milk'], linkedVariantSelections: { aspirin: ['500mg'] } });
  assert.deepEqual(more.body.results.map(r => [r.segment, r.created]).sort(), [['Grocery', false], ['Pharmacy', false]]);
  assert.equal((await f.keys()).length, 3);
});

test('Pro Max: Generate refuses a second key for a segment and keys that mix segments', async () => {
  const f = setup('Pro Max');
  const mixed = await invoke(f.handlers.create, { body: { keyName: 'Mixed', linkedProductIds: ['rice', 'aspirin'] } });
  assert.equal(mixed.statusCode, 400); assert.equal(mixed.body.error, 'SEGMENT_KEY_SCOPE');
  await f.add({ linkedProductIds: ['rice'] });
  const again = await invoke(f.handlers.create, { body: { keyName: 'Grocery 2', linkedProductIds: ['milk'] } });
  assert.equal(again.statusCode, 409); assert.equal(again.body.error, 'SEGMENT_KEY_EXISTS');
});

test('Pro Max: each segment key draws from its own 15,000 monthly allowance', async () => {
  const f = setup('Pro Max');
  const { results } = (await f.add({ linkedProductIds: ['rice', 'aspirin'] })).body;
  const grocery = results.find(r => r.segment === 'Grocery'), pharmacy = results.find(r => r.segment === 'Pharmacy');
  f.db.collection('account_paid_monthly_usage').doc('owner_2026-10_Grocery').set({ window: '2026-10', used: 15000 });
  const consume = r => consumeAccountQuota(f.db, { keyId: r.keyId, userId: 'owner', credential: r.key, clock: () => new Date(NOW) });
  await assert.rejects(consume(grocery), error => error.status === 429 && /Grocery segment/.test(error.message));
  const ok = await consume(pharmacy);
  // Admission alone uses nothing: products are charged when they are delivered.
  assert.deepEqual([ok.usage.bucket, ok.usage.used, ok.usage.remaining, ok.usage.unit], ['Pharmacy', 0, 15000, 'products']);
  const charged = await chargeMonthlyProducts(f.db, { ...ok.productCharge, requested: 1, clock: () => new Date(NOW) });
  assert.deepEqual([charged.granted, charged.usage.used], [1, 1]);
  const listed = (await invoke(f.handlers.list)).body;
  assert.deepEqual(listed.monthlyUsage.buckets.map(b => [b.bucket, b.used]), [['Grocery', 15000], ['Pharmacy', 1], ['Hardware', 0]]);
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
