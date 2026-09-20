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

const project = 'demo-inventa-adviser-r2a';
const jar = join(homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
const rules = fileURLToPath(new URL('../firestore.rules', import.meta.url));
const prefix = `/v1/projects/${project}/databases/(default)/documents/`;
let emulator, port, scratch, startup = '', processError;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function valueField(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value === null) return { nullValue: null };
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
  scratch = mkdtempSync(join(tmpdir(), 'inventa-r2a-rules-'));
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

for (const actor of ['customer', 'stranger', 'anonymous', 'admin']) {
  for (const action of ['create', 'update', 'delete']) test(`${actor} cannot directly ${action} requests`, async () => {
    const path = 'product_requests/review-' + actor + '-' + action;
    if (action !== 'create') assert.equal((await call('PATCH', path, 'owner', { userId: 'customer-a', status: 'submitted' })).status, 200);
    const result = await call(action === 'delete' ? 'DELETE' : 'PATCH', path, tokens[actor],
      action === 'delete' ? undefined : { userId: 'customer-a', status: 'approved', reviewedBy: 'administrator', productId: 'forged' });
    assert.equal(result.status, 403);
  });
}
for (const actor of ['customer', 'stranger', 'anonymous']) {
  for (const action of ['create', 'update', 'delete']) test(`${actor} cannot ${action} products or images`, async () => {
    const path = 'products/catalog-' + actor + '-' + action;
    if (action !== 'create') assert.equal((await call('PATCH', path, 'owner', { name: 'Existing', image_url: 'https://example.invalid/old' })).status, 200);
    assert.equal((await call(action === 'delete' ? 'DELETE' : 'PATCH', path, tokens[actor],
      action === 'delete' ? undefined : { name: 'Forged', image_url: 'https://example.invalid/new' })).status, 403);
  });
}
test('Customer reads only own request; Admin can inspect; public read denied', async () => {
  const path = 'product_requests/owned';
  assert.equal((await call('PATCH', path, 'owner', { userId: 'customer-a', status: 'submitted' })).status, 200);
  for (const actor of ['customer', 'admin']) assert.equal((await call('GET', path, tokens[actor])).status, 200);
  for (const actor of ['stranger', 'anonymous']) assert.equal((await call('GET', path, tokens[actor])).status, 403);
});
test('Admin catalog creation, image editing and deletion preserved', async () => {
  const path = 'products/admin-product';
  assert.equal((await call('PATCH', path, tokens.admin, { name: 'Product', image_url: 'https://example.invalid/a' })).status, 200);
  assert.equal((await call('PATCH', path, tokens.admin, { image_url: 'https://example.invalid/b' }, 'image_url')).status, 200);
  assert.equal((await call('DELETE', path, tokens.admin)).status, 200);
});
for (const collection of ['product_submission_operations', 'product_submission_identity']) {
  for (const actor of ['customer', 'admin', 'anonymous']) test(`${collection} is server-only for ${actor}`, async () => {
    const path = collection + '/reserved';
    assert.equal((await call('PATCH', path, 'owner', { userId: 'customer-a' })).status, 200);
    assert.equal((await call('GET', path, tokens[actor])).status, 403);
    assert.equal((await call('PATCH', path, tokens[actor], { userId: 'customer-a' })).status, 403);
    assert.equal((await call('DELETE', path, tokens[actor])).status, 403);
  });
}

// Actual Admin ID-token requests, not owner/SDK bypass, exercise the security boundary.
const allowedImages = [
  ['absent', undefined], ['empty', ''], ['https', 'https://images.example.invalid/a.jpg'],
  ['query', 'https://images.example.invalid/a%20b.jpg?size=2#preview'],
  ['port', 'https://images.example.invalid:65535/a'],
  ['punycode', 'https://xn--bcher-kva.example/a'],
  ['boundary', 'https://example.invalid/' + 'a'.repeat(2048 - 'https://example.invalid/'.length)],
];
const deniedImages = [
  ['javascript', 'javascript:alert(1)'], ['data', 'data:image/png;base64,AA'], ['file', 'file:///image'],
  ['ftp', 'ftp://example.invalid/a'], ['http', 'http://example.invalid/a'],
  ['credentials', 'https://user:pass@example.invalid/a'], ['userinfo', 'https://user@example.invalid/a'],
  ['encoded-userinfo', 'https://user%40example.invalid/a'],
  ['overlong', 'https://example.invalid/' + 'a'.repeat(2048)], ['malformed', 'not-a-url'],
  ['no-host', 'https://'], ['empty-host', 'https:///path'], ['bad-host', 'https://-bad.example/a'],
  ['bad-port', 'https://example.invalid:65536/a'], ['space', 'https://example.invalid/a b'],
  ['padding', ' https://example.invalid/a '], ['backslash', 'https://example.invalid\\a'],
  ['control', 'https://example.invalid/a\u0000'], ['newline', 'https://example.invalid/a\nb'],
  ['unicode-space', 'https://example.invalid/a\u00a0b'], ['unicode-line', 'https://example.invalid/a\u2028b'],
  ['number', 123], ['boolean', true], ['null', null], ['object', { url: 'https://example.invalid/a' }],
];
for (const method of ['create', 'update']) {
  for (const [name, image] of allowedImages) test(`Admin ${method} image ALLOW ${name}`, async () => {
    const path = `products/image-${method}-${name}`;
    if (method === 'update') assert.equal((await call('PATCH', path, 'owner', { name: 'Original', image_url: 'https://example.invalid/old' })).status, 200);
    const data = { name: 'Allowed', ...(image !== undefined ? { image_url: image } : {}) };
    assert.equal((await call('PATCH', path, tokens.admin, data)).status, 200);
    const stored = await call('GET', path, tokens.admin);
    assert.equal(stored.body.fields.image_url?.stringValue, image);
  });
  for (const [name, image] of deniedImages) test(`Admin ${method} image DENY ${name}`, async () => {
    const path = `products/image-${method}-${name}`;
    if (method === 'update') assert.equal((await call('PATCH', path, 'owner', { name: 'Original', image_url: 'https://example.invalid/old' })).status, 200);
    assert.equal((await call('PATCH', path, tokens.admin, { name: 'Forbidden', image_url: image })).status, 403);
    const stored = await call('GET', path, tokens.admin);
    if (method === 'create') assert.equal(stored.status, 404);
    else assert.equal(stored.body.fields.image_url.stringValue, 'https://example.invalid/old');
  });
}
test('Admin unrelated edit preserves no-image and valid-image legacy compatibility', async () => {
  for (const [id, data] of Object.entries({ absent: { name: 'Original' },
    legacy: { name: 'Original', image: 'https://example.invalid/legacy' },
    valid: { name: 'Original', image_url: 'https://example.invalid/valid' } })) {
    const path = 'products/legacy-' + id;
    assert.equal((await call('PATCH', path, 'owner', data)).status, 200);
    assert.equal((await call('PATCH', path, tokens.admin, { name: 'Edited' }, 'name')).status, 200);
    assert.equal((await call('GET', path, tokens.admin)).body.fields.image_url?.stringValue, data.image_url);
  }
});
test('invalid historical image must be corrected, cleared or removed; delete remains allowed', async () => {
  const path = 'products/invalid-history';
  const reset = () => call('PATCH', path, 'owner', { name: 'Original', image_url: 'javascript:bad' });
  assert.equal((await reset()).status, 200);
  assert.equal((await call('PATCH', path, tokens.admin, { name: 'Unrelated' }, 'name')).status, 403);
  for (const image of ['https://example.invalid/fixed', '']) {
    await reset();
    assert.equal((await call('PATCH', path, tokens.admin, { image_url: image }, 'image_url')).status, 200);
  }
  await reset();
  assert.equal((await call('PATCH', path, tokens.admin, {}, 'image_url')).status, 200);
  assert.equal((await call('GET', path, tokens.admin)).body.fields.image_url, undefined);
  await reset();
  assert.equal((await call('DELETE', path, tokens.admin)).status, 200);
});
