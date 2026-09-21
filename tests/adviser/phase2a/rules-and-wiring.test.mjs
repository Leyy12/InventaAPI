import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// These are static assertions, not a Firestore Rules emulator.
test('static rules: customer clients cannot write API keys or account usage, including reactivation', () => {
  const rules = source('../firestore.rules').replace(/\/\/[^\n]*/gu, '');
  for (const collection of ['api_keys', 'account_api_usage']) {
    const blocks = [...rules.matchAll(new RegExp(`match /${collection}/\\{[^}]+\\} \\{([^}]+)\\}`, 'gu'))];
    assert.equal(blocks.length, 1);
    assert.match(blocks[0][1], /allow create, update, delete: if false;/u);
    assert.match(blocks[0][1], /allow read: if isAdmin\(\);/u);
    assert.doesNotMatch(blocks[0][1], /isOwner/u);
  }
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/u);
  assert.match(rules, /request\.resource\.data\.get\('apiRequestLimit', 0\) == resource\.data\.get\('apiRequestLimit', 0\)/u);
  assert.match(rules, /request\.resource\.data\.get\('plan', ''\) == resource\.data\.get\('plan', ''\)/u);
});

test('static wiring: all management routes use tested authenticated handlers', () => {
  const routes = source('../routes/apikeys.js');
  for (const [verb, path, handler] of [
    ['post', '/generate', 'create'], ['get', '/', 'list'], ['get', '/:id', 'view'],
    ['patch', '/:id/products', 'products'], ['patch', '/:id', 'rename'], ['delete', '/:id', 'revoke'],
  ]) assert.ok(routes.includes(`router.${verb}('${path}', handlers.${handler})`));
  assert.match(routes, /getAuth\(\)\.verifyIdToken\(token, checkRevoked\)/u);
  assert.equal((routes.match(/router\.(get|post|patch|delete)\(/gu) || []).length, 6);
});

test('static wiring: both DaaS endpoints consume account quota, with paid plan checked in transaction', () => {
  const routes = source('../routes/daas.js');
  assert.match(routes, /router\.get\('\/catalog', authenticateApiKey, enforceRequestLimit/u);
  assert.match(routes, /router\.get\('\/sales-feed', authenticateApiKey, requirePlan\(\['pro', 'enterprise'\]\), enforceRequestLimit/u);
  assert.match(routes, /requestsUsed: req\.requestUsage\.used/u);
  assert.doesNotMatch(routes, /req\.apiKeyData\.plan/u);
  assert.match(source('../server.js'), /methods: \[[^\]]*'PATCH'/u);
  assert.doesNotMatch(source('../server.js'), /\$\{req\.originalUrl\}/u);
});

test('static wiring: public DaaS CORS runs before the restricted policy without bypassing route security', () => {
  const server = source('../server.js');
  const daasPolicy = server.slice(server.indexOf('const daasCors = cors({'), server.indexOf("app.use('/daas/v1', daasCors)"));
  assert.ok(daasPolicy.length > 0);
  assert.match(daasPolicy, /origin: '\*'/u);
  assert.match(daasPolicy, /allowedHeaders: \[[^\]]*'x-api-key'/u);
  assert.doesNotMatch(daasPolicy, /credentials\s*:/u);
  assert.ok(server.indexOf("app.use('/daas/v1', daasCors)") < server.indexOf('return restrictedCors(req, res, next)'));
  assert.match(server, /req\.path === '\/daas\/v1' \|\| req\.path\.startsWith\('\/daas\/v1\/'\)/u);
  assert.match(server, /app\.use\('\/daas\/v1', daasRouter\)/u);
});

test('static evidence: entropy uses node crypto and no timestamp or Math.random', () => {
  const security = source('../services/api-key-security.js');
  assert.match(security, /import \{[^}]*randomBytes[^}]*\} from 'node:crypto'/u);
  assert.match(security, /randomBytes\(32\)/u);
  assert.match(security, /randomBytes\(16\)/u);
  assert.doesNotMatch(security, /Math\.random|Date\.now/u);
});

test('static frontend: metadata calls authenticate; secret auto-fill and direct customer key reads are removed', () => {
  const helper = source('../dashboard/src/lib/api-keys.ts');
  assert.match(helper, /getIdToken\(\)/u);
  assert.ok(helper.includes("headers.set('Authorization', `Bearer ${token}`)"));
  for (const page of ['api-keys/page.tsx', 'privacy/page.tsx', 'page.tsx']) {
    let code = source(`../dashboard/src/app/dashboard/${page}`);
    if (page === 'page.tsx') {
      assert.match(code, /<CustomerUsageSummary/u);
      code += source('../dashboard/src/components/reports/CustomerUsageSummary.tsx');
    }
    assert.match(code, page === 'privacy/page.tsx' ? /api\/v1\/account\/deletion/u : /apiKeyRequest/u);
    assert.doesNotMatch(code, /collection\(db, ["']api_keys["']\)/u);
  }
  assert.doesNotMatch(source('../dashboard/src/app/dashboard/api-playground/page.tsx'), /activeKey\.key|api-keys\?userId/u);
  assert.doesNotMatch(source('../dashboard/src/app/dashboard/api-keys/page.tsx'), /apiKey\.key\b/u);
});

test('runtime isolation refuses SDK, network, and production bootstrap imports', async () => {
  for (const specifier of ['node:https', 'node:net', 'node:child_process', 'node:module', 'node:worker_threads',
    'firebase-admin', '../../../database/firebase.js', '../../../server.js']) {
    await assert.rejects(import(specifier));
  }
});

test('runtime isolation also blocks global network APIs', () => {
  assert.throws(() => globalThis['fetch']('https://example.invalid'), /Network disabled/u);
  assert.throws(() => new globalThis.WebSocket('wss://example.invalid'), /Network disabled/u);
});

test('first-party secret transport uses headers, not URL construction or secret logging', () => {
  const playground = source('../dashboard/src/app/dashboard/api-playground/page.tsx');
  const builder = playground.slice(playground.indexOf('const buildApiUrl'), playground.indexOf('const executeRequest'));
  assert.ok(builder.length > 0);
  assert.doesNotMatch(builder, /\b(?:apiKey|generatedKey|newlyGeneratedKey)\b/u);
  assert.match(playground, /'x-api-key': apiKey/u);
  for (const path of ['api-keys/page.tsx', 'products/page.tsx', 'api-playground/page.tsx']) {
    const page = source(`../dashboard/src/app/dashboard/${path}`);
    assert.doesNotMatch(page, /[?&]apiKey=|console\.(?:log|error|warn)\([^\n]*(?:newlyGeneratedKey|generatedKey|\bapiKey\b)/u);
    assert.doesNotMatch(page, /(?:localStorage|sessionStorage)\.setItem/u);
    assert.match(page, /x-api-key/u);
  }
  const server = source('../server.js');
  assert.doesNotMatch(server, /\$\{req\.(?:originalUrl|url)\}/u);
  assert.match(server, /\$\{req\.path\}/u);
});
