import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { processTrialWarning, warningEligible, warningId } from '../../../functions/trial-warning.mjs';
import { sendResendTrialEmail } from '../../../functions/trial-warning-email.mjs';
import { canonicalLinkedProductIds, linkedProductLabels } from '../../../admin-panel/src/lib/linked-product-names.ts';
import { selectedLinkedProducts } from '../../../dashboard/src/lib/linked-product-selection.ts';
import { memoryFirestore } from '../phase2a/memory-firestore.mjs';
import { evaluateEntitlement } from '../../../functions/subscription-lifecycle.mjs';

const startedAt = '2026-09-23T12:00:00.000Z', expiresAt = '2026-09-30T12:00:00.000Z';
const threshold = '2026-09-27T12:00:00.000Z';
const base = { role: 'Developer', email: 'customer@example.test', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware',
  hasUsedFreeTrial: true, trialVersion: 1, trialStartedAt: startedAt, trialExpiresAt: expiresAt };
const usage = { startedAt, expiresAt, used: 4 };
function fixture(account = {}, counter = {}) {
  let time = threshold, sends = 0;
  const db = memoryFirestore({ 'users/owner': { ...base, ...account }, 'account_trial_usage/owner': { ...usage, ...counter },
    'api_keys/key-a': { userId: 'owner', status: 'active' } });
  const run = () => processTrialWarning(db, 'owner', { now: () => new Date(time), from: 'trial@example.test',
    sendEmail: async () => { sends++; return 'email-accepted'; } });
  return { db, run, time: value => { time = value; }, sends: () => sends };
}

test('Day-4 boundary is exact UTC elapsed time, not a local calendar date', () => {
  assert.equal(warningEligible(base, usage, new Date('2026-09-27T11:59:59.999Z')), false);
  assert.equal(warningEligible(base, usage, new Date(threshold)), true);
  assert.equal(warningEligible(base, usage, new Date('2026-09-27T20:00:00+08:00')), true);
});
test('before threshold no write; at threshold sends and records exactly once', async () => {
  const f = fixture(); f.time('2026-09-27T11:59:59.000Z'); assert.equal(await f.run(), false);
  assert.equal(f.db.read(`trial_warning_deliveries/${warningId('owner', startedAt)}`), undefined);
  f.time(threshold); assert.equal(await f.run(), true); assert.equal(f.sends(), 1);
  const delivery = f.db.read(`trial_warning_deliveries/${warningId('owner', startedAt)}`);
  assert.equal(delivery.status, 'accepted'); assert.equal(delivery.providerId, 'email-accepted');
  assert.match(delivery.payload.text, /returns to Free/); assert.match(delivery.payload.text, /not revoked/);
  assert.equal(f.db.read('notifications/trial-day4-' + warningId('owner', startedAt)).userId, 'owner');
  assert.equal(await f.run(), false); assert.equal(f.sends(), 1);
  assert.equal(f.db.read('api_keys/key-a').status, 'active');
});
test('concurrent scheduler claims send only once', async () => {
  const f = fixture(); const result = await Promise.all([f.run(), f.run(), f.run()]);
  assert.deepEqual(result.filter(Boolean).length, 1); assert.equal(f.sends(), 1);
});
test('provider failure does not mark sent; retry uses same frozen payload and key', async () => {
  const f = fixture(), sent = [];
  const call = sendEmail => processTrialWarning(f.db, 'owner', { now: () => new Date(threshold), from: 'trial@example.test', sendEmail });
  await assert.rejects(call(async (payload, key) => { sent.push([payload, key]); throw new Error('network'); }));
  assert.equal(f.db.read(`trial_warning_deliveries/${warningId('owner', startedAt)}`).status, 'sending');
  const later = new Date(Date.parse(threshold) + 8 * 60 * 1000);
  assert.equal(await processTrialWarning(f.db, 'owner', { now: () => later, from: 'changed@example.test',
    sendEmail: async (payload, key) => { sent.push([payload, key]); return 'email-accepted'; } }), true);
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(f.db.read(`trial_warning_deliveries/${warningId('owner', startedAt)}`).status, 'accepted');
});
test('uncertain send past provider dedupe window requires review, never a duplicate', async () => {
  const f = fixture(); await assert.rejects(processTrialWarning(f.db, 'owner', { now: () => new Date(threshold), from: 'trial@example.test',
    sendEmail: async () => { throw new Error('unknown'); } }));
  f.time('2026-09-28T12:00:00.000Z'); assert.equal(await f.run(), false); assert.equal(f.sends(), 0);
  assert.equal(f.db.read(`trial_warning_deliveries/${warningId('owner', startedAt)}`).status, 'needs_review');
});
test('provider adapter sends a fixed idempotent request without a live network call', async () => {
  const requests = [], payload = { from: 'trial@example.test', to: ['customer@example.test'], subject: 'Trial', text: 'Trial ends soon.' };
  const id = await sendResendTrialEmail(payload, 'trial-day4/synthetic-id', 're_synthetic', async (url, options) => {
    requests.push({ url, options }); return { ok: true, json: async () => ({ id: 'accepted-id' }) };
  });
  assert.equal(id, 'accepted-id'); assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.resend.com/emails');
  assert.equal(requests[0].options.headers['Idempotency-Key'], 'trial-day4/synthetic-id');
  assert.deepEqual(JSON.parse(requests[0].options.body), payload);
  assert.doesNotMatch(requests[0].options.body, /re_synthetic/u);
  await assert.rejects(sendResendTrialEmail(payload, 'trial-day4/synthetic-id', 're_synthetic',
    async () => ({ ok: false, status: 503 })), /HTTP 503/u);
});
test('paid upgrade between claim and send suppresses obsolete warning', async () => {
  const f = fixture(), collection = f.db.collection.bind(f.db);
  f.db.collection = name => {
    const result = collection(name);
    if (name !== 'users') return result;
    return { ...result, doc: id => {
      const ref = result.doc(id);
      return { ...ref, get: async () => {
        await ref.update({ plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: '2026-10-15T00:00:00.000Z' });
        return ref.get();
      } };
    } };
  };
  assert.equal(await f.run(), false); assert.equal(f.sends(), 0);
  assert.equal(f.db.read(`trial_warning_deliveries/${warningId('owner', startedAt)}`).status, 'superseded');
});
for (const [label, account, counter, time] of [
  ['expired', {}, {}, expiresAt], ['exhausted counter', {}, { used: 500 }, threshold],
  ['exhaustion marker', { trialExhaustedAt: '2026-09-26T12:00:00.000Z' }, {}, threshold],
  ['paid Pro', { plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: '2026-10-15T00:00:00.000Z' }, {}, threshold],
  ['disabled', { disabled: true }, {}, threshold], ['no email', { email: '' }, {}, threshold],
]) test(`warning suppresses ${label}`, async () => {
  const f = fixture(account, counter); f.time(time); assert.equal(await f.run(), false); assert.equal(f.sends(), 0);
});
test('API Trial authority is independent of watcher and never revokes keys', () => {
  assert.equal(evaluateEntitlement(base, new Date(threshold)).activeTrial, true);
  assert.equal(evaluateEntitlement(base, new Date(expiresAt)).plan, 'Free');
  assert.equal(fixture().db.read('api_keys/key-a').status, 'active');
});
test('linked names come only from canonical persisted IDs and authoritative product documents', () => {
  const key = { linkedProductIds: ['hammer'], linkedVariantSelections: { nails: ['size:2'] },
    linkedProducts: [{ id: 'saw', name: 'Forged browser label' }, { id: 'hammer', name: 'Wrong' }] };
  const ids = canonicalLinkedProductIds(key);
  assert.deepEqual(ids, ['hammer', 'saw', 'nails']);
  assert.deepEqual(linkedProductLabels(ids, { hammer: 'Claw Hammer', saw: 'Hand Saw', nails: 'Steel Nails' }),
    ['Claw Hammer', 'Hand Saw', 'Steel Nails']);
  assert.deepEqual(canonicalLinkedProductIds({}), []);
  assert.deepEqual(linkedProductLabels(['missing'], {}), ['Product unavailable']);
  assert.deepEqual(linkedProductLabels(['__proto__'], {}), ['Product unavailable']);
});
test('Customer key modal selection displays actual names and preserves Free/Trial segment scope', () => {
  const catalog = [
    { id: 'hammer', name: 'Ball Peen Hammer', segment: 'Hardware' },
    { id: 'wrench', name: 'Adjustable Wrench', segment: 'Hardware' },
    { id: 'milk', name: 'Fresh Milk', segment: 'Grocery' },
    { id: 'medicine', name: 'Medicine', segment: 'Pharmacy' },
  ];
  const ids = new Set(catalog.map(product => product.id));
  const hardwareTrial = selectedLinkedProducts(catalog, { plan: 'Pro Trial', businessSegment: 'Hardware' }, ids);
  assert.deepEqual(hardwareTrial.map(({ id, name }) => [id, name]), [
    ['hammer', 'Ball Peen Hammer'], ['wrench', 'Adjustable Wrench'],
  ]);
  assert.deepEqual(selectedLinkedProducts(catalog, { plan: 'Free', businessSegment: 'Hardware' }, new Set(['hammer']))
    .map(product => product.name), ['Ball Peen Hammer']);
  assert.deepEqual(selectedLinkedProducts(catalog, { plan: 'Free', businessSegment: 'Hardware' }, new Set()), []);
  const page = readFileSync(new URL('../../../dashboard/src/app/dashboard/products/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /LINKED PRODUCTS[\s\S]*?cartSummary\.linkedProducts\.map\(product => <li key=\{product\.id\}[^>]*>\{product\.name\}<\/li>\)/u);
  assert.match(page, /selectedProductsList = selectedItems/u);
  assert.match(page, /linkedProductIds: finalLinkedProductIds/u);
  assert.match(page, /linkedVariantSelections: finalLinkedVariantSelections/u);
  assert.doesNotMatch(page, /LINKED PRODUCTS[\s\S]{0,500}\{seg\}: \{cnt\}/u);
});
test('Customer linked-key success modal keeps Key Name, product names and one-time secret separate', () => {
  const page = readFileSync(new URL('../../../dashboard/src/app/dashboard/products/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /setGeneratedKeyName\(typeof data\.name/u);
  assert.match(page, /Key Name<\/p>/u);
  assert.match(page, /API Key — shown once/u);
  assert.match(page, /navigator\.clipboard\.writeText\(generatedKey\)/u);
  assert.match(page, /setGeneratedKey\(null\)/u);
  assert.match(page, /setGeneratedKeyName\(null\)/u);
});
test('Customer API Keys generation modal selects scoped catalog products and submits canonical IDs', () => {
  const page = readFileSync(new URL('../../../dashboard/src/app/dashboard/api-keys/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /getAllProducts/u);
  assert.match(page, /scopeCustomerProducts\(products, account\)/u);
  assert.match(page, /LINKED PRODUCTS/u);
  assert.match(page, /availableProducts\.filter\(product => typeof product\.id === 'string'\)/u);
  assert.match(page, /selectedCustomerProducts\.map\(product => <li key=\{product\.id\}>\{product\.name\}<\/li>\)/u);
  assert.match(page, /linkedProductIds: selectedCustomerProducts\.flatMap\(product => typeof product\.id === 'string'/u);
  assert.match(page, /No eligible products are available\. You can still create an unlinked key\./u);
});
test('Admin linked-product displays resolve Firestore names and Security Center hides only the raw UID subline', () => {
  const component = readFileSync(new URL('../../../admin-panel/src/components/admin/LinkedProducts.tsx', import.meta.url), 'utf8');
  const security = readFileSync(new URL('../../../admin-panel/src/app/security/page.tsx', import.meta.url), 'utf8');
  const inventory = readFileSync(new URL('../../../admin-panel/src/app/consumers/page.tsx', import.meta.url), 'utf8');
  assert.match(component, /getDocs\(query\(collection\(db, "products"\), where\(documentId\(\), "in", batch\)\)\)/u);
  for (const page of [security, inventory]) assert.match(page, /<LinkedProducts link=\{k\}/u);
  assert.doesNotMatch(security, /\{k\.userId\}<\/div>/u);
  assert.match(security, /usersMap\[k\.userId\]/u);
  assert.match(security, /k\.userEmail \|\| user\.email/u);
  assert.match(security, /user\.businessName \|\| user\.fullName/u);
});
test('generated key modal separates persisted name from one-time secret and copies the secret', () => {
  const page = readFileSync(new URL('../../../dashboard/src/app/dashboard/api-keys/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /setGeneratedKeyName\(typeof data\.name/u);
  assert.match(page, /Key Name<\/p>/u);
  assert.match(page, /API Key — shown once/u);
  assert.match(page, /navigator\.clipboard\.writeText\(newlyGeneratedKey\)/u);
  assert.match(page, /setNewlyGeneratedKey\(null\)/u);
  assert.match(page, /setGeneratedKeyName\(null\)/u);
  assert.doesNotMatch(page, /localStorage\.setItem|sessionStorage\.setItem/u);
});
test('scheduled Function is UTC, paged, index-light and not entitlement authority', () => {
  const source = readFileSync(new URL('../../../functions/index.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');
  assert.match(source, /exports\.monitorFreeTrials = onSchedule/u);
  assert.match(source, /schedule: '0 \*\/6 \* \* \*', timeZone: 'UTC', region: 'asia-southeast1'/u);
  assert.match(source, /\.where\('trialExpiresAt', '>', now\.toISOString\(\)\)/u);
  assert.match(source, /\.orderBy\('trialExpiresAt'\)\.limit\(200\)/u);
  assert.match(source, /query = query\.startAfter\(page\.docs\.at\(-1\)\)/u);
  assert.doesNotMatch(source, /setInterval|setTimeout|api_keys.*(?:delete|update)/u);
  assert.doesNotMatch(rules, /match \/trial_warning_deliveries\//u);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/u);
});
