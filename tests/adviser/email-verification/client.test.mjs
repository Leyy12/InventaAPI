import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendSignupCode, verifySignupCode, confirmSignupEmail, completeCustomerSignup, TERMS_VERSION,
  normalizeSignupEmail, validSignupEmail, sendPasswordResetCode, resetPasswordWithCode, validNewPassword,
  PASSWORD_MIN_LENGTH } from '../../../services/customer-registration.mjs';

// Browser-side registration helpers with a synthetic fetch; nothing leaves the process.
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const unavailable = /Email verification is unavailable right now/u;

test('signup addresses normalize to the Firebase Auth form before validation', () => {
  assert.equal(normalizeSignupEmail('  Juan.DelaCruz@GMAIL.com\t'), 'juan.delacruz@gmail.com');
  assert.equal(normalizeSignupEmail(undefined), '');
  for (const value of ['juan.delacruz@gmail.com', 'dev+inventa@company.com.ph', 'o\'brien@shop.ph']) assert.equal(validSignupEmail(value), true, value);
  for (const value of ['Juan@gmail.com', 'juan@gmail', 'juan@@gmail.com', 'juan@gmail.c', 'ju an@gmail.com', '']) assert.equal(validSignupEmail(value), false, value);
});
test('send and verify call the API origin and surface only short server messages', async () => {
  const requests = [];
  const sent = await sendSignupCode({ base: 'https://api.inventa-release.com', email: 'juan@gmail.com',
    request: async (url, init) => { requests.push([url, init]); return response(200, { success: true, expiresInSeconds: 600, resendAvailableInSeconds: 60 }); } });
  assert.deepEqual(sent, { ok: true, message: '', retryAfterSeconds: 0, resendAvailableInSeconds: 60 });
  const [url, init] = requests[0];
  assert.equal(url, 'https://api.inventa-release.com/api/v1/auth/email-verification/send');
  assert.equal(init.method, 'POST'); assert.equal(init.cache, 'no-store'); assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.headers['Content-Type'], 'application/json'); assert.deepEqual(JSON.parse(init.body), { email: 'juan@gmail.com' });
  const cooldown = await sendSignupCode({ base: 'https://api', email: 'juan@gmail.com', request: async () => response(429,
    { success: false, code: 'VERIFICATION_RESEND_COOLDOWN', error: 'Please wait 42 seconds before requesting another code.', retryAfterSeconds: 42 }) });
  assert.deepEqual(cooldown, { ok: false, message: 'Please wait 42 seconds before requesting another code.', retryAfterSeconds: 42, resendAvailableInSeconds: 60 });
  for (const request of [async () => { throw TypeError('offline'); }, async () => ({ ok: false, status: 502, json: async () => { throw SyntaxError('html'); } }),
    async () => response(400, { success: false, error: 'x'.repeat(201) }), async () => response(200, { success: false })]) {
    const result = await sendSignupCode({ base: 'https://api', email: 'juan@gmail.com', request });
    assert.equal(result.ok, false); assert.match(result.message, unavailable);
  }
  const verified = await verifySignupCode({ base: 'https://api', email: 'juan@gmail.com', code: '482913', request: async (address, options) => {
    assert.equal(address, 'https://api/api/v1/auth/email-verification/verify');
    assert.deepEqual(JSON.parse(options.body), { email: 'juan@gmail.com', code: '482913' });
    return response(200, { success: true, verificationToken: 'token-1', expiresInSeconds: 1800 });
  } });
  assert.deepEqual(verified, { ok: true, message: '', verificationToken: 'token-1' });
  const incorrect = await verifySignupCode({ base: 'https://api', email: 'juan@gmail.com', code: '000000',
    request: async () => response(400, { success: false, code: 'VERIFICATION_CODE_INCORRECT', error: 'Incorrect code. 4 attempts remaining.' }) });
  assert.deepEqual(incorrect, { ok: false, message: 'Incorrect code. 4 attempts remaining.', verificationToken: '' });
  const tokenless = await verifySignupCode({ base: 'https://api', email: 'juan@gmail.com', code: '482913', request: async () => response(200, { success: true }) });
  assert.equal(tokenless.ok, false); assert.match(tokenless.message, unavailable);
});
test('confirm sends the new identity\'s ID token and requires a refreshed email_verified claim', async () => {
  const calls = [];
  const user = { getIdToken: async () => { calls.push('id-token'); return 'synthetic-id-token'; },
    getIdTokenResult: async force => { calls.push(['refresh', force]); return { claims: { email_verified: true } }; } };
  await confirmSignupEmail({ base: 'https://api', user, verificationToken: 'token-1', request: async (url, init) => {
    calls.push('confirm');
    assert.equal(url, 'https://api/api/v1/auth/email-verification/confirm');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-id-token');
    assert.deepEqual(JSON.parse(init.body), { verificationToken: 'token-1' });
    return response(200, { success: true });
  } });
  assert.deepEqual(calls, ['id-token', 'confirm', ['refresh', true]]);
  await assert.rejects(confirmSignupEmail({ base: 'https://api', user, verificationToken: 'token-1',
    request: async () => response(400, { success: false, error: 'Your email verification expired or does not match this account. Request a new code.' }) }), /expired/u);
  const stale = { ...user, getIdTokenResult: async () => ({ claims: { email_verified: false } }) };
  await assert.rejects(confirmSignupEmail({ base: 'https://api', user: stale, verificationToken: 'token-1',
    request: async () => response(200, { success: true }) }), /not applied/u);
});
test('registration confirms the email before the profile and removes an unconfirmed identity', async () => {
  const events = [];
  const flow = { canRegister: async () => true, createUser: async () => { events.push('create'); return { uid: 'new-only' }; },
    writeProfile: async () => { events.push('profile'); }, profileExists: async () => false,
    deleteUser: async user => { assert.equal(user.uid, 'new-only'); events.push('delete'); }, signOut: async () => { events.push('signout'); } };
  assert.deepEqual(await completeCustomerSignup({ ...flow, confirmEmail: async () => { events.push('confirm'); } }), { ok: true, message: '' });
  assert.deepEqual(events, ['create', 'confirm', 'profile', 'signout']);
  events.length = 0;
  const failed = await completeCustomerSignup({ ...flow, confirmEmail: async () => { events.push('confirm'); throw Error('expired'); } });
  assert.equal(failed.ok, false); assert.match(failed.message, /could not confirm your verified email address/u);
  assert.deepEqual(events, ['create', 'confirm', 'delete', 'signout']);
});
test('the Terms page displays the version every new profile records', () => {
  assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/u);
  const page = readFileSync(new URL('../../../dashboard/src/app/terms-of-service/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes(`Version ${TERMS_VERSION}`));
  assert.match(page, /Acceptable Use Policy/u); assert.match(page, /6-digit verification code/u);
});
test('password reset calls the API origin and surfaces only short server messages', async () => {
  const requests = [];
  const request = async (url, init) => { requests.push([url, JSON.parse(init.body), init]);
    return response(200, { success: true, expiresInSeconds: 600, resendAvailableInSeconds: 60 }); };
  assert.deepEqual(await sendPasswordResetCode({ base: 'https://api.inventa-release.com', email: 'juan@gmail.com', request }),
    { ok: true, message: '', retryAfterSeconds: 0, resendAvailableInSeconds: 60 });
  assert.deepEqual(await resetPasswordWithCode({ base: 'https://api.inventa-release.com', email: 'juan@gmail.com', code: '482913',
    password: 'new-synthetic-password', request: async (url, init) => { requests.push([url, JSON.parse(init.body), init]); return response(200, { success: true }); } }),
    { ok: true, message: '' });
  assert.deepEqual(requests.map(([url, body]) => [url, body]), [
    ['https://api.inventa-release.com/api/v1/auth/password-reset/send', { email: 'juan@gmail.com' }],
    ['https://api.inventa-release.com/api/v1/auth/password-reset/confirm', { email: 'juan@gmail.com', code: '482913', password: 'new-synthetic-password' }]]);
  for (const [, , init] of requests) {
    assert.equal(init.method, 'POST'); assert.equal(init.cache, 'no-store'); assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.Authorization, undefined);
  }
  const incorrect = await resetPasswordWithCode({ base: 'https://api', email: 'juan@gmail.com', code: '000000', password: 'new-synthetic-password',
    request: async () => response(400, { success: false, code: 'VERIFICATION_CODE_INCORRECT', error: 'Incorrect code. 4 attempts remaining.' }) });
  assert.deepEqual(incorrect, { ok: false, message: 'Incorrect code. 4 attempts remaining.' });
  const cooldown = await sendPasswordResetCode({ base: 'https://api', email: 'juan@gmail.com', request: async () => response(429,
    { success: false, error: 'Please wait 42 seconds before requesting another code.', retryAfterSeconds: 42 }) });
  assert.deepEqual(cooldown, { ok: false, message: 'Please wait 42 seconds before requesting another code.', retryAfterSeconds: 42, resendAvailableInSeconds: 60 });
  for (const failing of [async () => { throw TypeError('offline'); }, async () => response(500, { success: false, error: 'x'.repeat(201) })]) {
    assert.match((await sendPasswordResetCode({ base: 'https://api', email: 'juan@gmail.com', request: failing })).message, /Password reset is unavailable right now/u);
    assert.match((await resetPasswordWithCode({ base: 'https://api', email: 'juan@gmail.com', code: '482913', password: 'x'.repeat(8), request: failing })).message,
      /Password reset is unavailable right now/u);
  }
});
test('new passwords follow Firebase Auth\'s minimum and reject absurd input', () => {
  assert.equal(PASSWORD_MIN_LENGTH, 6);
  for (const value of ['secret', 'x'.repeat(256), 'pass word']) assert.equal(validNewPassword(value), true, value.slice(0, 12));
  for (const value of ['', 'short', 'x'.repeat(257), 123456, null, undefined]) assert.equal(validNewPassword(value), false, String(value).slice(0, 12));
});
