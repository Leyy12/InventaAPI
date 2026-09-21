import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
for (const app of ['dashboard', 'admin-panel']) test(app + ' report panel wires canonical helper, dropdown and all states', () => {
  const panel = read(app + '/src/components/reports/CatalogReportPanel.tsx');
  assert.match(panel, /reportView\(source, selection\)/); assert.match(panel, /REPORT_SEGMENTS.map/);
  for (const state of ['loading', 'error', 'empty']) assert.ok(panel.includes('state === "' + state + '"'));
  for (const metric of ['total', 'priced', 'averagePrice', 'distribution', 'segments', 'categories']) assert.ok(panel.includes('report.' + metric));
  assert.match(read(app + '/src/lib/reports.ts'), /services\/reporting.js/);
  assert.doesNotMatch(panel, /stock|\.price \|\| 0/);
});
test('Customer analytics has one scoped dataset, no preference writes or timer filtering', () => {
  const page = read('dashboard/src/app/dashboard/analytics/page.tsx');
  assert.match(page, /plan=\{entitlement\?\.plan\}/);
  assert.match(page, /preference_required/); assert.match(page, /restricted=\{session.scope.restricted\}/);
  assert.match(page, /status: "error", records: \[\]/);
  assert.doesNotMatch(page, /getAllProducts|setTimeout|setDoc|updateDoc/);
});
test('quota remounts on authoritative verification, not unrelated renders; no second subscription poller', () => {
  const usage = read('dashboard/src/components/reports/CustomerUsageSummary.tsx');
  assert.match(usage, /quotaVerificationKey\(user\?\.uid/);
  assert.match(usage, /verification \? <Usage key=\{verification\}/);
  assert.match(usage, /createQuotaRefresh/); assert.match(usage, /refresh.stop\(\)/);
  assert.doesNotMatch(usage, /readSubscription|setTimeout|setInterval\(read/);
});
test('account-owned report state survives transient scope; dataset has one stable listener', () => {
  const page = read('dashboard/src/app/dashboard/analytics/page.tsx');
  assert.match(page, /<AccountReports key=\{user.uid\}/);
  assert.match(page, /reconcileReportSession\(stored, uid, plan, preference\)/);
  assert.match(page, /session.loadCatalog && <CatalogDataset/);
  assert.match(page, /if \(!session.scope.segment\) return null/);
  assert.equal((page.match(/onSnapshot\(/g) || []).length, 1);
  assert.match(page, /records: \[\] \}\)\), \[\]\)/);
  assert.doesNotMatch(page, /key=\{.*scope|localStorage/);
});
test('Admin settings no longer reports unmeasured database health', () => {
  const settings = read('admin-panel/src/app/settings/page.tsx');
  assert.doesNotMatch(settings, />Connected<|>Operational<|99\.9/);
  assert.match(settings, /Database monitoring/); assert.match(settings, /Not configured/); assert.match(settings, /Not tracked/);
});
test('Admin restores distinct key holders without duplicating catalog reads or retaining credential payloads', () => {
  const admin = read('admin-panel/src/components/admin/AdminDashboardClient.tsx');
  assert.match(admin, /activeKeyHolders\(sources.keys, sources.users\)/);
  assert.match(admin, /Active key holders \(active status\)/);
  assert.match(admin, /keys: collection\(db, "api_keys"\)/);
  assert.equal((admin.match(/collection\(db, "products"\)/g) || []).length, 1);
  assert.match(admin, /\{ status: doc.data\(\).status, userId: doc.data\(\).userId \}/);
  assert.match(admin, /holders \?\?/); assert.match(admin, /"Unavailable" : "Loading…"/);
});
test('home missing preference is not a loading condition; quota comes from authenticated account response', () => {
  const page = read('dashboard/src/app/dashboard/page.tsx'), usage = read('dashboard/src/components/reports/CustomerUsageSummary.tsx');
  assert.match(page, /if \(loading\)/); assert.doesNotMatch(page, /if \(loading[^\n]*selectedSegment|api_telemetry/);
  assert.match(page, /CustomerUsageSummary/); assert.match(usage, /quotaSummary\(source.usage, now\)/);
  assert.match(usage, /apiKeyRequest\(user/); assert.doesNotMatch(usage, /requestsUsed|requestLimit|5000|50000/);
});
test('active dashboard status and traffic contain no fabricated metrics', () => {
  const files = ['dashboard/src/app/dashboard/page.tsx', 'dashboard/src/components/layout/Navbar.tsx', 'admin-panel/src/components/admin/AdminDashboardClient.tsx', 'admin-panel/src/components/layout/AdminNavbar.tsx'];
  const sources = files.map(read).join('\n');
  assert.doesNotMatch(sources, /99\.9|operational|Math\.random|previous:|generateTrafficData|segmentData/i);
  assert.match(sources, /Latest 500 stored telemetry/); assert.match(sources, /No prior-period comparison/);
  assert.doesNotMatch(read('admin-panel/src/app/page.tsx'), /fetch\(/);
});
test('shared report dependency is only the unchanged pure Phase 1 projection', () => {
  const helper = read('services/reporting.js');
  assert.match(helper, /projectProduct.*from '.\/product-contract.js'/);
  assert.doesNotMatch(helper, /firebase|process\.env|Math.random|fetch\(/);
});
test('isolated suite rejects SDK/network imports', async () => {
  for (const module of ['firebase-admin', 'node:http', '../../../database/firebase.js']) await assert.rejects(import(module));
  assert.throws(() => globalThis.fetch('https://example.invalid'));
});
