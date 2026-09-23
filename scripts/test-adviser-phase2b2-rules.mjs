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

const project = 'demo-inventa-adviser-phase2b2';
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
  scratch = mkdtempSync(join(tmpdir(), 'inventa-phase2b2-rules-'));
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


const fields = ['plan', 'apiRequestLimit', 'subscription_status', 'subscriptionExpiresAt', 'subscriptionStartedAt',
  'lastSubscribedAt', 'paymentReference', 'accountState', 'disabled', 'deleted', 'deletedAt',
  'deletionRequested', 'deletionRequestedAt', 'status', 'downgradedAt', 'renewalState'];
for (const field of fields) {
  test(`customer cannot add/change/remove authoritative ${field}`, async () => {
    const profile = { uid: 'customer-a', role: 'Developer', plan: 'Pro', apiRequestLimit: 5000,
      subscription_status: 'active', subscriptionExpiresAt: '2026-10-20', [field]: 'original' };
    assert.equal((await call('PATCH', 'users/customer-a', 'owner', profile)).status, 200);
    assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, { [field]: 'forged' }, field)).status, 403);
    delete profile[field];
    assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, profile)).status, 403);
  });
  test(`signup cannot assert ${field}`, async () => {
    const uid = 'signup-' + field.toLowerCase().replaceAll('_', '-');
    assert.equal((await call('PATCH', 'users/' + uid, mockToken(uid),
      { uid, role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware', [field]: 'forged' })).status, 403);
  });
}
for (const state of ['deleting', 'deleted']) test(`${state} tombstone cannot be changed/deleted/recreated`, async () => {
  const uid = 'blocked-' + state, path = 'users/' + uid, token = mockToken(uid);
  const profile = { uid, role: 'Developer', plan: 'Free', apiRequestLimit: 0, accountState: state };
  assert.equal((await call('PATCH', path, 'owner', profile)).status, 200);
  assert.equal((await call('PATCH', path, token, { fullName: 'Recreate' }, 'fullName')).status, 403);
  for (const actor of [token, tokens.admin]) assert.equal((await call('DELETE', path, actor)).status, 403);
  assert.equal((await call('PATCH', path, token, { uid, role: 'Developer', plan: 'Free', apiRequestLimit: 50 })).status, 403);
});
test('ordinary Free signup and profile changes remain supported', async () => {
  const uid = 'valid-lifecycle';
  assert.equal((await call('PATCH', 'users/' + uid, mockToken(uid), { uid, role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware' })).status, 200);
  assert.equal((await call('PATCH', 'users/' + uid, mockToken(uid), { fullName: 'Safe' }, 'fullName')).status, 200);
});
