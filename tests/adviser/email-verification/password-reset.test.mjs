import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memoryStore, invoke } from '../r2a/memory-store.mjs';
import { createPasswordResetHandlers, createEmailVerificationHandlers, passwordResetEmail,
  PASSWORD_RESET_COLLECTION } from '../../../services/email-verification.js';

// Real reset handlers over the atomic in-memory Firestore; Auth and delivery are synthetic.
const email = 'juan.delacruz@gmail.com';
const record = address => `${PASSWORD_RESET_COLLECTION}/${createHash('sha256').update(address).digest('hex')}`;
const codes = ['482913', '105377', '660021', '930412', '771845', '204816'];
// findAccount resolves an address to its uid; a disabled account resolves like an unknown one.
const accounts = { [email]: 'juan-uid' };
const sent = { success: true, expiresInSeconds: 600, resendAvailableInSeconds: 60 };

function fixture({ deliver, setPassword, revoke } = {}) {
  const db = memoryStore({});
  const state = { now: Date.parse('2026-10-20T08:00:00.000Z'), generated: 0, mail: [], passwords: [], revoked: [], reports: [], lookups: [] };
  const options = { getDb: () => db,
    sendEmail: async message => { if (deliver) await deliver(message); state.mail.push(message); },
    now: () => new Date(state.now), createCode: () => codes[state.generated++ % codes.length], report: reason => state.reports.push(reason) };
  const handlers = createPasswordResetHandlers({ ...options,
    findAccount: async address => {
      state.lookups.push(address);
      if (address === 'lookup-outage@gmail.com') throw Error('synthetic Auth outage');
      return accounts[address] ?? null;
    },
    setPassword: async (uid, password) => { if (setPassword) await setPassword(uid, password); state.passwords.push([uid, password]); },
    revokeSessions: async uid => { if (revoke) await revoke(uid); state.revoked.push(uid); } });
  const signup = createEmailVerificationHandlers({ ...options, emailRegistered: async () => false,
    verifyIdToken: async () => { throw Error('unused'); }, markEmailVerified: async () => {} });
  return { db, state, advance: ms => { state.now += ms; },
    call: (name, body) => invoke(handlers[name], { token: null, body }),
    signup: (name, body) => invoke(signup[name], { token: null, body }) };
}
const confirm = (f, overrides = {}) => f.call('confirm', { email, code: '482913', password: 'new-synthetic-password', ...overrides });

test('reset email carries the code and how long it lasts, never the address', () => {
  const message = passwordResetEmail(email, '482913');
  assert.equal(message.to, email); assert.equal(message.subject, 'Your InventaAPI password reset code');
  assert.match(message.text, /password reset code is 482913\./); assert.match(message.text, /expires in 10 minutes/);
  assert.match(message.text, /did not ask to reset your password/);
  assert.match(message.html, />482913</); assert.match(message.html, /Reset your password/);
  assert.doesNotMatch(message.text + message.html, /juan|<script|javascript:/iu);
});
test('send emails a code only to an account; unknown and disabled addresses get the same reply and no email', async () => {
  const f = fixture();
  const response = await f.call('send', { email: '  Juan.DelaCruz@Gmail.com ' });
  assert.equal(response.statusCode, 200); assert.deepEqual(response.body, sent);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(f.state.mail.map(message => [message.to, message.subject]), [[email, 'Your InventaAPI password reset code']]);
  assert.match(f.state.mail[0].text, /password reset code is 482913\./);
  assert.deepEqual(Object.keys(f.db.dump()), [record(email)]);
  const stored = f.db.read(record(email));
  assert.match(stored.codeHash, /^[a-f0-9]{64}$/u); assert.equal(stored.attempts, 0); assert.equal(stored.sendCount, 1);
  assert.equal(Object.values(stored).includes('482913'), false);
  assert.doesNotMatch(JSON.stringify(f.db.dump()), /@/u);
  for (const address of ['nobody@gmail.com', 'disabled@gmail.com']) {
    const quiet = await f.call('send', { email: address });
    assert.equal(quiet.statusCode, 200); assert.deepEqual(quiet.body, sent);
  }
  assert.equal(f.state.mail.length, 1); assert.deepEqual(Object.keys(f.db.dump()), [record(email)]);
});
test('send rejects malformed addresses before any account lookup', async () => {
  const f = fixture();
  for (const value of ['', 'juan', 'juan@gmail', 'juan @gmail.com', 42, null]) {
    const response = await f.call('send', { email: value });
    assert.equal(response.statusCode, 400, String(value)); assert.equal(response.body.code, 'INVALID_EMAIL');
  }
  assert.deepEqual(f.state.lookups, []); assert.deepEqual(f.db.dump(), {}); assert.equal(f.state.mail.length, 0);
});
test('reset sends share the per-address cooldown and hourly limit', async () => {
  const f = fixture();
  assert.equal((await f.call('send', { email })).statusCode, 200);
  const early = await f.call('send', { email });
  assert.equal(early.statusCode, 429); assert.equal(early.body.code, 'VERIFICATION_RESEND_COOLDOWN');
  assert.equal(early.headers['Retry-After'], '60'); assert.equal(early.body.retryAfterSeconds, 60);
  for (let i = 0; i < 4; i++) { f.advance(60_000); assert.equal((await f.call('send', { email })).statusCode, 200); }
  f.advance(60_000);
  const limited = await f.call('send', { email });
  assert.equal(limited.statusCode, 429); assert.equal(limited.body.code, 'VERIFICATION_SEND_LIMIT');
  assert.equal(f.state.mail.length, 5);
});
test('an undelivered reset code is withdrawn and its cooldown released', async () => {
  let failing = true;
  const f = fixture({ deliver: async () => { if (failing) throw Object.assign(Error('smtp down'), { code: 'ECONNECTION' }); } });
  const failed = await f.call('send', { email });
  assert.equal(failed.statusCode, 503); assert.equal(failed.body.code, 'EMAIL_DELIVERY_FAILED');
  assert.equal(failed.body.error, 'We could not send the password reset email. Please try again in a moment.');
  assert.equal(f.db.read(record(email)).codeHash, null); assert.deepEqual(f.state.reports, ['ECONNECTION']);
  assert.equal((await confirm(f)).body.code, 'VERIFICATION_CODE_MISSING');
  failing = false;
  assert.equal((await f.call('send', { email })).statusCode, 200);
});
test('the correct code sets the new password once and signs other sessions out', async () => {
  const f = fixture();
  await f.call('send', { email });
  const done = await confirm(f, { email: 'Juan.DelaCruz@Gmail.com' });
  assert.equal(done.statusCode, 200); assert.deepEqual(done.body, { success: true });
  assert.deepEqual(f.state.passwords, [['juan-uid', 'new-synthetic-password']]); assert.deepEqual(f.state.revoked, ['juan-uid']);
  assert.equal(f.db.read(record(email)), undefined);
  const reused = await confirm(f, { password: 'another-synthetic-password' });
  assert.equal(reused.statusCode, 400); assert.equal(reused.body.code, 'VERIFICATION_CODE_MISSING');
  assert.equal(f.state.passwords.length, 1);
});
test('code format and password are checked before the code is touched', async () => {
  const f = fixture();
  await f.call('send', { email });
  for (const code of ['12345', '1234567', 'abcdef', 482913, null]) {
    const response = await confirm(f, { code });
    assert.equal(response.statusCode, 400, String(code)); assert.equal(response.body.code, 'INVALID_CODE');
  }
  for (const password of ['', 'short', 42, null, 'x'.repeat(257)]) {
    const response = await confirm(f, { password });
    assert.equal(response.statusCode, 400, String(password).slice(0, 12)); assert.equal(response.body.code, 'INVALID_PASSWORD');
    assert.equal(response.body.error, 'Choose a password with at least 6 characters.');
  }
  assert.equal(f.db.read(record(email)).attempts, 0); assert.deepEqual(f.state.passwords, []);
  assert.equal((await confirm(f)).statusCode, 200);
});
test('wrong codes count attempts and the fifth withdraws the code', async () => {
  const f = fixture();
  await f.call('send', { email });
  for (const remaining of [4, 3, 2, 1]) {
    const wrong = await confirm(f, { code: '000000' });
    assert.equal(wrong.statusCode, 400); assert.equal(wrong.body.code, 'VERIFICATION_CODE_INCORRECT');
    assert.equal(wrong.body.error, `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`);
  }
  const exhausted = await confirm(f, { code: '000000' });
  assert.equal(exhausted.statusCode, 429); assert.equal(exhausted.body.code, 'VERIFICATION_ATTEMPTS_EXCEEDED');
  assert.equal((await confirm(f)).body.code, 'VERIFICATION_CODE_MISSING');
  assert.deepEqual(f.state.passwords, []);
});
test('an expired code is refused', async () => {
  const f = fixture();
  await f.call('send', { email });
  f.advance(10 * 60 * 1000 + 1);
  const expired = await confirm(f);
  assert.equal(expired.statusCode, 400); assert.equal(expired.body.code, 'VERIFICATION_CODE_EXPIRED');
  assert.deepEqual(f.state.passwords, []);
});
test('an address without an account has no code, exactly like an account that requested none', async () => {
  const f = fixture();
  await f.call('send', { email: 'nobody@gmail.com' });
  const unknown = await confirm(f, { email: 'nobody@gmail.com' });
  const unrequested = await confirm(f);
  assert.deepEqual([unknown.statusCode, unknown.body], [unrequested.statusCode, unrequested.body]);
  assert.equal(unknown.body.code, 'VERIFICATION_CODE_MISSING'); assert.deepEqual(f.state.passwords, []);
});
test('a signup verification code cannot reset a password', async () => {
  const f = fixture();
  assert.equal((await f.signup('send', { email })).statusCode, 200);
  assert.match(f.state.mail[0].text, /verification code is 482913\./);
  const response = await confirm(f, { code: '482913' });
  assert.equal(response.statusCode, 400); assert.equal(response.body.code, 'VERIFICATION_CODE_MISSING');
  assert.deepEqual(f.state.passwords, []);
});
test('a password Firebase rejects gets a clear message; the code is spent', async () => {
  const f = fixture({ setPassword: async () => { throw Object.assign(Error('weak'), { code: 'auth/invalid-password' }); } });
  await f.call('send', { email });
  const rejected = await confirm(f);
  assert.equal(rejected.statusCode, 400); assert.equal(rejected.body.code, 'PASSWORD_REJECTED');
  assert.match(rejected.body.error, /Request a new code and choose a different password/);
  assert.equal(f.db.read(record(email)), undefined); assert.deepEqual(f.state.revoked, []);
});
test('unexpected Auth failures fail closed with the reset-unavailable message', async () => {
  const f = fixture({ setPassword: async () => { throw Error('synthetic Auth outage'); } });
  const outage = await f.call('send', { email: 'lookup-outage@gmail.com' });
  assert.equal(outage.statusCode, 503); assert.equal(outage.body.code, 'PASSWORD_RESET_UNAVAILABLE');
  assert.equal(outage.body.error, 'Password reset is temporarily unavailable. Please try again later.');
  assert.equal(f.state.mail.length, 0);
  await f.call('send', { email });
  const failed = await confirm(f);
  assert.equal(failed.statusCode, 503); assert.equal(failed.body.code, 'PASSWORD_RESET_UNAVAILABLE');
  assert.deepEqual(f.state.revoked, []);
});
test('a failed session revocation does not undo a completed reset', async () => {
  const f = fixture({ revoke: async () => { throw Error('synthetic revoke failure'); } });
  await f.call('send', { email });
  const done = await confirm(f);
  assert.equal(done.statusCode, 200); assert.deepEqual(f.state.passwords, [['juan-uid', 'new-synthetic-password']]);
});
