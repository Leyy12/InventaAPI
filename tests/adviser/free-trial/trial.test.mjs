import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFreeTrialHandlers } from '../../../services/free-trial.js';
import { evaluateEntitlement, renewalPeriod } from '../../../functions/subscription-lifecycle.mjs';
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { createDaaSSecurity, requirePlan } from '../../../services/daas-security.js';
import { activeCustomerSegment, loginSegmentAllowed, scopeCustomerProducts } from '../../../services/customer-segment.js';
import { createProductSubmissionHandlers } from '../../../services/product-submissions.js';
import { quotaSummary } from '../../../services/reporting.js';
import { freeMonthlyUsage } from '../../../services/api-key-security.js';
import { createEntitlementPoller } from '../../../dashboard/src/lib/entitlement-poller.ts';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';
import { memoryFirestore as catalogDb, invoke as submissionInvoke } from '../r2a/memory-firestore.mjs';

const START = '2026-09-23T12:00:00.000Z', END = '2026-09-30T12:00:00.000Z';
const owner = { role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware', selectedSegment: 'Grocery' };
const key = { userId: 'owner', key: 'daas_trial_a', status: 'active', linkedProductIds: [] };
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
function fixture(account = {}, extra = {}, metadata = {}) {
  let at = START;
  const clock = () => new Date(at);
  const db = memoryFirestore({ 'users/owner': { ...owner, ...account }, 'api_keys/key-a': key,
    'api_keys/key-b': { ...key, key: 'daas_trial_b' },
    'account_api_usage/owner': { window: '2026-09-23', used: 2 },
    'account_free_monthly_usage/owner': { window: '2026-09', used: 2 },
    'products/tool': { name: 'Tool', segment: 'Hardware' }, 'products/food': { name: 'Food', segment: 'Grocery' }, ...extra }, metadata);
  const verifyIdToken = async (token, revoked) => { assert.equal(revoked, true);
    if (token !== 'owner-token') throw new Error('Invalid'); return { uid: 'owner' }; };
  const handlers = createFreeTrialHandlers({ getDb: () => db, verifyIdToken, clock });
  const keys = createApiKeyHandlers({ getDb: () => db, verifyIdToken, clock });
  const consume = (b = false, more = {}) => consumeAccountQuota(db, { keyId: b ? 'key-b' : 'key-a',
    userId: 'owner', credential: b ? 'daas_trial_b' : key.key, clock, ...more });
  return { db, clock, handlers, keys, consume, time: value => { at = value; },
    activate: options => invoke(handlers.activate, options), status: () => invoke(handlers.status) };
}
test('isolated suite blocks SDK, HTTP and production bootstrap', async () => {
  for (const specifier of ['firebase-admin', 'node:https', '../../../database/firebase.js']) await assert.rejects(import(specifier));
  assert.throws(() => globalThis['fetch']('https://example.invalid'));
});
for (const segment of ['Grocery', 'Pharmacy', 'Hardware']) test('Free/Trial ownership ' + segment + ' ignores forged context', () => {
  for (const plan of ['Free', 'Starter', 'Pro Trial', 'Unavailable']) {
    const account = { plan, businessSegment: segment, selectedSegment: 'Grocery' };
    assert.equal(activeCustomerSegment(account), segment); assert.equal(loginSegmentAllowed(account, segment), true);
    for (const other of ['Grocery', 'Pharmacy', 'Hardware'].filter(value => value !== segment)) assert.equal(loginSegmentAllowed(account, other), false);
    const all = ['Grocery', 'Pharmacy', 'Hardware'].map(value => ({ segment: value }));
    assert.deepEqual(scopeCustomerProducts(all, account), [{ segment }]);
  }
});
for (const invalid of ['', null, undefined, 'groceries', 'hardware', 'Clothing', '//evil.example'])
  test('Login rejects noncanonical ' + String(invalid), () => assert.equal(loginSegmentAllowed(owner, invalid), false));
test('paid segment choice preserved; missing profile/ownership renders no products', () => {
  assert.equal(loginSegmentAllowed({ ...owner, plan: 'Pro' }, 'Grocery'), true);
  for (const account of [null, { plan: 'Free', selectedSegment: 'Grocery' }]) assert.deepEqual(scopeCustomerProducts([{ segment: 'Grocery' }], account), []);
});
for (const token of [null, 'invalid']) test('activation rejects identity ' + token, async () => {
  const f = fixture(); assert.equal((await f.activate({ token })).statusCode, 401);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
});
for (const account of [{ plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: END },
  { plan: 'Enterprise', apiRequestLimit: null }, { disabled: true }, { deleted: true }, { deletionRequested: true },
  { accountState: 'deleting' }, { role: 'Admin' }, { role: 'Unknown' }, { businessSegment: null }])
  test('activation fails closed ' + JSON.stringify(account), async () => {
    const f = fixture(account); assert.equal((await f.activate()).statusCode, 403);
    assert.equal(f.db.read('account_trial_usage/owner'), undefined);
  });
test('eligible Free activates once with server UTC dates, preserving ownership and daily balance', async () => {
  const f = fixture(); assert.equal((await f.status()).body.eligible, true);
  const result = await f.activate(); assert.equal(result.statusCode, 200);
  assert.equal(result.body.startedAt, START); assert.equal(result.body.expiresAt, END);
  const account = f.db.read('users/owner');
  assert.equal(account.hasUsedFreeTrial, true); assert.equal(account.plan, 'Free');
  assert.equal(account.selectedSegment, 'Hardware'); assert.equal(account.businessSegment, 'Hardware');
  assert.equal(evaluateEntitlement(account, f.clock()).plan, 'Pro Trial');
  assert.equal((await f.status()).body.status, 'active'); assert.equal((await f.activate()).statusCode, 409);
  assert.deepEqual(f.db.read('account_api_usage/owner'), { window: '2026-09-23', used: 2 });
});
test('concurrent activation grants exactly once', async () => {
  const f = fixture(), attempts = await Promise.all(Array.from({ length: 10 }, () => f.activate()));
  assert.equal(attempts.filter(result => result.statusCode === 200).length, 1);
  assert.equal(attempts.filter(result => result.statusCode === 409).length, 9);
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
});
for (const options of [{ body: { uid: 'another' } }, { body: { duration: 1000 } }, { body: { plan: 'Pro' } },
  { body: { hasUsedFreeTrial: false } }, { query: { segment: 'Grocery' } }])
  test('activation rejects client terms ' + JSON.stringify(options), async () => assert.equal((await fixture().activate(options)).statusCode, 400));
test('legacy/ambiguous markers cannot grant another trial', async () => {
  for (const value of [true, false, 'false']) assert.equal((await fixture({ hasUsedFreeTrial: value }).activate()).statusCode, 409);
});
test('requests 1-500 share Trial usage; request 501 resumes the unchanged Free monthly balance', async () => {
  const f = fixture(); await f.activate();
  for (let i = 1; i <= 500; i++) assert.equal((await f.consume(i % 2 === 0)).usage.used, i);
  const next = await f.consume(); assert.equal(next.account.plan, 'Free'); assert.equal(next.usage.used, 3);
  assert.equal((await f.consume(true)).usage.used, 4);
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await f.consume()).usage.used, 5);
  assert.equal(f.db.read('account_trial_usage/owner').used, 500);
  assert.equal(f.db.read('account_api_usage/owner').used, 2);
  const status = (await f.status()).body; assert.equal(status.exhausted, true); assert.equal(status.active, false);
  assert.equal(evaluateEntitlement(f.db.read('users/owner'), f.clock()).plan, 'Free');
});
test('concurrent final-unit requests cannot overrun 500', async () => {
  const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').update({ used: 499 });
  const results = await Promise.allSettled([f.consume(), f.consume(true), f.consume()]);
  assert.equal(results.filter(result => result.status === 'fulfilled' && result.value.account.plan === 'Pro Trial').length, 1);
  assert.equal(results.filter(result => result.status === 'fulfilled' && result.value.account.plan === 'Free').length, 2);
  assert.equal(f.db.read('account_trial_usage/owner').used, 500);
});
test('UTC midnight, new session/device and key revocation never reset/refund trial', async () => {
  const f = fixture(); await f.activate(); await f.consume();
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await f.consume(true)).usage.used, 2);
  assert.equal((await invoke(f.keys.revoke)).statusCode, 200);
  assert.equal((await f.status()).body.used, 2); assert.equal((await f.activate()).statusCode, 409);
  await assert.rejects(f.consume(), { status: 401 });
});
test('daily key-generation marker survives activation; later keys share quota and owned segment', async () => {
  const f = fixture(), options = { body: { keyName: 'Synthetic', linkedProductIds: ['tool'] } };
  assert.equal((await invoke(f.keys.create, options)).statusCode, 200); await f.activate(); await f.consume();
  assert.equal((await invoke(f.keys.create, options)).statusCode, 409);
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await invoke(f.keys.create, options)).statusCode, 200);
  assert.equal(f.db.read('account_trial_usage/owner').used, 1);
  assert.equal((await invoke(f.keys.create, { body: { keyName: 'Tamper', linkedProductIds: ['food'] } })).statusCode, 403);
});
test('activation preserves legacy clean-window hold', async () => {
  const f = fixture({}, { 'account_api_usage/owner': null }); await f.activate();
  await assert.rejects(f.consume(), { code: 'QUOTA_CUTOVER_PENDING' });
  assert.equal(f.db.read('account_trial_usage/owner').used, 0);
  assert.equal((await invoke(f.keys.list)).body.usage.holdUntil, '2026-09-24T00:00:00.000Z');
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await f.consume()).usage.used, 1);
});
test('malformed counters fail closed without replacement', async () => {
  for (const used of [-1, 501, '0', null]) {
    const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').update({ used });
    await assert.rejects(f.consume(), { status: 503 }); assert.equal((await f.status()).statusCode, 503);
  }
});
test('missing trial counter cannot be regenerated by consumption, status or activation', async () => {
  const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').delete();
  await assert.rejects(f.consume(), { status: 503 });
  assert.equal((await f.status()).statusCode, 503); assert.equal((await f.activate()).statusCode, 409);
});
test('failed activation commit leaves neither lifetime flag nor trial balance', async () => {
  const f = fixture(); f.db.failCommit = true; assert.equal((await f.activate()).statusCode, 503);
  assert.equal(f.db.read('users/owner').hasUsedFreeTrial, undefined);
  assert.equal(f.db.read('account_trial_usage/owner'), undefined);
});
test('seven UTC calendar days are deterministic over month/leap/DST boundaries', async () => {
  for (const start of ['2028-02-25T23:30:00.000Z', '2026-03-07T10:00:00.000Z', '2026-12-29T00:00:00.000Z']) {
    const f = fixture(); f.time(start); const result = await f.activate();
    assert.equal(result.statusCode, 200); assert.equal(Date.parse(result.body.expiresAt) - Date.parse(start), 7 * 86400000);
  }
});
test('Trial passes real Pro endpoint middleware while Free/expired Trial cannot; ownership unchanged', async () => {
  const f = fixture(); await assert.rejects(f.consume(false, { allowedPlans: ['pro', 'enterprise'] }), { status: 403 });
  await f.activate();
  const security = createDaaSSecurity({ getDb: () => f.db, clock: f.clock });
  const request = { apiKeyData: { ...key, id: 'key-a' }, apiCredential: key.key };
  requirePlan(['Pro', 'Enterprise'])(request, {}, () => {});
  let next = false;
  await security.enforceRequestLimit(request, { set() {}, status() { throw new Error('Unexpected denial'); } }, () => { next = true; });
  assert.equal(next, true); assert.equal(request.userPlan, 'Pro Trial'); assert.equal(activeCustomerSegment(request.userPlanData), 'Hardware');
  f.time(END); await assert.rejects(f.consume(false, { allowedPlans: ['pro'] }), { status: 403 });
});
test('expiry uses server boundary, returns Free, keeps keys/ownership, never permits reactivation', async () => {
  const f = fixture(); await f.activate();
  f.time('2026-09-30T11:59:59.999Z'); assert.equal((await f.status()).body.active, true);
  f.time(END); assert.equal((await f.status()).body.status, 'expired');
  assert.equal((await f.consume()).usage.limit, 50); assert.equal(f.db.read('api_keys/key-a').status, 'active');
  assert.equal(f.db.read('users/owner').businessSegment, 'Hardware'); assert.equal((await f.activate()).statusCode, 409);
});
test('paid Pro supersedes trial; trial time never extends paid renewal base', async () => {
  const f = fixture(); await f.activate(); await f.consume();
  const period = renewalPeriod(f.db.read('users/owner'), f.clock()); assert.equal(period.start, START);
  await f.db.collection('users').doc('owner').update({ plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: period.end });
  assert.equal((await f.consume()).usage.limit, 5000); assert.equal(f.db.read('account_trial_usage/owner').used, 1);
  assert.equal((await f.status()).body.status, 'superseded'); assert.equal((await f.activate()).statusCode, 409);
});
test('usage projection shows trial total and expiry rather than daily reset', async () => {
  const f = fixture(); await f.activate(); await f.consume();
  const data = (await invoke(f.keys.list)).body; assert.equal(data.keys[0].quotaPeriod, 'trial');
  const view = quotaSummary(data.usage, f.clock()); assert.equal(view.period, 'trial');
  assert.equal(view.remaining, 499); assert.equal(view.resetsAt, END);
});
for (const segment of ['Grocery', 'Pharmacy', 'Hardware']) test('Hardware submission versus ' + segment + ' payload', async () => {
  const db = catalogDb({ 'users/customer': owner });
  const handlers = createProductSubmissionHandlers({ getDb: () => db, now: () => new Date(START),
    verifyIdToken: async (_, revoked) => { assert.equal(revoked, true); return { uid: 'customer' }; } });
  const result = await submissionInvoke(handlers.submit, { token: 'customer', headers: { 'idempotency-key': 'trial-product-000001' },
    body: { name: 'Test Tool', brand: 'Brand', segment, category: 'Tools', description: '',
      image_url: 'https://example.invalid/tool.jpg', variants: [{ size: '1pc', flavor: '', price: 10 }] } });
  assert.equal(result.statusCode, segment === 'Hardware' ? 201 : 403);
  assert.equal(Object.keys(db.dump()).filter(path => path.startsWith('products/')).length, 0);
});
test('entitlement poller clears stale UI and refreshes at Trial expiry', async () => {
  const delays = [], states = [];
  const poller = createEntitlementPoller({ read: async () => ({ activePro: false, activeTrial: true, secondsRemaining: 5 }),
    onState: state => states.push(state), now: () => 0, schedule: (_, delay) => { delays.push(delay); return 1; }, cancel: () => {} });
  poller.start(); await poller.refresh(); poller.stop(); assert.equal(delays.at(-1), 5000); assert.equal(states[0], null);
});
test('route, scoped UI, server counter and URL-only wiring', () => {
  assert.match(read('server.js'), /app\.use\('\/api\/v1\/free-trial'/);
  assert.match(read('dashboard/src/lib/firebase/auth-context.tsx'), /activeCustomerSegment/);
  assert.match(read('dashboard/src/app/dashboard/products/page.tsx'), /scopeCustomerProducts\(products, appUser\)/);
  assert.match(read('dashboard/src/app/dashboard/page.tsx'), /Active Business Segment/);
  const add = read('dashboard/src/components/products/AddProductModal.tsx');
  assert.match(add, /disabled=\{segmentLocked\}/); assert.doesNotMatch(add, /uploadBytes|addDoc|setDoc/);
  const trial = read('dashboard/src/app/dashboard/free-trial/page.tsx');
  assert.match(trial, /generation\.current !== request/); assert.match(trial, /setResult\(null\)/);
  assert.doesNotMatch(trial, /localStorage|sessionStorage|updateDoc|setDoc/);
  assert.ok(/requirePlan\(\['pro', 'enterprise'\]\)/.test(read('routes/daas.js')));
  assert.ok(/max: 60/.test(read('server.js')));
});

test('Free: Sep 1 zero, 50th allowed, 51st denied, next day unchanged, Oct 1 zero', async () => {
  const f = fixture({}, { 'account_free_monthly_usage/owner': { window: '2026-08', used: 50 } });
  f.time('2026-09-01T00:00:00.000Z');
  assert.equal((await invoke(f.keys.list)).body.usage.used, 0);
  for (let i = 1; i <= 50; i++) assert.equal((await f.consume(i % 2 === 0)).usage.used, i);
  await assert.rejects(f.consume(), { status: 429 });
  f.time('2026-09-02T00:00:00.000Z'); await assert.rejects(f.consume(true), { status: 429 });
  const quota = (await invoke(f.keys.list)).body.usage;
  assert.equal(quota.window, '2026-09'); assert.equal(quota.period, 'monthly'); assert.equal(quota.used, 50);
  assert.equal(quotaSummary(quota, f.clock()).remaining, 0);
  f.time('2026-10-01T00:00:00.000Z'); assert.equal((await invoke(f.keys.list)).body.usage.used, 0);
  assert.equal((await f.consume()).usage.used, 1);
});
test('Free monthly boundary is atomic across keys and no failed admission is charged', async () => {
  const f = fixture({}, { 'account_free_monthly_usage/owner': { window: '2026-09', used: 49 } });
  const results = await Promise.allSettled([f.consume(), f.consume(true), f.consume()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 2);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 50);
});
for (const cap of [0, 7, 50, 5000]) test('Free lower override precedence: ' + cap, async () => {
  const f = fixture({ apiRequestLimit: cap }, { 'account_free_monthly_usage/owner': { window: '2026-09', used: 0 } });
  for (let i = 0; i < Math.min(cap, 50); i++) await f.consume();
  await assert.rejects(f.consume(), { status: 429 });
  assert.equal((await invoke(f.keys.list)).body.usage.limit, Math.min(cap, 50));
});
test('month rollover handles December and leap February without local timezone', () => {
  for (const [at, reset] of [['2026-12-31T23:59:59.999Z', '2027-01-01T00:00:00.000Z'],
    ['2028-02-29T23:59:59.999Z', '2028-03-01T00:00:00.000Z']]) {
    assert.equal(freeMonthlyUsage(null, null, new Date(at)).resetsAt, reset);
  }
});
test('monthly migration never trusts daily counters or browser dates; first hold commits and rolls once', async () => {
  const f = fixture({ createdAt: START }, { 'account_free_monthly_usage/owner': null });
  const first = await Promise.allSettled([f.consume(), f.consume(true)]);
  assert.ok(first.every(r => r.status === 'rejected' && r.reason.code === 'QUOTA_CUTOVER_PENDING'));
  assert.equal(f.db.read('account_free_monthly_usage/owner').holdUntil, '2026-10-01T00:00:00.000Z');
  assert.equal((await invoke(f.keys.list)).body.usage.holdUntil, '2026-10-01T00:00:00.000Z');
  f.time('2026-10-01T00:00:00.000Z'); assert.equal((await f.consume()).usage.used, 1);
  assert.equal((await f.consume(true)).usage.used, 2);
});
test('new account exception requires new monthly cutover plus server creation metadata', async () => {
  const cutoff = '2026-09-23T10:00:00.000Z';
  const f = fixture({}, { 'account_free_monthly_usage/owner': null }, { creationTimes: { 'users/owner': '2026-09-23T11:00:00.000Z' } });
  assert.equal((await f.consume(false, { monthlyCutoverAt: cutoff })).usage.used, 1);
  const old = fixture({}, { 'account_free_monthly_usage/owner': null });
  await assert.rejects(old.consume(false, { cutoverAt: cutoff }), { code: 'QUOTA_CUTOVER_PENDING' });
});
test('Trial bypasses exhausted Free month, but exhaustion restores it without reset or key revocation', async () => {
  const f = fixture({}, { 'account_free_monthly_usage/owner': { window: '2026-09', used: 50 } });
  await f.activate();
  for (let i = 0; i < 500; i++) await f.consume();
  assert.equal((await f.status()).body.active, false);
  await assert.rejects(f.consume(), { status: 429 });
  await assert.rejects(f.consume(false, { allowedPlans: ['pro'] }), { status: 403 });
  assert.equal(f.db.read('api_keys/key-a').status, 'active');
  assert.equal(f.db.read('users/owner').businessSegment, 'Hardware');
  assert.equal((await f.activate()).statusCode, 409);
  f.time('2026-10-01T00:00:00.000Z'); assert.equal((await f.consume()).usage.used, 1);
  assert.equal(f.db.read('account_trial_usage/owner').used, 500);
});
test('Trial expiry preserves current monthly Free balance and lower cap', async () => {
  const f = fixture({ apiRequestLimit: 3 }); await f.activate();
  for (let i = 0; i < 60; i++) await f.consume(i % 2 === 0);
  f.time(END); const after = await f.consume();
  assert.equal(after.account.plan, 'Free'); assert.equal(after.usage.used, 3); assert.equal(after.usage.limit, 3);
  await assert.rejects(f.consume(true), { status: 429 });
  assert.equal(f.db.read('account_trial_usage/owner').used, 60);
});
test('failed 500th commit cannot publish exhaustion or partially charge', async () => {
  const f = fixture(); await f.activate(); await f.db.collection('account_trial_usage').doc('owner').update({ used: 499 });
  f.db.failCommit = true; await assert.rejects(f.consume()); f.db.failCommit = false;
  assert.equal(f.db.read('users/owner').trialExhaustedAt, undefined);
  assert.equal(f.db.read('account_trial_usage/owner').used, 499);
  assert.equal((await f.consume()).usage.used, 500);
  assert.equal((await f.consume()).account.plan, 'Free');
});
test('paid Pro retains daily rollover independent of saved Free month', async () => {
  const f = fixture({ plan: 'Pro', subscription_status: 'active', subscriptionExpiresAt: END },
    { 'account_api_usage/owner': { window: '2026-09-23', used: 5000 } });
  await assert.rejects(f.consume(), { status: 429 });
  f.time('2026-09-24T00:00:00.000Z'); assert.equal((await f.consume()).usage.used, 1);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 2);
});
test('UTC month rollover never resets an active Trial counter; later expiry opens only the new Free month', async () => {
  const f = fixture(); f.time('2026-09-29T12:00:00.000Z'); await f.activate(); await f.consume();
  f.time('2026-10-01T00:00:00.000Z');
  const next = await f.consume(true); assert.equal(next.account.plan, 'Pro Trial'); assert.equal(next.usage.used, 2);
  assert.equal(f.db.read('account_free_monthly_usage/owner').window, '2026-09');
  f.time('2026-10-06T12:00:00.000Z');
  const free = await f.consume(); assert.equal(free.account.plan, 'Free'); assert.equal(free.usage.window, '2026-10');
  assert.equal(free.usage.used, 1); assert.equal(f.db.read('account_trial_usage/owner').used, 2);
});
test('Settings uses shared segment policy; quota copy distinguishes monthly, daily and Trial', () => {
  const settings = read('dashboard/src/app/dashboard/settings/page.tsx');
  assert.match(settings, /segmentRestricted = restrictedSegmentAccount\(appUser\)/);
  assert.match(settings, /activeCustomerSegment\(appUser\)/);
  assert.match(read('dashboard/src/config/plans.ts'), /50 requests\/month/);
  assert.match(read('dashboard/src/components/reports/CustomerUsageSummary.tsx'), /Monthly account limit/);
  assert.match(read('dashboard/src/app/dashboard/free-trial/page.tsx'), /Expiry or exhaustion returns you/);
});
