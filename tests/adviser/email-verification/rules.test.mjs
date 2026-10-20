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

const project = 'demo-inventa-signup-verification';
const jar = join(homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar');
const rules = fileURLToPath(new URL('../../../firestore.rules', import.meta.url));
let emulator, scratch, port, startup = '', startupError;
const field = value => typeof value === 'boolean' ? { booleanValue: value }
  : typeof value === 'number' ? { integerValue: String(value) } : { stringValue: value };
// Unsigned emulator tokens; claims default to a signup-code verified password identity.
// An undefined override removes the claim entirely.
const token = (uid, claims = {}) => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: uid, user_id: uid, aud: project,
    iss: `https://securetoken.google.com/${project}`, iat: now, exp: now + 3600, auth_time: now,
    email: `${uid}@signup.invalid`, email_verified: true, firebase: { sign_in_provider: 'password', identities: {} }, ...claims })}.`;
};
const call = (method, path, identity, data, mask) => new Promise((resolve, reject) => {
  assert.ok(Number.isInteger(port) && port > 0); assert.match(path, /^[A-Za-z0-9_/-]+$/u);
  if (mask) assert.match(mask, /^[A-Za-z]+$/u);
  const bearer = identity === 'owner' ? 'owner' : Array.isArray(identity) ? token(...identity) : identity && token(identity);
  const req = request({ hostname: '127.0.0.1', port, method,
    path: `/v1/projects/${project}/databases/(default)/documents/${path}${mask ? `?updateMask.fieldPaths=${mask}` : ''}`,
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' } }, res => {
    res.resume(); res.on('end', () => resolve(res.statusCode));
  });
  req.setTimeout(15000, () => req.destroy(Error('Local rules request timed out'))); req.on('error', reject);
  req.end(data ? JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([name, value]) => [name, field(value)])) }) : undefined);
});
before(async () => {
  assert.ok(existsSync(jar), 'Cached Firestore emulator required; no automatic downloads.');
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  scratch = mkdtempSync(join(tmpdir(), 'inventa-signup-rules-'));
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
}, { timeout: 40000 });
after(async () => {
  if (emulator?.exitCode === null) await new Promise(resolve => { emulator.once('exit', resolve); emulator.kill(); });
  if (scratch) { try { rmdirSync(scratch); } catch { /* retain any emulator diagnostic files */ } }
});
const profile = (uid, extra = {}) => ({ uid, role: 'Developer', plan: 'Free', apiRequestLimit: 50, businessSegment: 'Grocery',
  email: `${uid}@signup.invalid`, termsAccepted: true, termsVersion: '2026-10-20', privacyConsent: true, ...extra });
const without = (data, name) => Object.fromEntries(Object.entries(data).filter(([key]) => key !== name));

test('a signup-code verified identity creates its Customer profile with consent evidence', async () => {
  assert.equal(await call('PATCH', 'users/verified', 'verified', profile('verified')), 200);
});
test('unverified, claimless and email-less identities cannot create an otherwise valid profile', async () => {
  assert.equal(await call('PATCH', 'users/unverified', ['unverified', { email_verified: false }], profile('unverified')), 403);
  assert.equal(await call('PATCH', 'users/claimless', ['claimless', { email_verified: undefined }], profile('claimless')), 403);
  assert.equal(await call('PATCH', 'users/textual', ['textual', { email_verified: 'true' }], profile('textual')), 403);
  assert.equal(await call('PATCH', 'users/anonymous', ['anonymous', { email: undefined }], without(profile('anonymous'), 'email')), 403);
  assert.equal(await call('PATCH', 'users/no-auth', null, profile('no-auth')), 403);
});
test('the profile must record exactly the verified address', async () => {
  for (const email of ['someone-else@signup.invalid', 'Mismatch@signup.invalid', ' mismatch@signup.invalid', '']) {
    assert.equal(await call('PATCH', 'users/mismatch', 'mismatch', profile('mismatch', { email })), 403, email);
  }
  assert.equal(await call('PATCH', 'users/mismatch', 'mismatch', without(profile('mismatch'), 'email')), 403);
  assert.equal(await call('PATCH', 'users/mismatch', 'mismatch', profile('mismatch')), 200);
});
test('Terms of Service and Privacy Policy acceptance are both explicitly required', async () => {
  for (const name of ['termsAccepted', 'privacyConsent']) {
    for (const value of [false, 'true', 1]) {
      assert.equal(await call('PATCH', 'users/consent', 'consent', profile('consent', { [name]: value })), 403, `${name}=${value}`);
    }
    assert.equal(await call('PATCH', 'users/consent', 'consent', without(profile('consent'), name)), 403, name);
  }
});
test('verified address and consent evidence are immutable after signup; ordinary edits still work', async () => {
  const at = '2026-10-20T00:00:00.000Z'; // REST stand-in for the client serverTimestamp() values
  assert.equal(await call('PATCH', 'users/settled', 'settled', profile('settled', { termsAcceptedAt: at, privacyConsentTimestamp: at })), 200);
  for (const [name, value] of [['email', 'other@signup.invalid'], ['termsAccepted', false], ['termsVersion', '1999-01-01'],
    ['termsAcceptedAt', 'forged'], ['privacyConsent', false], ['privacyConsentTimestamp', 'forged']]) {
    assert.equal(await call('PATCH', 'users/settled', 'settled', { [name]: value }, name), 403, name);
    assert.equal(await call('PATCH', 'users/settled', 'settled', {}, name), 403, `remove ${name}`);
  }
  assert.equal(await call('PATCH', 'users/settled', 'settled', { fullName: 'Renamed' }, 'fullName'), 200);
});
test('verification records are backend-only for every browser identity', async () => {
  assert.equal(await call('PATCH', 'email_verifications/record', 'owner', { codeHash: 'synthetic' }), 200);
  for (const identity of ['verified', 'admin', null]) {
    assert.equal(await call('GET', 'email_verifications/record', identity), 403);
    assert.equal(await call('PATCH', 'email_verifications/record', identity, { codeHash: 'forged' }), 403);
    assert.equal(await call('PATCH', 'email_verifications/created', identity, { codeHash: 'forged' }), 403);
    assert.equal(await call('DELETE', 'email_verifications/record', identity), 403);
  }
});
test('closed registration still denies verified identities', async () => {
  assert.equal(await call('PATCH', 'system/settings', 'owner', { allowNewRegistrations: false }), 200);
  try { assert.equal(await call('PATCH', 'users/closed', 'closed', profile('closed')), 403); }
  finally { assert.equal(await call('PATCH', 'system/settings', 'owner', { allowNewRegistrations: true }), 200); }
});
