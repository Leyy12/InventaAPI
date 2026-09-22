import assert from 'node:assert/strict';
import test from 'node:test';
import { formatValidation, validateReleaseConfig } from '../../scripts/validate-release-config.mjs';

const complete = {
  NODE_ENV: 'production',
  TZ: 'UTC', // Synthetic test choice, not a production timezone decision.
  FIREBASE_AUTH_MODE: 'service_account_env',
  FIREBASE_PROJECT_ID: 'inventa-release',
  FIREBASE_CLIENT_EMAIL: 'release@inventa-release.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nnot-a-real-key\\n-----END PRIVATE KEY-----',
  PAYMONGO_SECRET_KEY: 'sk_live_not-a-real-secret',
  PAYMONGO_WEBHOOK_SECRET: 'whsec_not-a-real-webhook-secret',
  DASHBOARD_URL: 'https://dashboard.inventa-release.com',
  NEXT_PUBLIC_APP_URL: 'https://dashboard.inventa-release.com',
  API_QUOTA_CUTOVER_AT: '2026-01-01T00:00:00.000Z',
  NEXT_PUBLIC_API_URL: 'https://api.inventa-release.com',
  NEXT_PUBLIC_ADMIN_APP_ORIGIN: 'https://admin.inventa-release.com',
  NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1L2M3N4O5P6',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'inventa-release.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'inventa-release',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'inventa-release.firebasestorage.app',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:abcdef123456',
  NEXT_PUBLIC_SUPERADMIN_UID: 'example-admin-uid',
};

test('complete production configuration passes without contacting external services', () => {
  const result = validateReleaseConfig(complete, {
    nodeVersion: 'v22.20.0', now: new Date('2026-09-20T00:00:00.000Z'),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
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
