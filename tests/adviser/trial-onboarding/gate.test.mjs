import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { createFreeTrialHandlers } from '../../../services/free-trial.js';
import { authenticateCredential } from '../../../services/api-key-security.js';
import { memoryStore, invoke } from '../phase2a/memory-store.mjs';

const now = new Date('2026-09-22T12:00:00.000Z');
const end = '2026-09-29T12:00:00.000Z';
const free = { role: 'Developer', plan: 'Free', apiRequestLimit: 50,
  businessSegment: 'Grocery', selectedSegment: 'Grocery' };
const activeTrial = { ...free, hasUsedFreeTrial: true, trialVersion: 1,
  trialStartedAt: now.toISOString(), trialExpiresAt: end };
const counter = { used: 0, startedAt: now.toISOString(), expiresAt: end };

function fixture(account = free, extra = {}) {
  const db = memoryStore({ 'users/owner': account, ...extra });
  const verifyIdToken = async token => token === 'owner-token' ? { uid: 'owner' } : null;
  const keys = createApiKeyHandlers({ getDb: () => db, verifyIdToken, clock: () => now });
  const trial = createFreeTrialHandlers({ getDb: () => db, verifyIdToken,
    revokeRefreshTokens: async () => {}, clock: () => now });
  return { db, keys, trial, create: body => invoke(keys.create, { body: { keyName: 'Test key', ...body } }) };
}

const docs = async (db, name) => (await db.collection(name).get()).docs;
async function assertNoIssuance(db) {
  for (const name of ['api_keys', 'api_key_generation_days', 'audit_logs', 'account_trial_usage']) {
    assert.equal((await docs(db, name)).length, 0, name);
  }
  assert.equal(db.read('account_free_monthly_usage/owner'), undefined);
}

test('new Free account and direct forged-plan request are denied without any issuance or quota mutation', async () => {
  const f = fixture();
  for (const body of [{}, { plan: 'Pro', hasUsedFreeTrial: true, apiRequestLimit: null }]) {
    const response = await f.create(body);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error, 'UPGRADE_REQUIRED');
    assert.equal(Object.hasOwn(response.body, 'key'), false);
    await assertNoIssuance(f.db);
    assert.deepEqual(f.db.read('users/owner'), free);
  }
});

test('legacy Free key remains listed, authenticatable and manageable while additional issuance is denied', async () => {
  const old = { userId: 'owner', key: 'daas_legacy_grocery', status: 'active', name: 'Historical', linkedProductIds: [] };
  const f = fixture(free, { 'api_keys/old': old });
  assert.equal((await authenticateCredential(f.db, old.key)).id, 'old');
  assert.equal((await invoke(f.keys.list)).body.keys.length, 1);
  assert.equal((await f.create()).body.error, 'UPGRADE_REQUIRED');
  assert.equal((await invoke(f.keys.rename, { id: 'old', body: { name: 'Renamed' } })).statusCode, 200);
  assert.equal(f.db.read('api_keys/old').status, 'active');
  assert.equal((await docs(f.db, 'api_key_generation_days')).length, 0);
});

test('Trial activation unlocks issuance, but an existing same-day marker is never reset', async () => {
  const f = fixture();
  assert.equal((await f.create()).body.error, 'UPGRADE_REQUIRED');
  assert.equal((await invoke(f.trial.activate)).statusCode, 200);
  assert.equal((await f.create()).statusCode, 200);
  // A second key is refused: Trial has one key (the one-key rule is checked first).
  assert.equal((await f.create()).body.error, 'TRIAL_KEY_LIMIT');

  const markerId = `${createHash('sha256').update('owner').digest('hex')}_2026-09-22`;
  const g = fixture(free, { [`api_key_generation_days/${markerId}`]: { userId: 'owner', window: '2026-09-22' } });
  assert.equal((await invoke(g.trial.activate)).statusCode, 200);
  assert.equal((await g.create()).body.error, 'API_KEY_DAILY_GENERATION_LIMIT');
  assert.equal((await docs(g.db, 'api_keys')).length, 0);
  assert.equal((await docs(g.db, 'api_key_generation_days')).length, 1);
});

test('active Trial and Pro may issue; used Trial remains UPGRADE_REQUIRED', async () => {
  const paid = (plan, limit) => ({ ...free, plan, apiRequestLimit: limit,
    subscriptionStartedAt: now.toISOString(),
    subscription_status: 'active', subscriptionExpiresAt: '2026-10-22T12:00:00.000Z' });
  for (const [account, extra] of [
    [activeTrial, { 'account_trial_usage/owner': counter }],
    [paid('Pro', 5000), { 'account_request_contracts/owner': { version: 1,
      plans: { pro: { version: 1, period: 'utc_daily', limit: 500 } } } }],
  ]) {
    const f = fixture(account, extra);
    assert.equal((await f.create()).statusCode, 200, account.plan);
  }
  const expired = { ...activeTrial, trialExpiresAt: '2026-09-21T12:00:00.000Z',
    trialStartedAt: '2026-09-14T12:00:00.000Z' };
  const g = fixture(expired);
  const response = await g.create();
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, 'UPGRADE_REQUIRED');
  await assertNoIssuance(g.db);
});

test('navigation, legacy route and locked onboarding UI retain the authoritative path', () => {
  const source = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const sidebar = source('dashboard/src/components/layout/Sidebar.tsx');
  const navigation = source('dashboard/src/components/layout/dashboard-navigation.ts');
  const navbar = source('dashboard/src/components/layout/Navbar.tsx');
  const config = source('dashboard/next.config.ts');
  const overview = source('dashboard/src/app/dashboard/page.tsx');
  const keys = source('dashboard/src/app/dashboard/api-keys/page.tsx');
  const billing = source('dashboard/src/app/dashboard/plan-billing/page.tsx');
  assert.match(navigation, /name: 'Plan & Billing'/);
  assert.doesNotMatch(navigation, /name: '7-Day Pro Trial'/);
  assert.match(sidebar, /href="\/dashboard\/plan-billing" aria-label/);
  assert.match(sidebar, /planLower === "free trial"/);
  assert.match(sidebar, /planLower === "upgrade required"/);
  assert.match(navbar, /customer-mobile-navigation/);
  // Mobile links are the shared sidebar body (MobileSidebar), which marks the current page.
  assert.match(navbar, /<MobileSidebar /); assert.match(sidebar, /aria-current=/);
  assert.match(config, /source: '\/dashboard\/free-trial', destination: '\/dashboard\/plan-billing'/);
  assert.match(billing, /<FreeTrialContent embedded \/>/);
  assert.match(source('dashboard/src/lib/supabase/auth-context.tsx'), /await establishCustomerTrial\(currentUser\)/u);
  assert.match(overview, /<CustomerUsageSummary\s*\/>/u);
  assert.match(keys, /Free Trial Ended\. Existing keys remain visible and revocable/);
  // The released management-only page has no generation request/error state.
  // Retain the locked notice and verify server denial is surfaced by Products.
  assert.match(keys, /upgradeRequired && <div role="status"/);
  assert.doesNotMatch(keys, /api\/v1\/api-keys\/generate|serverTrialRequired/);
  assert.match(source('dashboard/src/app/dashboard/products/page.tsx'), /throw new Error\(generationErrorMessage\(data\)\)/);
  assert.match(source('dashboard/src/lib/api-key-generation.ts'), /data\.error === 'TRIAL_REQUIRED'/);
  assert.match(keys, /href="\/dashboard\/plan-billing#upgrade"/);
});
