import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firebaseCredentialMode, initializeStagingAdc } from '../../database/firebase-credentials.js';
import { validateReleaseConfig, formatValidation } from '../../scripts/validate-release-config.mjs';
import { memoryFirestore } from '../adviser/r2a/memory-firestore.mjs';

const adcEnv = { FIREBASE_CREDENTIAL_MODE: 'adc', FIREBASE_PROJECT_ID: 'inventaapi-staging' };
const certificate = { FIREBASE_PROJECT_ID: 'synthetic-production', FIREBASE_CLIENT_EMAIL: 'synthetic@synthetic-production.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: 'synthetic\\nprivate-key' };
const privateSentinel = 'SYNTHETIC_PRIVATE_TOKEN_MUST_NOT_APPEAR';
const read = relative => readFileSync(new URL('../../' + relative, import.meta.url), 'utf8');
function sdkFixture({ tokenFailure = false, initFailure = false, providerFailure = false, firestoreFailure = false, storageFailure = false, localFailure = false } = {}) {
  const apps = [], calls = { initialize: [], cert: [], token: 0, local: [], clients: [] }, logs = [];
  const store = memoryFirestore({ 'users/customer': { role: 'Customer', plan: 'Free', businessSegment: 'Grocery' },
    'users/other': { role: 'Customer' }, 'users/admin': { role: 'Admin' } });
  const credential = { async getAccessToken() { calls.token++; if (tokenFailure) throw Error(privateSentinel);
    return { access_token: privateSentinel, expires_in: 3600 }; } };
  const getApps = () => apps;
  const initializeApp = options => { if (initFailure) throw Error(privateSentinel);
    const app = { name: '[DEFAULT]', options }; apps.push(app); calls.initialize.push(options); return app; };
  const applicationDefault = () => { if (providerFailure) throw Error(privateSentinel); return credential; };
  const cert = value => { calls.cert.push(value); return { certificate: value }; };
  const defaultApp = service => { const app = apps.find(item => item.name === '[DEFAULT]'); assert.ok(app, service + ' requires initialized default app');
    calls.clients.push({ service, app }); return app; };
  const getFirestore = () => { defaultApp('Firestore'); if (firestoreFailure) throw Error(privateSentinel); return store; };
  const getAuth = () => { defaultApp('Auth'); return { async verifyIdToken(token, revoked) {
    assert.equal(revoked, true); if (!['customer', 'other', 'admin'].includes(token)) throw Error(privateSentinel); return { uid: token }; } }; };
  const objects = new Map();
  const getStorage = () => { defaultApp('Storage'); if (storageFailure) throw Error(privateSentinel);
    return { bucket(name) { assert.equal(name, 'synthetic-private-bucket'); return {
      async getMetadata() { return [{ name, projectNumber: '123', iamConfiguration: {
        uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' } }]; },
      file(objectPath) { return { async save(bytes, options) { assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
        if (objects.has(objectPath)) throw Object.assign(Error('exists'), { code: 412 }); objects.set(objectPath, Buffer.from(bytes)); },
        async download() { assert.ok(objects.has(objectPath)); return [objects.get(objectPath)]; }, async getMetadata() { return [{ metadata: {} }]; } }; },
    }; } }; };
  const loadLocalModule = async name => ({ module: { createRequire: () => filename => { calls.local.push(filename);
    if (localFailure) throw Error(privateSentinel);
    return { project_id: 'synthetic-local', private_key: privateSentinel }; } }, path: { default: path }, url: { fileURLToPath } })[name];
  async function initialize(env) {
    const source = read('database/firebase.js').replace(/^import .*;\r?\n/gmu, '')
      .replaceAll('import.meta.url', 'sourceUrl').replaceAll("await import('", "await loadLocalModule('")
      .replace('export const db', 'const db');
    return runInNewContext(`(async () => {${source}\nreturn db;})()`, { process: { env, exit() { throw Error('Synthetic process exit'); } },
      initializeApp, applicationDefault, cert, getApps, getFirestore, FieldValue: {}, firebaseCredentialMode, initializeStagingAdc,
      loadLocalModule, sourceUrl: new URL('../../database/firebase.js', import.meta.url).href,
      console: { log: (...values) => logs.push(values.join(' ')), error: (...values) => logs.push(values.join(' ')) } });
  }
  return { apps, calls, logs, store, credential, initializeApp, applicationDefault, getApps, getFirestore, getAuth, getStorage, initialize };
}
test('unchanged certificate mode normalizes escaped newlines and never selects ADC/local credentials', async () => {
  const sdk = sdkFixture(); await sdk.initialize(certificate);
  assert.equal(sdk.calls.initialize.length, 1); assert.equal(sdk.calls.cert[0].privateKey, 'synthetic\nprivate-key');
  assert.equal(sdk.calls.cert[0].projectId, certificate.FIREBASE_PROJECT_ID); assert.equal(sdk.calls.token, 0); assert.deepEqual(sdk.calls.local, []);
});
test('unchanged local mode reads the same local credential path through a mocked loader', async () => {
  const sdk = sdkFixture(); await sdk.initialize({});
  assert.equal(sdk.calls.local.length, 1); assert.ok(sdk.calls.local[0].endsWith('service-account.json'));
  assert.equal(sdk.calls.cert[0].project_id, 'synthetic-local'); assert.equal(sdk.calls.token, 0);
  assert.doesNotMatch(sdk.logs.join(' '), new RegExp(privateSentinel));
});
test('legacy singleton remains reusable without a new credential requirement', async () => {
  const sdk = sdkFixture(); await sdk.initialize(certificate); await sdk.initialize({});
  assert.equal(sdk.calls.initialize.length, 1); assert.equal(sdk.calls.local.length, 0);
});
test('explicit ADC initializes the default staging app, preflights credentials and reuses singleton', async () => {
  const sdk = sdkFixture(); await sdk.initialize(adcEnv); await sdk.initialize(adcEnv);
  assert.equal(sdk.apps.length, 1); assert.equal(sdk.calls.initialize.length, 1);
  assert.equal(sdk.apps[0].options.projectId, 'inventaapi-staging'); assert.equal(sdk.apps[0].options.credential, sdk.credential);
  assert.equal(sdk.calls.token, 2); assert.deepEqual(sdk.calls.cert, []); assert.deepEqual(sdk.calls.local, []);
  assert.doesNotMatch(sdk.logs.join(' '), new RegExp(privateSentinel));
});
test('ADC app exists before asynchronous credential preflight so service-module initialization remains ordered', async () => {
  const sdk = sdkFixture(); let finish;
  sdk.credential.getAccessToken = () => new Promise(resolve => { finish = resolve; });
  const startup = sdk.initialize(adcEnv);
  assert.equal(sdk.apps.length, 1); sdk.getFirestore(); sdk.getAuth(); sdk.getStorage();
  assert.ok(sdk.calls.clients.every(client => client.app === sdk.apps[0]));
  finish({ access_token: privateSentinel, expires_in: 3600 }); await startup;
});
test('concurrent ADC initialization reuses the same default app', async () => {
  const sdk = sdkFixture(); await Promise.all([sdk.initialize(adcEnv), sdk.initialize(adcEnv)]);
  assert.equal(sdk.apps.length, 1); assert.equal(sdk.calls.initialize.length, 1);
});
test('certificate SDK failure is sanitized without selecting another credential path', async () => {
  const sdk = sdkFixture({ initFailure: true });
  await assert.rejects(sdk.initialize(certificate), /Certificate initialization failed/);
  assert.deepEqual(sdk.calls.local, []); assert.equal(sdk.calls.token, 0);
});
test('missing local credential file preserves failure behavior without logging its contents', async () => {
  const sdk = sdkFixture({ localFailure: true }); await assert.rejects(sdk.initialize({}), /Synthetic process exit/);
  assert.deepEqual(sdk.calls.initialize, []); assert.match(sdk.logs.join(' '), /No credentials found/);
  assert.doesNotMatch(sdk.logs.join(' '), new RegExp(privateSentinel));
});
for (const token of [null, { access_token: '', expires_in: 3600 }, { access_token: privateSentinel, expires_in: 0 }])
  test('invalid ADC token receipt fails startup without exposing tokens', async () => {
    const sdk = sdkFixture(); sdk.credential.getAccessToken = async () => token;
    await assert.rejects(sdk.initialize(adcEnv), /Staging ADC initialization failed/);
    assert.doesNotMatch(sdk.logs.join(' '), new RegExp(privateSentinel));
  });
for (const [name, override] of [['missing project', { FIREBASE_PROJECT_ID: undefined }], ['empty project', { FIREBASE_PROJECT_ID: '' }],
  ['malformed project', { FIREBASE_PROJECT_ID: 'bad/project' }], ['Production project', { FIREBASE_PROJECT_ID: 'inventaapi-db' }],
  ['different staging project', { FIREBASE_PROJECT_ID: 'other-staging' }], ['certificate email', { FIREBASE_CLIENT_EMAIL: privateSentinel }],
  ['private key', { FIREBASE_PRIVATE_KEY: privateSentinel }], ['credential file', { GOOGLE_APPLICATION_CREDENTIALS: privateSentinel }],
  ['conflicting selector', { FIREBASE_AUTH_MODE: 'service_account_env' }], ['ambient project', { GCLOUD_PROJECT: 'inventaapi-db' }],
  ['other ambient project', { GOOGLE_CLOUD_PROJECT: 'inventaapi-db' }], ['unknown mode', { FIREBASE_CREDENTIAL_MODE: privateSentinel }]]) {
  test(`ADC rejects ${name} before initializing or accessing a credential provider`, async () => {
    const sdk = sdkFixture(); await assert.rejects(sdk.initialize({ ...adcEnv, ...override }), error => {
      assert.doesNotMatch(error.message, new RegExp(privateSentinel)); return true;
    }); assert.deepEqual(sdk.calls.initialize, []); assert.deepEqual(sdk.calls.cert, []);
    assert.equal(sdk.calls.token, 0); assert.deepEqual(sdk.calls.local, []);
  });
}
for (const failure of ['providerFailure', 'tokenFailure', 'initFailure', 'firestoreFailure']) test(`${failure} fails safely with no credential fallback`, async () => {
  const sdk = sdkFixture({ [failure]: true }); await assert.rejects(sdk.initialize(adcEnv), error => {
    assert.match(error.message, /Staging.*initialization failed/); assert.doesNotMatch(error.message, new RegExp(privateSentinel)); return true;
  }); assert.deepEqual(sdk.calls.cert, []); assert.deepEqual(sdk.calls.local, []); assert.doesNotMatch(sdk.logs.join(' '), new RegExp(privateSentinel));
});
test('ADC availability timeout is bounded and sanitized', async () => {
  const sdk = sdkFixture(); sdk.credential.getAccessToken = () => new Promise(() => {});
  await assert.rejects(initializeStagingAdc({ env: adcEnv, ...sdk, timeoutMs: 5 }), /Staging ADC initialization failed/);
});
for (const kind of ['Production app', 'named app', 'certificate app', 'multiple apps']) test(`ADC rejects pre-existing ${kind}`, async () => {
  const sdk = sdkFixture(); sdk.apps.push({ name: kind === 'named app' ? 'other' : '[DEFAULT]',
    options: { projectId: kind === 'Production app' ? 'inventaapi-db' : 'inventaapi-staging',
      credential: kind === 'certificate app' ? {} : sdk.credential } });
  if (kind === 'multiple apps') sdk.apps.push({ name: 'other', options: {} });
  await assert.rejects(sdk.initialize(adcEnv), /Staging ADC initialization failed/); assert.equal(sdk.calls.initialize.length, 0);
});

const release = { NODE_ENV: 'production', PAYMONGO_MODE: 'test', PAYMONGO_SECRET_KEY: 'sk_test_synthetic',
  PAYMONGO_WEBHOOK_SECRET: 'synthetic-webhook', DASHBOARD_URL: 'https://192.0.2.1', NEXT_PUBLIC_APP_URL: 'https://192.0.2.1',
  EMAIL_DELIVERY_PROVIDER: 'smtp', EMAIL_FROM: 'signup@inventa-staging.net', SMTP_HOST: 'smtp.inventa-staging.net',
  SMTP_USER: 'signup@inventa-staging.net', SMTP_PASS: 'synthetic-app-password' };
test('release preflight rejects Production/conflicting ADC configuration without revealing supplied values', () => {
  for (const override of [{ FIREBASE_PROJECT_ID: 'inventaapi-db' }, { FIREBASE_PRIVATE_KEY: privateSentinel },
    { GOOGLE_APPLICATION_CREDENTIALS: privateSentinel }, { FIREBASE_CREDENTIAL_MODE: privateSentinel }]) {
    const result = validateReleaseConfig({ ...release, ...adcEnv, ...override }, { scope: 'backend', nodeVersion: 'v22.20.0' });
    assert.equal(result.ok, false); assert.doesNotMatch(formatValidation(result), new RegExp(privateSentinel));
  }
});
