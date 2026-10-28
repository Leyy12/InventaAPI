import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memoryStore, invoke } from '../r2a/memory-store.mjs';
import { createEmailVerificationHandlers, verificationEmail, VERIFICATION_COLLECTION } from '../../../services/email-verification.js';
import { REGISTRATION_MESSAGE } from '../../../services/system-settings-contract.mjs';

// Real handlers over the atomic in-memory Firestore; Auth and delivery are synthetic.
const email = 'juan.delacruz@gmail.com';
const record = address => `${VERIFICATION_COLLECTION}/${createHash('sha256').update(address).digest('hex')}`;
const identities = { juan: { uid: 'juan-uid', email }, other: { uid: 'other-uid', email: 'someone@gmail.com' }, phone: { uid: 'phone-uid' } };
const codes = ['482913', '105377', '660021', '930412', '771845', '204816'];

function fixture({ settings, registered = [], incomplete = [], deliver, markVerified, createAccount } = {}) {
  const db = memoryStore(settings ? { 'system/settings': settings } : {});
  const state = { now: Date.parse('2026-10-20T08:00:00.000Z'), generated: 0, tokens: 0, mail: [], verified: [], reports: [], removed: [], created: [] };
  const handlers = createEmailVerificationHandlers({ getDb: () => db,
    emailRegistered: async address => { if (address === 'lookup-outage@gmail.com') throw Error('synthetic Auth outage'); return registered.includes(address); },
    removeIncompleteAccount: async address => { if (registered.includes(address)) return false;
      if (incomplete.includes(address)) state.removed.push(address); return true; },
    verifyIdToken: async (token, revoked) => { assert.equal(revoked, true); if (!identities[token]) throw Error('invalid'); return identities[token]; },
    markEmailVerified: async uid => { if (markVerified) await markVerified(uid); state.verified.push(uid); },
    createAccount: async account => { if (createAccount) await createAccount(account); state.created.push(account); },
    sendEmail: async message => { if (deliver) await deliver(message); state.mail.push(message); },
    now: () => new Date(state.now), createCode: () => codes[state.generated++ % codes.length],
    createToken: () => `synthetic-token-${++state.tokens}`, report: reason => state.reports.push(reason) });
  return { db, state, advance: ms => { state.now += ms; },
    call: (name, body, token = null) => invoke(handlers[name], { token, body }) };
}

test('send emails a 6-digit code to the normalized address and stores neither in plaintext', async () => {
  const f = fixture();
  const response = await f.call('send', { email: '  Juan.DelaCruz@Gmail.com ' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { success: true, expiresInSeconds: 600, resendAvailableInSeconds: 60 });
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(f.state.mail.map(message => message.to), [email]);
  assert.match(f.state.mail[0].text, /verification code is 482913\./);
  assert.deepEqual(Object.keys(f.db.dump()), [record(email)]);
  const stored = f.db.read(record(email));
  assert.match(stored.codeHash, /^[a-f0-9]{64}$/u); assert.equal(stored.attempts, 0); assert.equal(stored.sendCount, 1);
  assert.equal(Object.values(stored).includes('482913'), false);
  assert.doesNotMatch(JSON.stringify(f.db.dump()), /@/u);
});
test('send rejects malformed addresses before any lookup, storage or email', async () => {
  const f = fixture();
  for (const value of ['', 'juan', 'juan@gmail', 'juan @gmail.com', 'juan@gmail..com', 'juan@-gmail.com', `${'a'.repeat(250)}@gmail.com`, 42, null]) {
    const response = await f.call('send', { email: value });
    assert.equal(response.statusCode, 400, String(value)); assert.equal(response.body.code, 'INVALID_EMAIL');
  }
  assert.equal((await f.call('send', undefined)).statusCode, 400);
  assert.deepEqual(f.db.dump(), {}); assert.equal(f.state.mail.length, 0);
});
test('send honors the registration switch and never emails an already registered address', async () => {
  const closed = fixture({ settings: { allowNewRegistrations: false } });
  const refused = await closed.call('send', { email });
  assert.equal(refused.statusCode, 403); assert.equal(refused.body.code, 'REGISTRATION_CLOSED'); assert.equal(refused.body.error, REGISTRATION_MESSAGE);
  const existing = fixture({ registered: [email] });
  const conflict = await existing.call('send', { email: 'Juan.DelaCruz@gmail.com' });
  assert.equal(conflict.statusCode, 409); assert.equal(conflict.body.code, 'EMAIL_ALREADY_REGISTERED');
  for (const f of [closed, existing]) { assert.equal(f.state.mail.length, 0); assert.equal(f.db.read(record(email)), undefined); }
});
test('unverifiable registration state fails closed without sending', async () => {
  for (const [f, address] of [[fixture({ settings: { allowNewRegistrations: 'yes' } }), email], [fixture(), 'lookup-outage@gmail.com']]) {
    const response = await f.call('send', { email: address });
    assert.equal(response.statusCode, 503); assert.equal(response.body.code, 'VERIFICATION_UNAVAILABLE');
    assert.equal(f.state.mail.length, 0);
  }
});
test('per-address limits allow one code per minute and five per hour, then reset', async () => {
  const f = fixture();
  assert.equal((await f.call('send', { email })).statusCode, 200);
  f.advance(30_000);
  const early = await f.call('send', { email });
  assert.equal(early.statusCode, 429); assert.equal(early.body.code, 'VERIFICATION_RESEND_COOLDOWN');
  assert.equal(early.body.retryAfterSeconds, 30); assert.equal(early.headers['Retry-After'], '30');
  for (let sent = 2; sent <= 5; sent++) { f.advance(60_000); assert.equal((await f.call('send', { email })).statusCode, 200, `send ${sent}`); }
  f.advance(60_000);
  const capped = await f.call('send', { email });
  assert.equal(capped.statusCode, 429); assert.equal(capped.body.code, 'VERIFICATION_SEND_LIMIT');
  assert.equal(capped.body.retryAfterSeconds, 3600 - 330);
  assert.equal(f.state.mail.length, 5);
  f.advance(3270_000);
  assert.equal((await f.call('send', { email })).statusCode, 200);
  assert.equal(f.db.read(record(email)).sendCount, 1);
});
test('an undelivered code is withdrawn and its cooldown released for an immediate retry', async () => {
  let failing = true;
  const f = fixture({ deliver: async () => { if (failing) throw Object.assign(Error('Invalid login: 535 synthetic'), { code: 'EAUTH' }); } });
  const failed = await f.call('send', { email });
  assert.equal(failed.statusCode, 503); assert.equal(failed.body.code, 'EMAIL_DELIVERY_FAILED');
  assert.deepEqual(f.state.reports, ['EAUTH']);
  assert.equal(f.db.read(record(email)).codeHash, null);
  assert.equal((await f.call('verify', { email, code: '482913' })).body.code, 'VERIFICATION_CODE_MISSING');
  failing = false;
  assert.equal((await f.call('send', { email })).statusCode, 200);
  assert.equal(f.db.read(record(email)).sendCount, 2);
  assert.equal((await f.call('verify', { email, code: '105377' })).statusCode, 200);
});
test('verify requires a pending 6-digit code', async () => {
  const f = fixture();
  for (const code of ['', '12345', '1234567', '12a456', ' 482913', 482913, null]) {
    const response = await f.call('verify', { email, code });
    assert.equal(response.statusCode, 400); assert.equal(response.body.code, 'INVALID_CODE');
  }
  assert.equal((await f.call('verify', { email, code: '482913' })).body.code, 'VERIFICATION_CODE_MISSING');
  assert.equal((await f.call('verify', { email: 'not-an-email', code: '482913' })).body.code, 'INVALID_EMAIL');
});
test('wrong codes count down to a lockout that withdraws the code', async () => {
  const f = fixture(); await f.call('send', { email });
  for (const remaining of [4, 3, 2, 1]) {
    const response = await f.call('verify', { email, code: '000000' });
    assert.equal(response.statusCode, 400); assert.equal(response.body.code, 'VERIFICATION_CODE_INCORRECT');
    assert.equal(response.body.error, `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`);
  }
  const locked = await f.call('verify', { email, code: '000000' });
  assert.equal(locked.statusCode, 429); assert.equal(locked.body.code, 'VERIFICATION_ATTEMPTS_EXCEEDED');
  assert.equal((await f.call('verify', { email, code: '482913' })).body.code, 'VERIFICATION_CODE_MISSING');
});
test('codes expire ten minutes after sending', async () => {
  const fresh = fixture(); await fresh.call('send', { email }); fresh.advance(599_999);
  assert.equal((await fresh.call('verify', { email, code: '482913' })).statusCode, 200);
  const stale = fixture(); await stale.call('send', { email }); stale.advance(600_000);
  const response = await stale.call('verify', { email, code: '482913' });
  assert.equal(response.statusCode, 400); assert.equal(response.body.code, 'VERIFICATION_CODE_EXPIRED');
});
test('a correct code yields a single-use token; a newer code supersedes older codes and tokens', async () => {
  const f = fixture(); await f.call('send', { email: 'Juan.DelaCruz@gmail.com' });
  const verified = await f.call('verify', { email: ' juan.delacruz@GMAIL.com', code: '482913' });
  assert.equal(verified.statusCode, 200);
  assert.deepEqual(verified.body, { success: true, verificationToken: 'synthetic-token-1', expiresInSeconds: 1800 });
  assert.equal((await f.call('verify', { email, code: '482913' })).body.code, 'VERIFICATION_CODE_MISSING');
  f.advance(60_000); await f.call('send', { email });
  assert.equal((await f.call('confirm', { verificationToken: 'synthetic-token-1' }, 'juan')).body.code, 'VERIFICATION_TOKEN_INVALID');
  assert.equal((await f.call('verify', { email, code: '482913' })).body.code, 'VERIFICATION_CODE_INCORRECT');
  assert.equal((await f.call('verify', { email, code: '105377' })).statusCode, 200);
});
test('confirm verifies only the identity whose own email holds the token, exactly once', async () => {
  const f = fixture(); await f.call('send', { email });
  const { verificationToken } = (await f.call('verify', { email, code: '482913' })).body;
  for (const [identity, status, code] of [[null, 401, 'UNAUTHENTICATED'], ['forged', 401, 'UNAUTHENTICATED'],
    ['other', 400, 'VERIFICATION_TOKEN_INVALID'], ['phone', 400, 'VERIFICATION_TOKEN_INVALID']]) {
    const response = await f.call('confirm', { verificationToken }, identity);
    assert.equal(response.statusCode, status, String(identity)); assert.equal(response.body.code, code);
  }
  for (const forged of ['synthetic-token-2', '', 'x'.repeat(129), 42, undefined]) {
    assert.equal((await f.call('confirm', { verificationToken: forged }, 'juan')).body.code, 'VERIFICATION_TOKEN_INVALID');
  }
  assert.deepEqual(f.state.verified, []);
  const confirmed = await f.call('confirm', { verificationToken }, 'juan');
  assert.equal(confirmed.statusCode, 200); assert.deepEqual(confirmed.body, { success: true });
  assert.deepEqual(f.state.verified, ['juan-uid']);
  assert.equal(f.db.read(record(email)), undefined);
  assert.equal((await f.call('confirm', { verificationToken }, 'juan')).body.code, 'VERIFICATION_TOKEN_INVALID');
  assert.deepEqual(f.state.verified, ['juan-uid']);
});
test('verification tokens expire after thirty minutes; a failed Auth update stays retryable', async () => {
  const stale = fixture(); await stale.call('send', { email });
  const expired = (await stale.call('verify', { email, code: '482913' })).body.verificationToken;
  stale.advance(1800_000);
  assert.equal((await stale.call('confirm', { verificationToken: expired }, 'juan')).body.code, 'VERIFICATION_TOKEN_INVALID');
  let outage = true;
  const f = fixture({ markVerified: async () => { if (outage) throw Error('synthetic Auth outage'); } });
  await f.call('send', { email });
  const { verificationToken } = (await f.call('verify', { email, code: '482913' })).body;
  const failed = await f.call('confirm', { verificationToken }, 'juan');
  assert.equal(failed.statusCode, 503); assert.equal(failed.body.code, 'VERIFICATION_UNAVAILABLE');
  outage = false;
  assert.equal((await f.call('confirm', { verificationToken }, 'juan')).statusCode, 200);
});
test('the email states the code and expiry with no recipient-controlled content', () => {
  const message = verificationEmail(email, '482913');
  assert.equal(message.to, email); assert.equal(message.subject, 'Your InventaAPI verification code');
  assert.match(message.text, /verification code is 482913\./); assert.match(message.text, /expires in 10 minutes/);
  assert.match(message.html, />482913</); assert.doesNotMatch(message.html, /juan|<script|javascript:/iu);
});
test('an identity left by an unfinished signup does not block a new code, and only the verified inbox can clear it', async () => {
  const f = fixture({ incomplete: [email] });
  assert.equal((await f.call('send', { email })).statusCode, 200);
  for (const token of ['synthetic-token-1', 'x'.repeat(129), 42]) {
    const refused = await f.call('reclaim', { email, verificationToken: token });
    assert.equal(refused.statusCode, 400); assert.equal(refused.body.code, 'VERIFICATION_TOKEN_INVALID');
  }
  const { verificationToken } = (await f.call('verify', { email, code: '482913' })).body;
  assert.equal((await f.call('reclaim', { email: 'someone@gmail.com', verificationToken })).statusCode, 400);
  assert.deepEqual(f.state.removed, []);
  const reclaimed = await f.call('reclaim', { email: 'Juan.DelaCruz@gmail.com', verificationToken });
  assert.equal(reclaimed.statusCode, 200); assert.deepEqual(f.state.removed, [email]);
  // The token stays valid for confirming the new identity.
  assert.equal((await f.call('confirm', { verificationToken }, 'juan')).statusCode, 200);
  f.advance(31 * 60 * 1000);
  assert.equal((await f.call('reclaim', { email, verificationToken })).statusCode, 400);
});
test('reclaim never removes a completed account', async () => {
  const registered = [], f = fixture({ registered, incomplete: [email] });
  await f.call('send', { email }); const { verificationToken } = (await f.call('verify', { email, code: '482913' })).body;
  registered.push(email); // the account was completed after the code was verified
  const refused = await f.call('reclaim', { email, verificationToken });
  assert.equal(refused.statusCode, 409); assert.equal(refused.body.code, 'EMAIL_ALREADY_REGISTERED');
  assert.deepEqual(f.state.removed, []);
});

test('register creates the account only for the verified inbox, then redeems the token', async () => {
  const f = fixture({ incomplete: [email] });
  await f.call('send', { email });
  const password = 'correct-horse-battery';
  assert.equal((await f.call('register', { email, password, verificationToken: 'synthetic-token-1' })).statusCode, 400);
  const { verificationToken } = (await f.call('verify', { email, code: '482913' })).body;
  assert.equal((await f.call('register', { email: 'someone@gmail.com', password, verificationToken })).statusCode, 400);
  const weak = await f.call('register', { email, password: 'short', verificationToken });
  assert.equal(weak.statusCode, 400); assert.equal(weak.body.code, 'INVALID_PASSWORD');
  assert.deepEqual(f.state.created, []);
  const created = await f.call('register', { email: 'Juan.DelaCruz@gmail.com', password, verificationToken });
  assert.equal(created.statusCode, 200);
  // A leftover identity from an interrupted signup is cleared first; the address is stored normalized.
  assert.deepEqual(f.state.removed, [email]); assert.deepEqual(f.state.created, [{ email, password }]);
  assert.equal(f.db.read(record(email)), undefined);
  assert.equal((await f.call('register', { email, password, verificationToken })).statusCode, 400);
});
test('register never replaces a completed account and reports a taken address', async () => {
  const registered = [], f = fixture({ registered });
  await f.call('send', { email }); const { verificationToken } = (await f.call('verify', { email, code: '482913' })).body;
  registered.push(email);
  const refused = await f.call('register', { email, password: 'correct-horse-battery', verificationToken });
  assert.equal(refused.statusCode, 409); assert.equal(refused.body.code, 'EMAIL_ALREADY_REGISTERED'); assert.deepEqual(f.state.created, []);
  const race = fixture({ createAccount: async () => { throw Object.assign(Error('taken'), { code: 'auth/email-already-exists' }); } });
  await race.call('send', { email }); const second = (await race.call('verify', { email, code: '482913' })).body.verificationToken;
  const taken = await race.call('register', { email, password: 'correct-horse-battery', verificationToken: second });
  assert.equal(taken.statusCode, 409); assert.equal(taken.body.code, 'EMAIL_ALREADY_REGISTERED');
});
