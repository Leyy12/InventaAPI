import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { createApiHistoryHandler } from '../../../services/api-history.js';
import { createAdminEntitlements } from '../../../services/admin-entitlements.js';
import { resolveCurrentCatalogProducts } from '../../../services/daas-catalog.js';
import { memoryFirestore, invoke } from '../phase2b1/memory-firestore.mjs';
import { evaluateEntitlement } from '../../../functions/subscription-lifecycle.mjs';
import { customerReportScope } from '../../../services/reporting.js';
import { SUBSCRIPTION_PLANS, PRO_MAX_CAPABILITY_IDS, getCumulativeFeatures } from '../../../dashboard/src/config/plans.ts';
import { PRO_DAILY_REQUEST_LIMIT, TRIAL_MIN_PRODUCTS, TRIAL_MAX_PRODUCTS, trialCatalogChangeAllowed } from '../../../functions/entitlement-limits.mjs';

const now = new Date('2026-09-27T12:00:00.000Z');
const owner = { uid: 'owner', role: 'Developer', plan: 'Pro Max', apiRequestLimit: null,
  subscription_status: 'active', subscriptionExpiresAt: '2026-10-27T12:00:00.000Z',
  businessSegment: 'Grocery', selectedSegment: 'Grocery' };
const raw = (name, segment) => ({ name, segment, category: 'Products', status: 'active', price: 10 });
const source = relative => readFileSync(fileURLToPath(new URL(`../../../${relative}`, import.meta.url)), 'utf8');

test('shared effective limits and rendered pricing contract are 0–50, 500/day and unlimited', () => {
  assert.equal(TRIAL_MIN_PRODUCTS, 0); assert.equal(TRIAL_MAX_PRODUCTS, 50); assert.equal(PRO_DAILY_REQUEST_LIMIT, 500);
  assert.equal(SUBSCRIPTION_PLANS.free.billingCycle, '7 days');
  assert.equal(SUBSCRIPTION_PLANS.free.requestLimit, null);
  assert.equal(SUBSCRIPTION_PLANS.free.requestLimitDisplay, 'Up to 50 products');
  assert.ok(SUBSCRIPTION_PLANS.free.features.includes('Up to 50 products'));
  assert.ok(SUBSCRIPTION_PLANS.free.features.includes('One API key'));
  assert.doesNotMatch(JSON.stringify(SUBSCRIPTION_PLANS.free), /minimum|500 products|50–500/i);
  assert.equal(SUBSCRIPTION_PLANS.pro.requestLimit, PRO_DAILY_REQUEST_LIMIT);
  assert.equal(SUBSCRIPTION_PLANS.pro.requestLimitDisplay, '500 requests/day');
  assert.ok(SUBSCRIPTION_PLANS.pro.incrementalFeatures.includes('500 requests per day'));
  assert.equal(SUBSCRIPTION_PLANS.pro_max.requestLimit, null);
  assert.match(SUBSCRIPTION_PLANS.pro_max.requestLimitDisplay, /Unlimited/);
  assert.equal(SUBSCRIPTION_PLANS.pro.priceDisplay, '₱1,499');
  assert.equal(SUBSCRIPTION_PLANS.pro_max.priceDisplay, '₱4,999');
  for (const file of ['dashboard/src/app/dashboard/products/page.tsx', 'dashboard/src/app/dashboard/free-trial/page.tsx',
    'dashboard/src/components/reports/CustomerUsageSummary.tsx', 'dashboard/src/app/docs/page.tsx',
    'dashboard/src/app/privacy-policy/page.tsx', 'dashboard/src/components/auth/LoginModal.tsx']) {
    assert.doesNotMatch(source(file), /Minimum [Rr]equired|minimum 50|at least 50|50–500|\/ 500\b|5,000 requests/);
  }
});

test('shared UI/server change predicate counts unique IDs and permits only legacy subsets until saved within cap', () => {
  const ids = count => Array.from({ length: count }, (_, i) => `p${i}`);
  assert.equal(trialCatalogChangeAllowed([], []), true);
  assert.equal(trialCatalogChangeAllowed([], Array(51).fill('p0')), true);
  assert.equal(trialCatalogChangeAllowed(ids(49), ids(50)), true);
  assert.equal(trialCatalogChangeAllowed(ids(50), ids(51)), false);
  assert.equal(trialCatalogChangeAllowed(ids(50), ids(49)), true);
  assert.equal(trialCatalogChangeAllowed(ids(51), ids(51)), true);
  assert.equal(trialCatalogChangeAllowed(ids(51), ids(50)), true);
  assert.equal(trialCatalogChangeAllowed(ids(51), [...ids(49), 'new']), false);
  assert.equal(trialCatalogChangeAllowed(ids(50), [...ids(49), 'new']), true);
});

test('public Pro Max capabilities have a fixed one-to-one proof map; no new marketing line can silently appear', () => {
  assert.deepEqual([...PRO_MAX_CAPABILITY_IDS], [
    'unlimited_account_quota', 'all_segments', 'real_sales_feed',
    'multiple_api_keys', 'api_playground', 'usage_history', 'renewable_30_day_term',
  ]);
  assert.deepEqual([...SUBSCRIPTION_PLANS.pro_max.incrementalFeatures], [
    'Unlimited account API quota*', 'All Business Segments',
    'Real Sales Analytics Feed', 'Multiple API Keys', 'API Playground',
    'Usage & Integration History', '30-day renewable subscription',
  ]);
  assert.equal(PRO_MAX_CAPABILITY_IDS.length, SUBSCRIPTION_PLANS.pro_max.incrementalFeatures.length);
});

test('Free, Pro, Pro Max public plans retain truthful inherited capabilities and real purchase entry', () => {
  assert.deepEqual(Object.keys(SUBSCRIPTION_PLANS), ['free', 'pro', 'pro_max']);
  assert.equal(getCumulativeFeatures('pro_max').header, 'Everything in Pro, and:');
  assert.equal(SUBSCRIPTION_PLANS.pro.price, 1499);
  assert.equal(SUBSCRIPTION_PLANS.pro_max.price, 4999);
  assert.equal(SUBSCRIPTION_PLANS.pro.highlighted, true);
  assert.ok(!SUBSCRIPTION_PLANS.free.features.includes('Product Recommendations'));
  assert.ok(SUBSCRIPTION_PLANS.free.features.includes('One Business Segment'));
  assert.ok(SUBSCRIPTION_PLANS.pro.incrementalFeatures.includes('Real Sales Analytics Feed'));
  assert.ok(!JSON.stringify(SUBSCRIPTION_PLANS).match(/\bSLA\b|Custom Endpoints|Priority Support|AI-powered|confidence score/iu));
  assert.match(source('dashboard/src/components/auth/AuthEntry.tsx'), /openSubscription\("pro_max"\)/u);
  assert.match(source('dashboard/src/components/subscription/SubscriptionModal.tsx'), /JSON\.stringify\(\{ plan: selectedPlan \}\)/u);
});

test('Pro Max has paid multi-segment behavior; Free/Trial remain in authoritative segment', async () => {
  const products = { bread: raw('Bread', 'Grocery'), medicine: raw('Medicine', 'Pharmacy'), hammer: raw('Hammer', 'Hardware') };
  const scope = { linkedProductIds: Object.keys(products) };
  const loadProductById = async id => products[id];
  const full = await resolveCurrentCatalogProducts({ apiKeyData: scope, userData: owner, loadProductById });
  assert.deepEqual(full.products.map(product => product.segment), ['Grocery', 'Pharmacy', 'Hardware']);
  const free = await resolveCurrentCatalogProducts({ apiKeyData: scope,
    userData: { ...owner, plan: 'Free' }, loadProductById });
  assert.deepEqual(free.products.map(product => product.segment), ['Grocery']);
  const trial = await resolveCurrentCatalogProducts({ apiKeyData: scope,
    userData: { ...owner, plan: 'Pro Trial' }, loadProductById });
  assert.deepEqual(trial.products.map(product => product.segment), ['Grocery']);
  assert.equal(customerReportScope('Pro Max', 'Grocery').restricted, false);
  assert.equal(customerReportScope('Free', 'Grocery').restricted, true);
});

test('Pro Max can manage two active keys without a one-key ceiling or credential disclosure', async () => {
  const db = memoryFirestore({ 'users/owner': owner,
    'account_api_usage/owner': { window: '2026-09-27', used: 7 },
    'api_keys/one': { userId: 'owner', status: 'active', key: 'daas_one', name: 'POS A' },
    'api_keys/two': { userId: 'owner', status: 'active', key: 'daas_two', name: 'POS B' },
  });
  const handlers = createApiKeyHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }), clock: () => now });
  const result = await invoke(handlers.list);
  assert.equal(result.statusCode, 200); assert.equal(result.body.keys.length, 2);
  assert.equal(result.body.usage.limit, null); assert.equal(result.body.usage.used, 7);
  assert.ok(result.body.keys.every(key => key.plan === 'Pro Max' && key.requestLimit === null && !('key' in key)));
});

test('Pro Max Admin view displays authoritative plan and observed unlimited usage', async () => {
  const db = memoryFirestore({ 'users/admin': { uid: 'admin', role: 'Admin', plan: 'Enterprise' },
    'users/owner': owner, 'account_api_usage/owner': { window: '2026-09-27', used: 19 } });
  const handler = createAdminEntitlements({ getDb: () => db, verifyIdToken: async () => ({ uid: 'admin' }), clock: () => now });
  const response = await invoke(handler, { body: { ids: ['owner'] } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.accounts.owner.plan, 'Pro Max');
  assert.equal(response.body.accounts.owner.limit, null);
  assert.equal(response.body.accounts.owner.used, 19);
});

test('sales and unavailable historical requests remain in bounded account-owned history', async () => {
  const db = memoryFirestore({ 'users/owner': owner,
    'api_telemetry/s': { userId: 'owner', keyName: 'POS', endpoint: '/sales', method: 'POST', statusCode: 200, timestamp: now },
    'api_telemetry/r': { userId: 'owner', keyName: 'POS', endpoint: '/recommendations', method: 'GET', statusCode: 200, timestamp: now },
    'api_telemetry/other': { userId: 'other', keyName: 'Other', endpoint: '/sales', method: 'POST', statusCode: 200, timestamp: now },
  });
  const handler = createApiHistoryHandler({ getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }), documentId: '__name__' });
  const historical = db.read('api_telemetry/r');
  const response = await invoke(handler);
  assert.equal(response.statusCode, 200); assert.equal(response.body.records.length, 2);
  assert.deepEqual(new Set(response.body.records.map(row => row.endpoint)), new Set(['/daas/v1/sales', null]));
  assert.deepEqual(db.read('api_telemetry/r'), historical);
});

test('Customer routes and API Playground expose paid sales without removed recommendations', () => {
  const routes = source('routes/daas.js');
  assert.match(routes, /router\.post\('\/sales', authenticateApiKey, enforceRequestLimit, intelligence\.sale\)/u);
  assert.doesNotMatch(routes, /recommendations/u);
  assert.match(routes, /router\.get\('\/sales-feed', authenticateApiKey, requirePaidSubscription, enforceRequestLimit, intelligence\.feed\)/u);
  assert.match(source('server.js'), /app\.use\('\/api\/v1\/customer\/insights', customerInsightsRouter\)/u);
  assert.match(source('functions/index.js'), /'Pro Max', 'pro max'/u);
  assert.equal(existsSync(new URL('../../../dashboard/src/app/dashboard/recommendations/page.tsx', import.meta.url)), false);
  assert.match(source('dashboard/src/app/dashboard/analytics/page.tsx'), /SalesAnalyticsPanel/u);
  assert.match(source('dashboard/src/components/reports/SalesAnalyticsPanel.tsx'), /customer\/insights\/sales-feed/u);
  assert.doesNotMatch(source('dashboard/src/app/dashboard/api-playground/page.tsx'), /recommendations/iu);
  assert.match(source('dashboard/src/app/dashboard/api-playground/page.tsx'), /\/daas\/v1\/sales-feed/u);
  assert.doesNotMatch(source('dashboard/src/components/layout/dashboard-navigation.ts'), /recommendations/iu);
  assert.equal(evaluateEntitlement(owner, now).limit, null);
});

test('shared desktop/mobile navigation retains Plan & Billing without recommendations', () => {
  const navigation = source('dashboard/src/components/layout/dashboard-navigation.ts');
  assert.match(navigation, /name: 'Plan & Billing', href: '\/dashboard\/plan-billing'/u);
  assert.doesNotMatch(navigation, /recommendations/iu);
  assert.doesNotMatch(navigation, /name: ['"]7-Day Pro Trial['"]/u);
  assert.match(source('dashboard/src/components/layout/Sidebar.tsx'), /import \{ dashboardRoutes, routeActive \}/u);
  assert.match(source('dashboard/src/components/layout/Navbar.tsx'), /dashboardRoutes/u);
  const billing = source('dashboard/src/app/dashboard/plan-billing/page.tsx');
  assert.match(billing, /entitlement\.canPurchaseProMax/u);
  assert.match(billing, /planId="pro_max" currentPlan=\{entitlement\.plan\} canPurchase=\{entitlement\.canPurchaseProMax\} onChoose=\{purchase\}/u);
  assert.match(billing, /const purchase = \(plan: PaidPlanId\) => \{ setPurchasePlan\(plan\); setPurchaseOpen\(true\); \}/u);
  assert.match(billing, /selectedPlan=\{purchasePlan\}/u);
  assert.match(billing, /<FreeTrialPage embedded \/>/u);
  assert.match(source('dashboard/src/app/dashboard/settings/page.tsx'), /href="\/dashboard\/plan-billing"/u);
  assert.doesNotMatch(source('dashboard/src/app/dashboard/settings/page.tsx'), /SubscriptionModal|setSubscriptionOpen/u);
  assert.match(source('dashboard/src/components/reports/CustomerUsageSummary.tsx'), /href="\/dashboard\/plan-billing#upgrade"/u);
});

test('reconciliation preserves the released Admin Sign Out color without adding any Admin source changes', () => {
  const sidebar = source('admin-panel/src/components/layout/AdminSidebar.tsx');
  assert.match(sidebar, /text-red-400 hover:text-red-300 hover:bg-red-500\/10/u);
  assert.match(sidebar, /logout\(\)/u);
  assert.match(sidebar, /<LogOut className="w-3 h-3" \/>/u);
});
