import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = file => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8');
const page = read('admin-panel/src/components/admin/AdminDashboardClient.tsx');
test('no active Admin browser code reads telemetry directly', () => {
  const root = new URL('../../../admin-panel/src/', import.meta.url);
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(new URL(entry.name + '/', dir)) : /\.[jt]sx?$/u.test(entry.name) ? [new URL(entry.name, dir)] : []);
  for (const file of walk(root)) assert.doesNotMatch(readFileSync(file, 'utf8'), /api_telemetry/u, file.href);
});
test('route is mounted through injected Admin SDK authority, revocation flag forwarded', () => {
  assert.match(read('server.js'), /app.use\('\/api\/v1\/admin', adminRouter\)/u);
  const route = read('routes/admin.js');
  assert.match(route, /router.get\('\/traffic', createAdminTrafficHandler/u);
  assert.match(route, /getAuth\(\).verifyIdToken\(token, revoked\)/u);
  assert.match(route, /documentId: FieldPath.documentId\(\)/u);
});
test('component wires existing Firebase identity and cleanup with manual refresh only', () => {
  assert.match(page, /auth.currentUser === user/u); assert.match(page, /token: \(\) => user.getIdToken\(\)/u);
  assert.match(page, /refresh.stop\(\)/u); assert.match(page, /<Reports key=\{user.uid\} user=\{user\}/u);
  assert.match(page, /Refresh traffic/u); assert.match(page, /trafficRefresh.current\?\.refresh\(\)/u);
  assert.doesNotMatch(page, /setInterval|signOut|localStorage/u);
});
test('loading/error excluded from aggregation; bounded snapshot labels and no invented health', () => {
  assert.match(page, /sources.telemetry.status === "ready" \? telemetryReport/u);
  assert.match(page, /traffic\?\.recorded \?\? unavailable\("telemetry"\)/u);
  for (const label of ['Loading recorded traffic', 'No valid recorded traffic', 'Unable to load traffic',
    'Latest 500 stored telemetry', 'No prior-period comparison', 'not a real-time feed', 'not a complete daily total']) assert.ok(page.includes(label));
  assert.doesNotMatch(page, /99\.9|operational|Math.random|previous:|generateTrafficData/iu);
});
test('rules default-deny telemetry and real emulator assertions cover Customer and Admin', () => {
  const rules = read('firestore.rules'); assert.doesNotMatch(rules, /match \/api_telemetry/u);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/u);
  const tests = read('scripts/test-adviser-phase2a-rules.mjs');
  assert.match(tests, /\['customer', 'admin'\]/u); assert.match(tests, /direct telemetry get\/list\/create\/update\/delete remain denied/u);
});
test('test sandbox blocks external SDK and network access', async () => {
  for (const specifier of ['firebase-admin', 'node:http', '../../../database/firebase.js']) await assert.rejects(import(specifier));
  assert.throws(() => globalThis.fetch('https://example.invalid'));
});
