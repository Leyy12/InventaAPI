import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import cors from 'cors';
import { frontendReleaseConfig } from '../../../scripts/frontend-release-config.mjs';
import { validateReleaseConfig, validReleaseOrigin, formatValidation } from '../../../scripts/validate-release-config.mjs';

test('Trial warning Functions release requires a verified sender and server-only Resend secret', () => {
  const options = { scope: 'functions', nodeVersion: 'v22.20.0' };
  const missing = validateReleaseConfig({}, options);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some(issue => issue.name === 'TRIAL_WARNING_FROM_EMAIL'));
  assert.ok(missing.errors.some(issue => issue.name === 'RESEND_API_KEY'));
  assert.equal(validateReleaseConfig({ TRIAL_WARNING_FROM_EMAIL: 'trial@verified.test', RESEND_API_KEY: 're_synthetic' }, options).ok, true);
});

const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const frontend = {
  NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.r6b-fixture.net',
  NEXT_PUBLIC_ADMIN_APP_ORIGIN: 'https://admin.r6b-fixture.net',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'synthetic-public-web-key-for-build',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-r6b-validation.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-r6b-validation',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-r6b-validation.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890', NEXT_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:abcdef123456',
};
const backend = { NODE_ENV: 'production', FIREBASE_AUTH_MODE: 'service_account_env',
  FIREBASE_PROJECT_ID: 'demo-r6b-validation', FIREBASE_CLIENT_EMAIL: 'synthetic@demo-r6b-validation.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nSYNTHETIC_NOT_A_KEY\n-----END PRIVATE KEY-----',
  PAYMONGO_MODE: 'live', PAYMONGO_SECRET_KEY: 'sk_live_SYNTHETIC_NOT_A_KEY', PAYMONGO_WEBHOOK_SECRET: 'SYNTHETIC_NOT_A_SECRET',
  DASHBOARD_URL: 'https://customer.r6b-fixture.net', NEXT_PUBLIC_APP_URL: 'https://customer.r6b-fixture.net' };
const options = { scope: 'backend', nodeVersion: 'v22.20.0' };

test('monthly quota cutover is optional fail-closed configuration and validated independently', () => {
  const absent = validateReleaseConfig(backend, options);
  assert.ok(absent.warnings.some(item => item.name === 'FREE_MONTHLY_QUOTA_CUTOVER_AT'));
  const invalid = validateReleaseConfig({ ...backend, FREE_MONTHLY_QUOTA_CUTOVER_AT: 'yesterday' }, options);
  assert.ok(invalid.errors.some(item => item.name === 'FREE_MONTHLY_QUOTA_CUTOVER_AT'));
  const valid = validateReleaseConfig({ ...backend, FREE_MONTHLY_QUOTA_CUTOVER_AT: '2026-09-23T00:00:00.000Z' }, options);
  assert.ok(!valid.errors.some(item => item.name === 'FREE_MONTHLY_QUOTA_CUTOVER_AT'));
});

for (const origin of ['javascript:alert(1)', 'data:text/plain,test', 'file:///tmp', '//evil.example',
  'http://api.r6b-fixture.net', 'https://api.r6b-fixture.net/path', 'https://api.r6b-fixture.net/',
  'https://api.r6b-fixture.net?x=1', 'https://api.r6b-fixture.net#fragment',
  'https://user:password@api.r6b-fixture.net', 'https://[::1]', 'https://localhost',
  'https://127.0.0.1', 'https://127.0.0.2', 'https://localhost.', 'https://api.localhost', 'https://api.example.com.',
  'https://api.example.com', 'https://api.example.invalid', '', ' https://api.r6b-fixture.net']) {
  test('production origin rejects unsafe/noncanonical value: ' + origin, () => {
    assert.equal(validReleaseOrigin(origin, 'production'), false);
    assert.throws(() => frontendReleaseConfig({ ...frontend, NEXT_PUBLIC_API_URL: origin }, 'dashboard', 'v22.20.0'), /NEXT_PUBLIC_API_URL/);
  });
}
for (const scope of ['dashboard', 'admin']) test(scope + ' production rewrites use only the validated API origin', () => {
  const rewrites = frontendReleaseConfig(frontend, scope, 'v22.20.0');
  assert.deepEqual(rewrites, (scope === 'dashboard' ? ['api', 'daas'] : ['api']).map(path => ({
    source: `/${path}/:path*`, destination: `https://api.r6b-fixture.net/${path}/:path*`,
  })));
});
test('production Customer builds require the R5A Admin origin, Admin builds do not consume it', () => {
  const env = { ...frontend }; delete env.NEXT_PUBLIC_ADMIN_APP_ORIGIN;
  assert.throws(() => frontendReleaseConfig(env, 'dashboard', 'v22.20.0'), /NEXT_PUBLIC_ADMIN_APP_ORIGIN/);
  assert.equal(frontendReleaseConfig(env, 'admin', 'v22.20.0').length, 1);
});
test('production build still requires every non-Storage Firebase field', () => {
  for (const scope of ['dashboard', 'admin']) {
    for (const name of Object.keys(frontend).filter(key => key.startsWith('NEXT_PUBLIC_FIREBASE_') && key !== 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET')) {
      const env = { ...frontend }; delete env[name];
      assert.throws(() => frontendReleaseConfig(env, scope, 'v22.20.0'), new RegExp(name));
    }
  }
});

for (const scope of ['dashboard', 'admin']) {
  test(scope + ' production config and rewrites pass without a Storage bucket', () => {
    for (const bucket of [undefined, '']) {
      const env = { ...frontend, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: bucket };
      assert.equal(validateReleaseConfig(env, { scope, nodeVersion: 'v22.20.0' }).ok, true);
      assert.deepEqual(frontendReleaseConfig(env, scope, 'v22.20.0'), frontendReleaseConfig(frontend, scope, 'v22.20.0'));
    }
  });
  test(scope + ' optional bucket accepts existing hostnames and preserves shape validation', () => {
    for (const bucket of ['demo-r6b-validation.firebasestorage.app', 'demo-r6b-validation.appspot.com']) {
      assert.equal(validateReleaseConfig({ ...frontend, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: bucket }, { scope, nodeVersion: 'v22.20.0' }).ok, true);
    }
    for (const bucket of ['   ', 'gs://bucket', 'bucket/path', 'not a hostname']) {
      assert.throws(() => frontendReleaseConfig({ ...frontend, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: bucket }, scope, 'v22.20.0'), /NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET/);
    }
  });
}

for (const app of ['dashboard', 'admin-panel']) test(app + ' Web SDK initialization omits absent bucket and retains Auth/Firestore', () => {
  // Execute the actual initializer with isolated SDK doubles: no SDK/network I/O.
  const source = read(app + '/src/lib/firebase/config.ts')
    .replace(/^import .*;\r?$/gm, '')
    .replace(/^export default .*;\r?$/gm, '')
    .replace(/^export \{.*\};\r?$/gm, '')
    .replace(/\bexport const /g, 'const ');
  for (const bucket of [undefined, '', 'demo-r6b-validation.appspot.com']) {
    const calls = []; let configuration;
    runInNewContext(source, {
      process: { env: { ...frontend, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: bucket } },
      getApps: () => [],
      initializeApp: config => { configuration = config; calls.push('app'); return { options: config }; },
      getAuth: app => { calls.push('auth'); return { app }; },
      getFirestore: () => { calls.push('firestore'); return {}; },
      getStorage: () => { calls.push('existing-storage-handle'); return {}; },
    });
    assert.deepEqual(calls, ['app', 'auth', 'firestore', 'existing-storage-handle']);
    assert.equal(Object.hasOwn(configuration, 'storageBucket'), Boolean(bucket));
    assert.equal(configuration.storageBucket, bucket || undefined);
    assert.equal(configuration.projectId, frontend.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  }
});

test('URL-only release has no active product upload/delete implementation', () => {
  const collect = path => readdirSync(new URL('../../../' + path, import.meta.url), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? collect(path + '/' + entry.name)
      : /\.(tsx?|js|mjs)$/.test(entry.name) ? [path + '/' + entry.name] : []);
  for (const path of [...collect('dashboard/src'), ...collect('admin-panel/src')]) {
    const source = read(path);
    if (path.endsWith('/AdminProductTable.tsx')) continue; // Previously reviewed, unmounted historical component.
    assert.doesNotMatch(source, /\b(?:uploadBytes|uploadBytesResumable|deleteObject)\s*\(/, path);
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()['"][^'"]*AdminProductTable/, path);
  }
  assert.equal(JSON.parse(read('firebase.json')).storage, undefined);
});

test('R6B sequence freezes explicitly before audit/backfill, deploys after migration, and lifts only after acceptance', () => {
  const plan = read('docs/adviser-r6b-release-environment.md').split('## Proposed deployment order — NOT EXECUTED')[1].split('## Rollback compatibility')[0];
  const steps = [...plan.matchAll(/^(\d+)\. ([^\r\n]+)/gm)];
  const titles = ['AUTHORIZE / PREPARE', 'EXTERNAL FREEZE + DRAIN', 'PROTECTED WRITER FREEZE',
    'REQUIRED FIRESTORE INDEXES', 'AUDIT FROZEN CATALOG', 'RESOLVE HISTORICAL CONFLICTS',
    'RESERVATION BACKFILL', 'DEPLOY COMPATIBLE RELEASE STACK WHILE STILL FROZEN',
    'VERIFY ALL-INSTANCE CONVERGENCE', 'SMOKE / E2E WHILE FROZEN', 'ACCEPTANCE', 'LIFT FREEZE'];
  assert.equal(steps.length, titles.length);
  for (const [i, step] of steps.entries()) { assert.equal(Number(step[1]), i + 1); assert.ok(step[2].startsWith(titles[i])); }
  const section = index => plan.slice(steps[index].index, steps[index + 1]?.index ?? plan.length);
  assert.match(section(2), /catalog_control\/writer\.frozen=true/);
  assert.match(section(6), /Independently re-audit[\s\S]*frozen=true/);
  assert.match(section(7), /Customer and Admin frontends[\s\S]*Do not enable normal writes/);
  assert.match(section(9), /frozen rejection|frozen checks/);
  assert.ok(plan.indexOf('catalog_control/writer.frozen=false') > steps[11].index);
  assert.match(plan, /adviser-r3-catalog-import-integrity\.md/);
});

test('migration docs preserve privileged tooling, R3 scale gates, and frozen recovery', () => {
  const doc = read('docs/adviser-r6b-release-environment.md');
  assert.match(doc, /NOT a browser or HTTP\s+endpoint/);
  assert.match(doc, /5,000 products/); assert.match(doc, /400 reservations/);
  assert.match(doc, /global catalog\s+control document/);
  assert.match(doc, /KEEP WRITES FROZEN until coordinated forward-fix\/recovery is verified/);
  const runbook = read('docs/release-runbook.md');
  assert.match(runbook, /catalog_control\/writer\.frozen=true/);
  assert.match(runbook, /single reconciled \[12-step R6B sequence\]/);
  assert.match(runbook, /KEEP WRITES FROZEN/);
});
test('development/test explicitly retain local rewrite support', () => {
  for (const NODE_ENV of ['development', 'test']) assert.deepEqual(frontendReleaseConfig({ NODE_ENV }, 'admin'), [
    { source: '/api/:path*', destination: 'http://localhost:5002/api/:path*' },
  ]);
  assert.throws(() => frontendReleaseConfig({}, 'dashboard', 'v22.20.0'), /RESULT: FAIL/);
});
test('obsolete Superadmin UID is not an authority or release requirement', () => {
  assert.equal(validateReleaseConfig(frontend, { scope: 'dashboard', nodeVersion: 'v22.20.0' }).ok, true);
});
test('Node 20 cannot pass the production frontend build contract', () => {
  assert.throws(() => frontendReleaseConfig(frontend, 'admin', 'v20.20.2'), /NODE_RUNTIME/);
});
test('unsupported root ADC does not receive a false-positive readiness pass', () => {
  const result = validateReleaseConfig({ ...backend, FIREBASE_AUTH_MODE: 'application_default' }, options);
  assert.ok(result.errors.some(issue => issue.code === 'UNSUPPORTED_AUTH_MODE'));
});
test('Customer origins must agree across payment and DaaS links', () => {
  assert.ok(validateReleaseConfig({ ...backend, NEXT_PUBLIC_APP_URL: 'https://other.r6b-fixture.net' }, options).errors
    .some(issue => issue.code === 'ORIGIN_MISMATCH'));
});
test('backend production validation does not depend on reserved ambient TZ', () => {
  assert.equal(validateReleaseConfig(backend, options).ok, true);
  for (const TZ of ['UTC', 'Asia/Manila', 'America/New_York', 'not-a-zone']) {
    assert.equal(validateReleaseConfig({ ...backend, TZ }, options).ok, true);
  }
  for (const name of ['FIREBASE_AUTH_MODE', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY', 'PAYMONGO_MODE', 'PAYMONGO_SECRET_KEY', 'PAYMONGO_WEBHOOK_SECRET',
    'DASHBOARD_URL', 'NEXT_PUBLIC_APP_URL']) {
    const invalid = { ...backend }; delete invalid[name];
    assert.ok(validateReleaseConfig(invalid, options).errors.some(issue => issue.name === name), name);
  }
});
test('redacted failure messages contain variable names, never supplied credentials', () => {
  const text = formatValidation(validateReleaseConfig({ ...backend, FIREBASE_PRIVATE_KEY: 'PRIVATE_SENTINEL',
    PAYMONGO_SECRET_KEY: 'SECRET_SENTINEL' }, options));
  assert.match(text, /FIREBASE_PRIVATE_KEY/); assert.doesNotMatch(text, /PRIVATE_SENTINEL|SECRET_SENTINEL/);
});
test('PayMongo mode contract rejects credentials that mismatch explicit payment mode', () => {
  assert.ok(validateReleaseConfig({ ...backend, PAYMONGO_SECRET_KEY: 'sk_test_SYNTHETIC' }, options).errors.some(issue => issue.name === 'PAYMONGO_SECRET_KEY'));
  assert.ok(validateReleaseConfig({ ...backend, PAYMONGO_MODE: 'test', NODE_ENV: 'test' }, { ...options, mode: 'test' }).errors.some(issue => issue.name === 'PAYMONGO_SECRET_KEY'));
});
test('history index exactly matches account equality and descending timestamp/document order', () => {
  const config = JSON.parse(read('firestore.indexes.json'));
  const matches = config.indexes.filter(index => index.collectionGroup === 'api_telemetry');
  assert.deepEqual(matches, [{ collectionGroup: 'api_telemetry', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'userId', order: 'ASCENDING' }, { fieldPath: 'timestamp', order: 'DESCENDING' }, { fieldPath: '__name__', order: 'DESCENDING' },
  ] }]);
  assert.equal(new Set(config.indexes.map(index => JSON.stringify(index))).size, config.indexes.length);
  assert.deepEqual(config.fieldOverrides, []);
  assert.match(read('services/api-history.js'), /where\('userId', '==', actor.uid\)/);
  assert.match(read('services/admin-traffic.js'), /orderBy\('timestamp', 'desc'\)\s*\.orderBy\(documentId, 'desc'\).limit\(ADMIN_TRAFFIC_LIMIT\)/);
});
test('R6D preserves the production legacy notification index in the ten-index release set', () => {
  const config = JSON.parse(read('firestore.indexes.json'));
  assert.equal(config.indexes.length, 10);
  const matches = config.indexes.filter(index => index.collectionGroup === 'notifications'
    && index.fields.some(field => field.fieldPath === 'user_email'));
  assert.deepEqual(matches, [{ collectionGroup: 'notifications', queryScope: 'COLLECTION', fields: [
    { fieldPath: 'user_email', order: 'ASCENDING' }, { fieldPath: 'is_read', order: 'ASCENDING' },
    { fieldPath: 'created_at', order: 'DESCENDING' }, { fieldPath: '__name__', order: 'DESCENDING' },
  ] }]);
  assert.deepEqual(config.fieldOverrides, []);
  assert.equal(JSON.parse(read('firebase.json')).storage, undefined);
});

test('R6D index set has no semantic duplicates, including implicit document-name ordering', () => {
  const config = JSON.parse(read('firestore.indexes.json'));
  const signatures = config.indexes.map(index => {
    const fields = index.fields.map(field => [field.fieldPath, field.order ?? null, field.arrayConfig ?? null]);
    // Firestore appends __name__ in the final field direction (ASC for a non-directional field).
    if (fields.at(-1)[0] !== '__name__') fields.push(['__name__', fields.at(-1)[1] ?? 'ASCENDING', null]);
    return JSON.stringify([index.collectionGroup, index.queryScope, index.apiScope ?? 'ANY_API',
      index.density ?? 'SPARSE_ALL', fields]);
  });
  assert.equal(new Set(signatures).size, config.indexes.length);
});

test('Firebase deploy config includes rules/indexes/Functions but neither Hosting nor Storage', () => {
  const config = JSON.parse(read('firebase.json'));
  assert.deepEqual(config.firestore, { rules: 'firestore.rules', indexes: 'firestore.indexes.json' });
  assert.equal(config.functions[0].source, 'functions'); assert.equal(config.storage, undefined); assert.equal(config.hosting, undefined);
  assert.equal(JSON.parse(read('functions/package.json')).engines.node, '22'); assert.equal(read('.nvmrc').trim(), '22');
});
test('frontend build configs invoke release guard and preserve repository resolution root', () => {
  for (const [app, scope] of [['dashboard', 'dashboard'], ['admin-panel', 'admin']]) {
    const config = read(app + '/next.config.ts');
    assert.ok(config.includes(`}, '${scope}')`));
    assert.match(config, /phase === PHASE_DEVELOPMENT_SERVER \? 'development' : 'production'/);
    assert.match(config, /root: resolve\(process.cwd\(\), '\.\.'\)/);
    assert.doesNotMatch(config, /destination: 'http:\/\/localhost|\benv\s*:/);
  }
});
test('shared browser dependency closure exists and contains only pure shared source', () => {
  for (const path of ['services/reporting.js', 'services/reporting.d.ts', 'services/product-contract.js',
    'services/auth-navigation.ts', 'functions/subscription-lifecycle.mjs']) {
    assert.ok(existsSync(new URL('../../../' + path, import.meta.url)));
    assert.doesNotMatch(read(path), /from ['"]firebase-admin|process\.env|FIREBASE_PRIVATE_KEY|PAYMONGO_SECRET_KEY/);
  }
});
test('existing CORS distinguishes DaaS wildcard from application bearer preflight and denies unrelated origins', () => {
  const source = read('server.js'); const layers = [];
  const block = source.slice(source.indexOf('const allowedOrigins ='), source.indexOf('// 3. Express Rate Limit'));
  runInNewContext(block, { cors, app: { use: (...args) => layers.push(args) }, console: { warn() {} } });
  assert.equal(layers[0][0], '/daas/v1');
  const check = (origin, path, method = 'GET') => {
    const headers = {}; let error, ended = false;
    const req = { path, method, headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } };
    const res = { setHeader: (key, val) => { headers[key] = val; }, getHeader: key => headers[key], end: () => { ended = true; } };
    const next = value => { error = value; };
    if (path.startsWith('/daas/v1/')) layers[0][1](req, res, next);
    if (!error && !ended) layers[1][0](req, res, next);
    return { headers, error };
  };
  const admin = check('http://localhost:3001', '/api/v1/admin/traffic', 'OPTIONS');
  assert.equal(admin.headers['Access-Control-Allow-Origin'], 'http://localhost:3001');
  assert.match(admin.headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.ok(check('https://unrelated.invalid', '/api/v1/admin/traffic').error);
  assert.equal(check('https://unrelated.invalid', '/daas/v1/catalog').headers['Access-Control-Allow-Origin'], '*');
  // Existing broad pattern is evidence to classify, not an approved production list.
  assert.equal(check('https://untrusted.vercel.app', '/api/v1/admin/traffic').error, undefined);
});
