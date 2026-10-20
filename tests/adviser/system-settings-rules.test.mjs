// Cached Firestore emulator only. Synthetic project, mock identities, localhost.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmdirSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = 'demo-inventa-system-settings';
const jar = join(homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
const rules = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
let emulator, scratch, port, startup = '', startupError;
const field = value => typeof value === 'boolean' ? { booleanValue: value }
  : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value };
// Signup-code verified password identities, as the Customer signup flow produces.
const token = uid => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project,
    iss: `https://securetoken.google.com/${project}`, iat: now, exp: now + 3600, auth_time: now,
    email: `${uid}@signup.invalid`, email_verified: true,
    firebase: { sign_in_provider: 'password', identities: {} } })}.`;
};
const call = (method, path, identity, data) => new Promise((resolve, reject) => {
  assert.ok(Number.isInteger(port) && port > 0); assert.match(path, /^[A-Za-z0-9_/-]+$/u);
  const req = request({ hostname: '127.0.0.1', port, method,
    path: `/v1/projects/${project}/databases/(default)/documents/${path}`,
    headers: { ...(identity ? { Authorization: `Bearer ${identity === 'owner' ? 'owner' : token(identity)}` } : {}), 'Content-Type': 'application/json' } }, res => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.setTimeout(15000, () => req.destroy(Error('Local rules request timed out'))); req.on('error', reject);
  req.end(data ? JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([name, value]) => [name, field(value)])) }) : undefined);
});
before(async () => {
  assert.ok(existsSync(jar), 'Cached Firestore emulator required; no automatic downloads.');
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  scratch = mkdtempSync(join(tmpdir(), 'inventa-settings-rules-'));
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'JAVA_HOME'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  emulator = spawn('java', ['-jar', jar, '--host', '127.0.0.1', '--port', String(port), '--webchannel_port', '0',
    '--project_id', project, '--single_project_mode', 'true', '--single_project_mode_error', 'true', '--rules', rules],
  { cwd: scratch, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  emulator.on('error', error => { startupError = error; });
  for (const stream of [emulator.stdout, emulator.stderr]) stream.on('data', chunk => { startup = (startup + chunk).slice(-6000); });
  const deadline = Date.now() + 30000;
  while (!startup.includes('Dev App Server is now running')) {
    if (startupError || emulator.exitCode !== null || Date.now() > deadline) throw startupError || Error('Isolated emulator startup failed');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await call('PATCH', 'users/admin', 'owner', { uid: 'admin', role: 'Admin' }), 200);
  assert.equal(await call('PATCH', 'users/existing', 'owner', { uid: 'existing', role: 'Developer', plan: 'Free', apiRequestLimit: 50 }), 200);
}, { timeout: 40000 });
after(async () => {
  if (emulator?.exitCode === null) await new Promise(resolve => { emulator.once('exit', resolve); emulator.kill(); });
  if (scratch) { try { rmdirSync(scratch); } catch { /* retain any emulator diagnostic files */ } }
});
const profile = uid => ({ uid, role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Grocery',
  email: `${uid}@signup.invalid`, termsAccepted: true, privacyConsent: true });

test('missing settings preserves legitimate signup defaults', async () => {
  assert.equal(await call('PATCH', 'users/defaults-new', 'defaults-new', profile('defaults-new')), 200);
});
test('disabled registration denies profile creation even after direct Firebase authentication', async () => {
  assert.equal(await call('PATCH', 'system/settings', 'owner', { allowNewRegistrations: false }), 200);
  assert.equal(await call('PATCH', 'users/disabled-new', 'disabled-new', profile('disabled-new')), 403);
});
test('existing customers retain authorized profile reads while registration is disabled', async () => {
  assert.equal(await call('GET', 'users/existing', 'existing'), 200);
  assert.equal(await call('GET', 'users/existing', null), 403);
});
test('no client, including an Admin browser, can bypass backend settings mutation', async () => {
  for (const identity of ['admin', 'existing', null]) {
    assert.equal(await call('PATCH', 'system/settings', identity, { allowNewRegistrations: true }), 403);
    assert.equal(await call('DELETE', 'system/settings', identity), 403);
  }
  assert.equal(await call('GET', 'system/settings', 'admin'), 200);
  assert.equal(await call('GET', 'system/settings', 'existing'), 403);
});
test('malformed registration policy fails closed; enabled preserves legitimate creation and role protection', async () => {
  assert.equal(await call('PATCH', 'system/settings', 'owner', { allowNewRegistrations: 'true' }), 200);
  assert.equal(await call('PATCH', 'users/malformed-new', 'malformed-new', profile('malformed-new')), 403);
  assert.equal(await call('PATCH', 'system/settings', 'owner', { allowNewRegistrations: true }), 200);
  assert.equal(await call('PATCH', 'users/enabled-new', 'enabled-new', profile('enabled-new')), 200);
  assert.equal(await call('PATCH', 'users/forged-new', 'forged-new', { ...profile('forged-new'), role: 'Admin' }), 403);
});
test('unrelated system documents retain their existing Admin-only policy', async () => {
  assert.equal(await call('PATCH', 'system/unrelated', 'admin', { legacy: true }), 200);
  assert.equal(await call('PATCH', 'system/unrelated', 'existing', { legacy: false }), 403);
});

test('committed request promises cannot be read or changed by any browser identity', async () => {
  assert.equal(await call('PATCH', 'account_request_contracts/existing', 'owner', { version: 1 }), 200);
  for (const identity of ['admin', 'existing', null]) {
    assert.equal(await call('GET', 'account_request_contracts/existing', identity), 403);
    assert.equal(await call('PATCH', 'account_request_contracts/existing', identity, { version: 2 }), 403);
    assert.equal(await call('DELETE', 'account_request_contracts/existing', identity), 403);
  }
});
