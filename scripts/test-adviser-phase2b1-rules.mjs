// Real Firestore Rules evaluation, using only a cached emulator and localhost.
// No Firebase SDK/CLI, production configuration, credentials, or installation.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmdirSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = 'demo-inventa-adviser-phase2b1';
const jar = join(homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
const rules = fileURLToPath(new URL('../firestore.rules', import.meta.url));
const prefix = `/v1/projects/${project}/databases/(default)/documents/`;
let emulator, port, scratch, startup = '', processError;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function valueField(value) {
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(valueField) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, valueField(val)])) } };
  return { stringValue: value };
}

function call(method, document, token, data, updateField = null) {
  // Caller cannot supply a host, project, URL, or redirect destination.
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  assert.match(document, /^[a-z_]+(?:\/[a-z0-9_-]+)?$/u);
  if (updateField) assert.match(updateField, /^[A-Za-z_]+$/u);
  return new Promise((resolve, reject) => {
    const path = prefix + document + (updateField ? `?updateMask.fieldPaths=${updateField}` : '');
    const req = request({ hostname: '127.0.0.1', port, path, method,
      agent: false, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', value => { body += value; });
      res.on('end', () => resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local emulator request timed out')));
    req.on('error', reject);
    req.end(data ? JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([name, value]) => [name, valueField(value)])) }) : undefined);
  });
}

// Emulator-only unsigned ID tokens; never accepted by production Firebase.
// Token shape follows firebase-js-sdk/packages/util/src/emulator.ts.
function mockToken(uid) {
  const iat = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid,
    aud: project, iss: `https://securetoken.google.com/${project}`, iat, exp: iat + 3600, auth_time: iat,
    firebase: { sign_in_provider: 'custom', identities: {} },
  })}.`;
}

const tokens = { customer: mockToken('customer-a'), stranger: mockToken('customer-b'), anonymous: null, admin: mockToken('administrator') };

before(async () => {
  assert.ok(existsSync(jar), `Required cached emulator is missing: ${jar}. No automatic download is permitted.`);
  assert.ok(existsSync(rules));
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  scratch = mkdtempSync(join(tmpdir(), 'inventa-phase2b1-rules-'));
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'JAVA_HOME']
    .filter(name => process.env[name]).map(name => [name, process.env[name]]));
  // No NODE_OPTIONS, JAVA_TOOL_OPTIONS, proxy settings, ADC, or real-project env.
  emulator = spawn('java', ['-jar', jar, '--host', '127.0.0.1', '--port', String(port),
    '--webchannel_port', '0', '--project_id', project, '--single_project_mode', 'true',
    '--single_project_mode_error', 'true', '--rules', rules],
  { cwd: scratch, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  emulator.on('error', error => { processError = error; });
  for (const stream of [emulator.stdout, emulator.stderr]) stream.on('data', chunk => { startup = (startup + chunk).slice(-12000); });
  const deadline = Date.now() + 30000;
  while (!startup.includes('Dev App Server is now running')) {
    if (processError) throw processError;
    if (emulator.exitCode !== null || Date.now() > deadline) throw new Error(`Isolated emulator did not start: ${startup}`);
    await wait(100);
  }
  console.log(`Rules emulator: ${project}, 127.0.0.1:${port}, cached v1.22.0; no external endpoints.`);
  // The emulator's fixed 'owner' bypass is ONLY for synthetic fixture seeding.
  // Every assertion below uses a mock customer/admin ID token or no token.
  for (const [path, data] of Object.entries({
    'users/customer-a': { uid: 'customer-a', role: 'Developer', plan: 'Free', apiRequestLimit: 50 },
    'users/customer-b': { uid: 'customer-b', role: 'Developer', plan: 'Free', apiRequestLimit: 50 },
    'users/administrator': { uid: 'administrator', role: 'Admin', plan: 'Enterprise', apiRequestLimit: 50 },
    'api_keys/key-a': { userId: 'customer-a', status: 'revoked', credentialHash: 'synthetic-hash', requestsUsed: 4 },
    'api_keys/key-b': { userId: 'customer-b', status: 'active', key: 'synthetic-legacy-key' },
    'account_api_usage/customer-a': { window: '2026-09-18', used: 4 },
    'account_api_usage/customer-b': { window: '2026-09-18', used: 3 },
  })) assert.equal((await call('PATCH', path, 'owner', data)).status, 200, `seed ${path}`);
}, { timeout: 40000 });

after(async () => {
  if (emulator && emulator.exitCode === null && emulator.pid) {
    await new Promise(resolve => { emulator.once('exit', resolve); emulator.kill(); });
  }
  // Remove only this empty generated directory. Keep unexpected diagnostic files.
  if (scratch) { try { rmdirSync(scratch); } catch { /* Preserve emulator diagnostics. */ } }
});

const paymentCollections = ['payment_orders', 'payment_sessions', 'payment_checkout_locks', 'payment_events'];
for (const role of ['customer', 'stranger', 'anonymous', 'admin']) {
  for (const collection of paymentCollections) test(`${role}: ${collection} denies reads and every client write`, async () => {
    const path = `${collection}/existing`;
    assert.equal((await call('PATCH', path, 'owner', { userId: 'customer-a', state: 'pending' })).status, 200);
    for (const document of [path, collection]) assert.equal((await call('GET', document, tokens[role])).status, 403);
    assert.equal((await call('PATCH', `${collection}/forged`, tokens[role], { userId: 'customer-a', state: 'processed' })).status, 403);
    assert.equal((await call('PATCH', path, tokens[role], { userId: 'customer-b', amount: 1 })).status, 403);
    assert.equal((await call('DELETE', path, tokens[role])).status, 403);
  });
  test(`${role}: transaction history cannot be written`, async () => {
    assert.equal((await call('PATCH', 'transactions/paid', 'owner', { userId: 'customer-a', status: 'paid' })).status, 200);
    assert.equal((await call('PATCH', 'transactions/forged', tokens[role], { userId: 'customer-a', status: 'paid' })).status, 403);
    assert.equal((await call('PATCH', 'transactions/paid', tokens[role], { userId: 'customer-a', status: 'paid' })).status, 403);
    assert.equal((await call('DELETE', 'transactions/paid', tokens[role])).status, 403);
  });
}
const protectedFields = ['plan', 'apiRequestLimit', 'subscription_status', 'subscriptionExpiresAt',
  'lastSubscribedAt', 'subscriptionStartedAt', 'paymentReference'];
for (const field of protectedFields) {
  test(`customer cannot add/change/remove entitlement ${field}`, async () => {
    const original = { uid: 'customer-a', role: 'Developer', plan: 'Pro', apiRequestLimit: 5000,
      subscription_status: 'active', subscriptionExpiresAt: '2026-10-20', lastSubscribedAt: '2026-09-20',
      subscriptionStartedAt: '2026-09-20', paymentReference: 'pay_synthetic' };
    assert.equal((await call('PATCH', 'users/customer-a', 'owner', original)).status, 200);
    assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, { [field]: 'forged' }, field)).status, 403);
    const removed = { ...original }; delete removed[field];
    assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, removed)).status, 403);
  });
  test(`signup cannot forge entitlement ${field}`, async () => {
    const uid = `signup-${field.toLowerCase().replaceAll('_', '-')}`;
    const profile = { uid, role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware' };
    assert.equal((await call('PATCH', `users/${uid}`, mockToken(uid), { ...profile, [field]: 'forged' })).status, 403);
  });
}
test('valid Free signup and ordinary profile updates remain allowed', async () => {
  const uid = 'signup-valid';
  assert.equal((await call('PATCH', `users/${uid}`, mockToken(uid), { uid, role: 'Developer', plan: 'Free',
    apiRequestLimit: 50, businessSegment: 'Hardware', subscription_status: 'inactive' })).status, 200);
  assert.equal((await call('PATCH', `users/${uid}`, mockToken(uid), { fullName: 'Example' }, 'fullName')).status, 200);
});
test('transaction history is private to owner/Admin; never another Customer', async () => {
  assert.equal((await call('PATCH', 'transactions/history', 'owner', { userId: 'customer-a', status: 'paid' })).status, 200);
  assert.equal((await call('GET', 'transactions/history', tokens.customer)).status, 200);
  assert.equal((await call('GET', 'transactions/history', tokens.admin)).status, 200);
  assert.equal((await call('GET', 'transactions/history', tokens.stranger)).status, 403);
});
