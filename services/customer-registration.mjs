import { REGISTRATION_MESSAGE } from './system-settings-contract.mjs';
import { VERIFICATION_RESEND_SECONDS } from './email-verification-contract.mjs';
export { normalizeSignupEmail, validSignupEmail, validVerificationCode, validNewPassword, PASSWORD_MIN_LENGTH,
  VERIFICATION_CODE_TTL_SECONDS } from './email-verification-contract.mjs';

// Version of the Terms of Service & Acceptable Use Policy a new profile accepts.
// Change together with the "Version" shown on dashboard/src/app/terms-of-service/page.tsx.
export const TERMS_VERSION = '2026-10-20';
const EMAIL_UNCONFIRMED_MESSAGE = 'We could not confirm your verified email address. Request a new code and try again.';
const VERIFICATION_UNAVAILABLE = 'Email verification is unavailable right now. Please try again later.';
const RESET_UNAVAILABLE = 'Password reset is unavailable right now. Please try again later.';

export async function readRegistrationPolicy(request = globalThis.fetch) {
  const response = await request('/api/v1/system/status', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Registration policy unavailable');
  const body = await response.json();
  if (body.success !== true || typeof body.allowNewRegistrations !== 'boolean') throw new Error('Registration policy unavailable');
  return body.allowNewRegistrations;
}

// Verification calls go to the API origin itself, never the frontend rewrite, so the
// backend's per-IP limits see the real client. Only its short user-facing messages are shown.
async function verificationCall(request, url, payload, headers = {}, unavailable = VERIFICATION_UNAVAILABLE) {
  let response, body;
  try {
    response = await request(url, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
    body = await response.json();
  } catch { return { ok: false, message: unavailable, retryAfterSeconds: 0, body: {} }; }
  if (response.ok && body?.success === true) return { ok: true, message: '', retryAfterSeconds: 0, body };
  return { ok: false, message: typeof body?.error === 'string' && body.error.length <= 200 ? body.error : unavailable,
    retryAfterSeconds: Number.isInteger(body?.retryAfterSeconds) ? body.retryAfterSeconds : 0, body: {} };
}
const codeRequest = result => ({ ok: result.ok, message: result.message, retryAfterSeconds: result.retryAfterSeconds,
  resendAvailableInSeconds: Number.isInteger(result.body.resendAvailableInSeconds) ? result.body.resendAvailableInSeconds : VERIFICATION_RESEND_SECONDS });

export async function sendSignupCode({ base, email, request = globalThis.fetch }) {
  return codeRequest(await verificationCall(request, `${base}/api/v1/auth/email-verification/send`, { email }));
}

// The backend answers alike whether or not the address has an account; only an account's inbox gets a code.
export async function sendPasswordResetCode({ base, email, request = globalThis.fetch }) {
  return codeRequest(await verificationCall(request, `${base}/api/v1/auth/password-reset/send`, { email }, {}, RESET_UNAVAILABLE));
}

export async function resetPasswordWithCode({ base, email, code, password, request = globalThis.fetch }) {
  const result = await verificationCall(request, `${base}/api/v1/auth/password-reset/confirm`, { email, code, password }, {}, RESET_UNAVAILABLE);
  return { ok: result.ok, message: result.message };
}

export async function verifySignupCode({ base, email, code, request = globalThis.fetch }) {
  const result = await verificationCall(request, `${base}/api/v1/auth/email-verification/verify`, { email, code });
  const verificationToken = result.ok && typeof result.body.verificationToken === 'string' ? result.body.verificationToken : '';
  return { ok: !!verificationToken, message: result.ok && !verificationToken ? VERIFICATION_UNAVAILABLE : result.message, verificationToken };
}

// The backend marks the new identity email_verified. Firestore evaluates the ID token,
// so the profile write must wait for a refreshed token that carries that claim.
export async function confirmSignupEmail({ base, user, verificationToken, request = globalThis.fetch }) {
  const result = await verificationCall(request, `${base}/api/v1/auth/email-verification/confirm`,
    { verificationToken }, { Authorization: `Bearer ${await user.getIdToken()}` });
  if (!result.ok) throw new Error(result.message);
  if ((await user.getIdTokenResult(true)).claims?.email_verified !== true) throw new Error('Email verification was not applied.');
}

// Firebase Auth creation is not a completed InventaAPI registration. The
// authoritative Firestore rule evaluates server-owned settings at profile commit.
export async function completeCustomerSignup({ canRegister, createUser, confirmEmail, writeProfile, profileExists, deleteUser, signOut }) {
  try { if (!await canRegister()) return { ok: false, message: REGISTRATION_MESSAGE }; }
  catch { return { ok: false, message: 'Registration availability could not be verified. Please try again later.' }; }
  let user;
  try { user = await createUser(); } catch (error) {
    return { ok: false, message: error?.code === 'auth/email-already-in-use'
      ? 'This email is already registered. Please sign in.' : 'Unable to create your account. Please try again later.' };
  }
  let committed = false, unavailable = false, cleanupVerified = true, confirmed = !confirmEmail;
  try {
    // The profile rule requires a verified identity; an unconfirmed one is cleaned up below.
    if (confirmEmail) { await confirmEmail(user); confirmed = true; }
    await writeProfile(user); committed = true;
  } catch {
    try {
      committed = await profileExists(user);
      // A failed/uncertain response may follow a successful commit. Never delete
      // its Auth identity. Cleanup only this newly-created user's missing profile.
      if (!committed) { try { await deleteUser(user); } catch { cleanupVerified = false; } }
    } catch { cleanupVerified = false; }
    try { unavailable = !await canRegister(); } catch { /* retain generic unavailable message */ }
  }
  try { await signOut(); } catch {
    return { ok: false, message: 'Your session could not be closed. Sign out before continuing; do not create another account.' };
  }
  if (committed) return { ok: true, message: '' };
  return { ok: false, message: !cleanupVerified
    ? 'Account setup could not be verified. Please contact support before trying again.'
    : unavailable ? REGISTRATION_MESSAGE : !confirmed ? EMAIL_UNCONFIRMED_MESSAGE : 'Account setup could not be completed. Please try again later.' };
}
