import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as intelligence from '../../services/customer-intelligence.js';
import { createCustomerIntelligenceHandlers, createDaaSIntelligenceHandlers } from '../../services/customer-intelligence-handlers.js';
import { historyRecord } from '../../services/api-history.js';
import { SUBSCRIPTION_PLANS, PRO_MAX_CAPABILITY_IDS } from '../../dashboard/src/config/plans.ts';

const file = path => new URL('../../' + path, import.meta.url);
const read = path => readFileSync(file(path), 'utf8');

test('shared desktop/mobile navigation preserves exact remaining order without a dead icon', () => {
  const navigation = read('dashboard/src/components/layout/dashboard-navigation.ts');
  assert.deepEqual([...navigation.matchAll(/name: '([^']+)'/g)].map(match => match[1]),
    ['Overview', 'Products', 'API Keys', 'Documentation', 'Analytics', 'Privacy', 'Plan & Billing', 'Settings']);
  assert.doesNotMatch(navigation, /recommendation|Lightbulb/i);
  for (const component of ['Sidebar', 'Navbar']) {
    assert.match(read(`dashboard/src/components/layout/${component}.tsx`), /dashboardRoutes/);
  }
});

test('removed page has no hidden compatibility route or redirect', () => {
  assert.equal(existsSync(file('dashboard/src/app/dashboard/recommendations/page.tsx')), false);
  assert.doesNotMatch(read('dashboard/next.config.ts'), /recommendation/i);
  assert.match(read('dashboard/next.config.ts'), /globalNotFound: true/);
  const missing = read('dashboard/src/app/global-not-found.tsx');
  assert.match(missing, /404 — Page not found/);
  assert.doesNotMatch(missing, /AuthProvider|LayoutWrapper|useAuth|useEffect|router|fetch|firebase|recommendation/i);
});

for (const path of ['routes/daas.js', 'routes/customer-insights.js',
  'services/customer-intelligence.js', 'services/customer-intelligence-handlers.js',
  'dashboard/src/app/dashboard/api-playground/page.tsx', 'dashboard/src/app/docs/page.tsx',
  'dashboard/src/app/dashboard/plan-billing/page.tsx', 'docs/pro-max-data-features.md',
  'dashboard/DASHBOARD_SYSTEM_SPECS.md', 'dashboard/SYSTEM_FLOWCHART.md']) {
  test(`${path} does not retain the removed capability`, () => assert.doesNotMatch(read(path), /recommendation/i));
}

test('removed algorithm, catalog scan and handler exports are not callable', () => {
  assert.equal('recommendations' in intelligence, false);
  assert.equal('customerCatalog' in intelligence, false);
  const getDb = () => { throw new Error('Factories must not read data'); };
  assert.deepEqual(Object.keys(createDaaSIntelligenceHandlers({ getDb })).sort(), ['feed', 'sale']);
  assert.deepEqual(Object.keys(createCustomerIntelligenceHandlers({ getDb })).sort(), ['feed']);
});

for (const plan of ['free', 'pro', 'pro_max']) {
  test(`${plan} has no replacement marketing benefit or recommendation promise`, () => {
    assert.doesNotMatch(JSON.stringify(SUBSCRIPTION_PLANS[plan]), /recommendation/i);
  });
}

test('paid capability proof map retains sales, quota, keys and integration capabilities', () => {
  assert.deepEqual([...PRO_MAX_CAPABILITY_IDS], ['unlimited_account_quota', 'all_segments', 'real_sales_feed',
    'multiple_api_keys', 'api_playground', 'usage_history', 'renewable_30_day_term']);
  assert.equal(SUBSCRIPTION_PLANS.pro.price, 1499);
  assert.equal(SUBSCRIPTION_PLANS.pro_max.price, 4999);
  assert.equal(SUBSCRIPTION_PLANS.pro.requestLimit, 500);
  assert.equal(SUBSCRIPTION_PLANS.pro_max.requestLimit, null);
});

test('legacy telemetry is safely unavailable, not rewritten as another callable endpoint', () => {
  const historical = { endpoint: '/recommendations', method: 'GET', statusCode: 200,
    keyName: 'Historic integration', timestamp: new Date('2026-09-01T00:00:00Z') };
  const before = structuredClone(historical);
  const row = historyRecord(historical);
  assert.equal(row.endpoint, null);
  assert.equal(row.statusCode, 200);
  assert.equal(row.timestamp, '2026-09-01T00:00:00.000Z');
  assert.deepEqual(historical, before);
  for (const endpoint of ['/catalog', '/sales', '/sales-feed']) {
    assert.equal(historyRecord({ ...historical, endpoint }).endpoint, `/daas/v1${endpoint}`);
  }
});

test('catalog, sale ingestion and paid reporting stay wired with their existing security ordering', () => {
  const daas = read('routes/daas.js');
  assert.match(daas, /router\.get\('\/catalog', authenticateApiKey, enforceRequestLimit/);
  assert.match(daas, /router\.get\('\/health'/);
  assert.match(daas, /router\.post\('\/sales', authenticateApiKey, enforceRequestLimit, intelligence\.sale/);
  assert.match(daas, /router\.get\('\/sales-feed', authenticateApiKey, requirePaidSubscription, enforceRequestLimit, intelligence\.feed/);
  assert.match(read('routes/customer-insights.js'), /router\.get\('\/sales-feed', handlers\.feed/);
  assert.match(read('dashboard/src/app/dashboard/analytics/page.tsx'), /SalesAnalyticsPanel/);
  assert.match(read('dashboard/src/components/reports/SalesAnalyticsPanel.tsx'), /customer\/insights\/sales-feed/);
  const playground = read('dashboard/src/app/dashboard/api-playground/page.tsx');
  for (const path of ['catalog', 'sales-feed', 'health']) assert.ok(playground.includes(`/daas/v1/${path}`));
});
