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

const project = 'demo-inventa-adviser-phase2a';
const jar = join(homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
const rules = fileURLToPath(new URL('../firestore.rules', import.meta.url));
const prefix = `/v1/projects/${project}/databases/(default)/documents/`;
let emulator, port, scratch, startup = '', processError;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function valueField(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(valueField) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, valueField(val)])) } };
  return { stringValue: value };
}

function call(method, document, token, data, updateField = null) {
  // Caller cannot supply a host, project, URL, or redirect destination.
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
  assert.match(document, /^[a-z_]+(?:\/[a-z0-9_-]+)?$/u);
  if (updateField) assert.match(updateField, /^[A-Za-z]+$/u);
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
  scratch = mkdtempSync(join(tmpdir(), 'inventa-phase2a-rules-'));
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
    'users/customer-a': { uid: 'customer-a', role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware' },
    'users/customer-b': { uid: 'customer-b', role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Hardware' },
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

test('control: customer identity is recognized and can read its own safe profile', async () => {
  assert.equal((await call('GET', 'users/customer-a', tokens.customer)).status, 200);
  assert.equal((await call('GET', 'users/customer-b', tokens.customer)).status, 403);
});

for (const role of ['customer', 'stranger', 'anonymous', 'admin']) {
  test(`R5C ${role}: daily-generation markers are server-only, including deletion`, async () => {
    const path = 'api_key_generation_days/customer-a_2026-09-22';
    assert.equal((await call('PATCH', path, 'owner', { userId: 'customer-a', window: '2026-09-22' })).status, 200);
    assert.equal((await call('GET', path, tokens[role])).status, 403);
    assert.equal((await call('GET', 'api_key_generation_days', tokens[role])).status, 403);
    assert.equal((await call('PATCH', path, tokens[role], { window: '2099-01-01' })).status, 403);
    assert.equal((await call('PATCH', 'api_key_generation_days/forged', tokens[role], { userId: 'customer-a' })).status, 403);
    assert.equal((await call('DELETE', path, tokens[role])).status, 403);
  });
}

for (const role of ['customer', 'admin']) {
  test(`R6A ${role}: direct telemetry get/list/create/update/delete remain denied`, async () => {
    assert.equal((await call('PATCH', 'api_telemetry/r6a-existing', 'owner', { statusCode: 200 })).status, 200);
    assert.equal((await call('GET', 'api_telemetry', tokens[role])).status, 403);
    assert.equal((await call('GET', 'api_telemetry/r6a-existing', tokens[role])).status, 403);
    assert.equal((await call('PATCH', 'api_telemetry/r6a-new', tokens[role], { statusCode: 200 })).status, 403);
    assert.equal((await call('PATCH', 'api_telemetry/r6a-existing', tokens[role], { statusCode: 500 })).status, 403);
    assert.equal((await call('DELETE', 'api_telemetry/r6a-existing', tokens[role])).status, 403);
  });
}

for (const role of ['customer', 'stranger', 'anonymous']) {
  test(`${role}: key reads/listing, creation, and deletion are denied`, async () => {
    for (const path of ['api_keys/key-a', 'api_keys/key-b', 'api_keys']) {
      assert.equal((await call('GET', path, tokens[role])).status, 403);
    }
    assert.equal((await call('PATCH', 'api_keys/forged', tokens[role], { userId: 'customer-a', status: 'active' })).status, 403);
    assert.equal((await call('DELETE', 'api_keys/key-a', tokens[role])).status, 403);
    // R5B history is backend-mediated; no Customer can list, read, forge or
    // delete telemetry, even by naming their own account in the payload.
    assert.equal((await call('GET', 'api_telemetry', tokens[role])).status, 403);
    assert.equal((await call('GET', 'api_telemetry/request-a', tokens[role])).status, 403);
    assert.equal((await call('PATCH', 'api_telemetry/request-a', tokens[role], { userId: 'customer-a', statusCode: 200 })).status, 403);
    assert.equal((await call('DELETE', 'api_telemetry/request-a', tokens[role])).status, 403);
  });
  for (const field of ['key', 'credentialHash', 'credentialVersion', 'userId', 'status', 'linkedProductIds',
    'linkedProducts', 'linkedVariantSelections', 'plan', 'requestLimit', 'requestsUsed', 'resetAt', 'expiresAt']) {
    test(`${role}: cannot mutate api_keys.${field}`, async () => {
      const values = { key: 'daas_forged', credentialHash: 'a'.repeat(64), credentialVersion: 2,
        userId: 'customer-b', status: 'active', linkedProductIds: ['rice'], linkedProducts: [{ id: 'rice' }],
        linkedVariantSelections: { rice: ['plain|1kg'] }, plan: 'Enterprise', requestLimit: 99999,
        requestsUsed: 0, resetAt: '2099-01-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' };
      const response = await call('PATCH', 'api_keys/key-a', tokens[role], { [field]: values[field] }, field);
      assert.equal(response.status, 403);
      assert.equal(response.body.error.status, 'PERMISSION_DENIED');
    });
  }
  test(`${role}: cannot read/reset/delete/create own or cross-account quota`, async () => {
    for (const path of ['account_api_usage/customer-a', 'account_api_usage/customer-b', 'account_api_usage/new-account']) {
      assert.equal((await call('GET', path, tokens[role])).status, 403);
      assert.equal((await call('PATCH', path, tokens[role], { window: '2099-01-01', used: 0, holdUntil: 'forged' })).status, 403);
      assert.equal((await call('DELETE', path, tokens[role])).status, 403);
    }
  });
}

test('Admin ID-token access retains key/quota reads, but not client writes', async () => {
  for (const path of ['api_keys/key-a', 'api_keys/key-b', 'api_keys', 'account_api_usage/customer-a', 'account_api_usage']) {
    assert.equal((await call('GET', path, tokens.admin)).status, 200);
  }
  for (const path of ['api_keys/key-a', 'account_api_usage/customer-a']) {
    assert.equal((await call('PATCH', path, tokens.admin, { status: 'active', used: 0 })).status, 403);
    assert.equal((await call('DELETE', path, tokens.admin)).status, 403);
  }
});

test('customer cannot delete/recreate its account or change authoritative plan/quota', async () => {
  assert.equal((await call('DELETE', 'users/customer-a', tokens.customer)).status, 403);
  for (const override of [{ plan: 'Enterprise' }, { apiRequestLimit: 999999 }, { role: 'Admin' }]) {
    assert.equal((await call('PATCH', 'users/customer-a', tokens.customer,
      { uid: 'customer-a', role: 'Developer', plan: 'Free', apiRequestLimit: 50, ...override })).status, 403);
  }
});

test('profile createdAt is writable but Firestore creation metadata remains unchanged', async () => {
  const original = await call('GET', 'users/customer-a', tokens.customer);
  assert.equal(original.status, 200);
  const forged = '2099-01-01T00:00:00.000Z';
  assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, { createdAt: forged }, 'createdAt')).status, 200);
  const updated = await call('GET', 'users/customer-a', tokens.customer);
  assert.equal(updated.body.fields.createdAt.stringValue, forged);
  assert.equal(updated.body.createTime, original.body.createTime);
});

for (const field of ['businessSegment', 'hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt',
  'trialExpiredAt', 'trialUsed', 'trialQuota', 'effectivePlan', 'trialExhaustedAt']) {
  test('Trial/ownership authority is not client-writable: ' + field, async () => {
    const values = { businessSegment: 'Grocery', hasUsedFreeTrial: true, trialVersion: 1, trialStartedAt: '2026-09-23T00:00:00.000Z',
      trialExpiresAt: '2026-09-30T00:00:00.000Z', trialExpiredAt: '', trialUsed: 0, trialQuota: 500, effectivePlan: 'Pro Trial', trialExhaustedAt: '2026-09-24T00:00:00.000Z' };
    assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, { [field]: values[field] }, field)).status, 403);
    if (field !== 'businessSegment') {
      const uid = 'signup-' + field.toLowerCase();
      assert.equal((await call('PATCH', 'users/' + uid, mockToken(uid), { uid, role: 'Developer', plan: 'Free',
        apiRequestLimit: 50, businessSegment: 'Hardware', [field]: values[field] })).status, 403);
    }
  });
}
test('canonical signup and harmless profile updates still work; mismatched ownership context denied', async () => {
  for (const segment of ['Grocery', 'Pharmacy', 'Hardware']) {
    const uid = 'signup-' + segment.toLowerCase();
    assert.equal((await call('PATCH', 'users/' + uid, mockToken(uid), { uid, role: 'Developer', plan: 'Free',
      apiRequestLimit: 50, businessSegment: segment, selectedSegment: segment })).status, 200);
  }
  assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, { fullName: 'Safe Name' }, 'fullName')).status, 200);
  assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, { selectedSegment: 'Hardware' }, 'selectedSegment')).status, 200);
  for (const segment of ['Grocery', 'Pharmacy', 'All', 'hardware']) {
    assert.equal((await call('PATCH', 'users/customer-a', tokens.customer, { selectedSegment: segment }, 'selectedSegment')).status, 403);
  }
});
test('active trial cannot switch ownership; paid account retains segment choice', async () => {
  assert.equal((await call('PATCH', 'users/trial-customer', 'owner', { uid: 'trial-customer', role: 'Developer', plan: 'Free',
    apiRequestLimit: 50, businessSegment: 'Hardware', hasUsedFreeTrial: true, trialVersion: 1 })).status, 200);
  assert.equal((await call('PATCH', 'users/trial-customer', mockToken('trial-customer'), { selectedSegment: 'Grocery' }, 'selectedSegment')).status, 403);
  assert.equal((await call('PATCH', 'users/trial-customer', mockToken('trial-customer'), { selectedSegment: 'Hardware' }, 'selectedSegment')).status, 200);
  assert.equal((await call('PATCH', 'users/paid-customer', 'owner', { uid: 'paid-customer', role: 'Developer', plan: 'Pro',
    apiRequestLimit: 5000, businessSegment: 'Hardware' })).status, 200);
  assert.equal((await call('PATCH', 'users/paid-customer', mockToken('paid-customer'), { selectedSegment: 'Grocery' }, 'selectedSegment')).status, 200);
});
for (const collection of ['account_trial_usage', 'account_free_monthly_usage']) for (const role of ['customer', 'stranger', 'anonymous', 'admin']) {
  test(collection + ' shared counter is server-only including creation and deletion: ' + role, async () => {
    const path = collection + '/customer-a';
    assert.equal((await call('PATCH', path, 'owner', { used: 499 })).status, 200);
    assert.equal((await call('GET', path, tokens[role])).status, 403);
    assert.equal((await call('GET', collection, tokens[role])).status, 403);
    assert.equal((await call('PATCH', path, tokens[role], { used: 0 })).status, 403);
    assert.equal((await call('PATCH', collection + '/forged', tokens[role], { used: 0 })).status, 403);
    assert.equal((await call('DELETE', path, tokens[role])).status, 403);
  });
}
