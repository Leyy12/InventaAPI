import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { formatValidation, validateReleaseConfig } from '../../scripts/validate-release-config.mjs';

const complete = {
  NODE_ENV: 'production',
  FIREBASE_AUTH_MODE: 'service_account_env',
  FIREBASE_PROJECT_ID: 'inventaapi-db',
  FIREBASE_CLIENT_EMAIL: 'release@inventaapi-db.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nnot-a-real-key\\n-----END PRIVATE KEY-----',
  PAYMONGO_MODE: 'live', PAYMONGO_SECRET_KEY: 'sk_live_not-a-real-secret',
  PAYMONGO_WEBHOOK_SECRET: 'whsec_not-a-real-webhook-secret',
  EMAIL_DELIVERY_PROVIDER: 'resend', EMAIL_FROM: 'InventaAPI <no-reply@inventa-release.com>',
  RESEND_API_KEY: 're_not-a-real-resend-key',
  DASHBOARD_URL: 'https://dashboard.inventa-release.com',
  NEXT_PUBLIC_APP_URL: 'https://dashboard.inventa-release.com',
  API_QUOTA_CUTOVER_AT: '2026-01-01T00:00:00.000Z',
  NEXT_PUBLIC_API_URL: 'https://api.inventa-release.com',
  NEXT_PUBLIC_ADMIN_APP_ORIGIN: 'https://admin.inventa-release.com',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1L2M3N4O5P6',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'inventa-release.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'inventaapi-db',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'inventa-release.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:abcdef123456',
  NEXT_PUBLIC_SUPERADMIN_UID: 'example-admin-uid',
};

test('temporary global Live billing validates explicitly and warns about real discounted charges', () => {
  const result = validateReleaseConfig({...complete,PAYMONGO_GLOBAL_TEST_BILLING:'true',
    PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS:'500'}, {scope:'backend',nodeVersion:'v22.20.0'});
  assert.equal(result.ok,true);
  assert.ok(result.warnings.some(issue=>issue.code==='TEMPORARY_LIVE_BILLING'));
});

for (const overrides of [{PAYMONGO_GLOBAL_TEST_BILLING:'true'},
  {PAYMONGO_GLOBAL_TEST_BILLING:'TRUE',PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS:'500'},
  {PAYMONGO_GLOBAL_TEST_BILLING:'true',PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS:'1'},
  {PAYMONGO_GLOBAL_TEST_BILLING:'true',PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS:'500',
    PAYMONGO_MODE:'test',PAYMONGO_SECRET_KEY:'sk_test_syntheticOnly'}]) {
  test(`release validator rejects unsafe temporary billing ${JSON.stringify(overrides)}`,()=>{
    const result=validateReleaseConfig({...complete,...overrides},{scope:'backend',nodeVersion:'v22.20.0'});
    assert.equal(result.ok,false);
    assert.ok(result.errors.some(issue=>issue.name==='PAYMONGO_GLOBAL_TEST_BILLING'));
  });
}

test('complete production configuration passes without contacting external services', () => {
  const result = validateReleaseConfig(complete, {
    nodeVersion: 'v22.20.0', now: new Date('2026-09-20T00:00:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('production backend validation does not require an ambient timezone', () => {
  const result = validateReleaseConfig(complete, { scope: 'backend', nodeVersion: 'v22.20.0' });
  assert.equal(result.ok, true);
  assert.ok(!result.errors.some(error => error.name === 'TZ'));
});

test('missing secrets are distinguished from malformed public configuration', () => {
  const env = { ...complete, PAYMONGO_SECRET_KEY: '', NEXT_PUBLIC_API_URL: 'http://localhost:5002' };
  const result = validateReleaseConfig(env, { nodeVersion: 'v22.20.0' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'MISSING_SECRET' && error.name === 'PAYMONGO_SECRET_KEY'));
  assert.ok(result.errors.some(error => error.code === 'MALFORMED_PUBLIC' && error.name === 'NEXT_PUBLIC_API_URL'));
});

test('formatted output identifies variables but never prints secret values', () => {
  const sentinel = 'sk_live_SUPER_SECRET_SENTINEL';
  const result = validateReleaseConfig({ ...complete, PAYMONGO_SECRET_KEY: sentinel,
    PAYMONGO_WEBHOOK_SECRET: 'REPLACE_WITH_ENDPOINT_SIGNING_SECRET' }, {
    nodeVersion: 'v22.20.0',
  });
  const output = formatValidation(result);
  assert.match(output, /PAYMONGO_WEBHOOK_SECRET/u);
  assert.doesNotMatch(output, /SUPER_SECRET_SENTINEL|whsec_not-a-real-webhook-secret/u);
});

test('cutover timestamp must be canonical UTC', () => {
  for (const value of ['2026-01-01T00:00:00Z', '2026-01-01', 'invalid']) {
    const result = validateReleaseConfig({ ...complete, API_QUOTA_CUTOVER_AT: value }, {
      scope: 'backend', nodeVersion: 'v22.20.0', now: new Date('2026-09-20T00:00:00.000Z'),
    });
    assert.ok(result.errors.some(error => error.name === 'API_QUOTA_CUTOVER_AT'));
  }
});

test('a future coordinated cutover is valid but remains visibly inactive until its instant', () => {
  const result = validateReleaseConfig({ ...complete, API_QUOTA_CUTOVER_AT: '2027-01-01T00:00:00.000Z' }, {
    scope: 'backend', nodeVersion: 'v22.20.0', now: new Date('2026-09-20T00:00:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(warning => warning.code === 'FUTURE_VALUE'
    && warning.name === 'API_QUOTA_CUTOVER_AT'));
});

test('PayMongo webhook secrets are treated as opaque values without an undocumented prefix', () => {
  const result = validateReleaseConfig({ ...complete, PAYMONGO_WEBHOOK_SECRET: 'opaque-endpoint-signing-secret' }, {
    nodeVersion: 'v22.20.0', now: new Date('2026-09-20T00:00:00.000Z'),
  });
  assert.equal(result.ok, true);
});

test('missing cutover is a visible fail-closed warning, not an unsafe-config error', () => {
  const env = { ...complete };
  delete env.API_QUOTA_CUTOVER_AT;
  const result = validateReleaseConfig(env, { scope: 'backend', nodeVersion: 'v22.20.0' });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(warning => warning.name === 'API_QUOTA_CUTOVER_AT'));
});

test('tracked example placeholders cannot satisfy production secret validation', () => {
  const env = {
    ...complete,
    FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nREPLACE_IN_SECRET_STORE\\n-----END PRIVATE KEY-----',
    PAYMONGO_SECRET_KEY: 'sk_live_REPLACE_IN_SECRET_STORE',
  };
  const result = validateReleaseConfig(env, { nodeVersion: 'v22.20.0' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'MALFORMED_SECRET' && error.name === 'FIREBASE_PRIVATE_KEY'));
  assert.ok(result.errors.some(error => error.code === 'MALFORMED_SECRET' && error.name === 'PAYMONGO_SECRET_KEY'));
});

test('wrong Node major fails the runtime contract', () => {
  const result = validateReleaseConfig(complete, { scope: 'functions', nodeVersion: 'v20.20.2' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'RUNTIME'));
});

const validateBackend = (extra = {}, mode = 'production') => validateReleaseConfig({ ...complete, ...extra }, {
  scope: 'backend', mode, nodeVersion: 'v22.20.0',
});

test('only authorized Production LIVE and staging TEST deployment identities pass', () => {
  assert.equal(validateBackend().ok, true);
  assert.equal(validateBackend({ FIREBASE_PROJECT_ID: 'inventaapi-staging', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'inventaapi-staging',
    PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_synthetic' }).ok, true);
  assert.equal(validateBackend({ PAYMONGO_GLOBAL_TEST_BILLING: 'true', PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS: '500' }).ok, true);
  assert.equal(validateBackend({ PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_synthetic' }).ok, false);
});

for (const project of ['inventaapi-not-authorized', 'demo-build-fixture', '', undefined]) {
  test(`deployment rejects unsupported or missing Firebase identity ${String(project)}`, () => {
    const result = validateBackend({ FIREBASE_PROJECT_ID: project });
    assert.equal(result.ok, false); assert.ok(result.errors.some(e => e.name === 'FIREBASE_PROJECT_ID'));
    for (const scope of ['admin', 'dashboard']) assert.equal(validateReleaseConfig({ ...complete, FIREBASE_PROJECT_ID: undefined,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: project }, { scope, nodeVersion: 'v22.20.0' }).ok, false);
  });
}

for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID']) {
  test(`conflicting ${name} fails even when both project identifiers are authorized`, () => {
    const r = validateBackend({ [name]: 'inventaapi-staging' });
    assert.equal(r.ok, false); assert.ok(r.errors.some(e => e.code === 'FIREBASE_PROJECT_CONFLICT' && e.name === name));
    assert.equal(validateBackend({ [name]: 'inventaapi-db' }).ok, true);
  });
}

test('explicit loopback emulator tests remain available without allowing demo identities in deployments', () => {
  const local = { NODE_ENV: 'test', FIREBASE_PROJECT_ID: 'demo-local-validation', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-local-validation',
    PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_synthetic',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' };
  assert.equal(validateBackend(local, 'test').ok, true);
  for (const change of [{ FIRESTORE_EMULATOR_HOST: undefined }, { FIREBASE_AUTH_EMULATOR_HOST: undefined },
    { FIRESTORE_EMULATOR_HOST: 'emulator.external.net:8080' }, { FIREBASE_AUTH_EMULATOR_HOST: '0.0.0.0:9099' },
    { FIRESTORE_EMULATOR_HOST: 'localhost:65536' }, { PAYMONGO_MODE: 'live', PAYMONGO_SECRET_KEY: 'sk_live_synthetic' }]) {
    assert.equal(validateBackend({ ...local, ...change }, 'test').ok, false);
  }
  assert.equal(validateBackend({ ...local, NODE_ENV: 'production' }).ok, false);
  assert.equal(validateBackend({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).ok, false);
});

for (const [name, changes, expected] of [
  ['Production LIVE demo', { PAYMONGO_GLOBAL_TEST_BILLING: 'true', PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS: '500' }, 0],
  ['staging TEST', { FIREBASE_PROJECT_ID: 'inventaapi-staging', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'inventaapi-staging', PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_synthetic' }, 0],
  ['unsupported project', { FIREBASE_PROJECT_ID: 'inventaapi-not-authorized' }, 1],
  ['missing project', { FIREBASE_PROJECT_ID: undefined }, 1],
  ['conflicting identity', { GCLOUD_PROJECT: 'inventaapi-staging' }, 1],
  ['Production TEST', { PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_synthetic' }, 1],
]) test(`validator CLI exit status: ${name}`, () => {
  const inherited = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  const env = Object.fromEntries(Object.entries({ ...inherited, ...complete, ...changes }).filter(([,v]) => v !== undefined));
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../../scripts/validate-release-config.mjs', import.meta.url)), '--scope=backend'],
    { env, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(r.status, expected, r.stdout); assert.match(r.stdout, expected === 0 ? /RESULT: PASS/ : /RESULT: FAIL/);
});
