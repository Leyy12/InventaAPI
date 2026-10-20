import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { effectiveSystemSettings, REGISTRATION_MESSAGE } from './system-settings-contract.mjs';
import { normalizeSignupEmail, validSignupEmail, validVerificationCode, validNewPassword, PASSWORD_MIN_LENGTH,
  VERIFICATION_CODE_TTL_SECONDS, VERIFICATION_RESEND_SECONDS, VERIFICATION_MAX_ATTEMPTS } from './email-verification-contract.mjs';

// Signup email ownership: send a code -> verify it for a single-use token -> the
// new Firebase identity redeems the token to become email_verified. Firestore only
// accepts a Customer profile from a verified identity (firestore.rules).
// Password reset: send a code -> the code plus a new password changes the password.
// Records are server-only, keyed by an email hash, and hold only hashed codes/tokens.
export const VERIFICATION_COLLECTION = 'email_verifications';
export const PASSWORD_RESET_COLLECTION = 'password_resets';
export const VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;
const SEND_WINDOW_MS = 60 * 60 * 1000, MAX_SENDS_PER_WINDOW = 5;
// Optional Firestore TTL field; a successful confirmation deletes the record anyway.
const RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE = 'Email verification is temporarily unavailable. Please try again later.';
const RESET_UNAVAILABLE = 'Password reset is temporarily unavailable. Please try again later.';
const TOKEN_INVALID = 'Your email verification expired or does not match this account. Request a new code.';
const CODE_MISSING = 'No active code for this email. Request a new code.';
// Firebase reports a password that fails the project's password policy with one of these.
const PASSWORD_REJECTED = ['auth/invalid-password', 'auth/password-does-not-meet-requirements'];

class VerificationError extends Error {
  constructor(status, code, message, retryAfterSeconds) { super(message); Object.assign(this, { status, code, retryAfterSeconds }); }
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const keyed = (salt, value) => createHmac('sha256', salt).update(value).digest('hex');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Admin SDK reads Timestamps; tests and fresh writes use Dates.
const millis = value => value instanceof Date ? value.getTime() : typeof value?.toMillis === 'function' ? value.toMillis() : NaN;
const seconds = ms => Math.max(1, Math.ceil(ms / 1000));
const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const reportDeliveryFailure = reason => console.warn(`[Email verification] Code delivery failed (${reason})`);

const codeEmailHtml = (heading, instruction, code, ignore) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">`
  + `<h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>`
  + `<p style="margin:0 0 16px;line-height:1.5">${instruction}</p>`
  + `<p style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:8px;margin:0 0 16px">${code}</p>`
  + `<p style="margin:0 0 16px;line-height:1.5">The code expires in ${VERIFICATION_CODE_TTL_SECONDS / 60} minutes.</p>`
  + `<p style="margin:0;color:#64748b;font-size:13px;line-height:1.5">${ignore}</p></div>`;

export function verificationEmail(to, code) {
  const minutes = VERIFICATION_CODE_TTL_SECONDS / 60;
  const ignore = 'If you did not try to create an InventaAPI account, you can ignore this email. Never share this code with anyone.';
  return { to, subject: 'Your InventaAPI verification code',
    text: `Your InventaAPI verification code is ${code}.\n\nEnter this code on the sign-up page to confirm your email address. It expires in ${minutes} minutes.\n\n${ignore}`,
    html: codeEmailHtml('Verify your email address', 'Enter this code on the InventaAPI sign-up page to finish creating your account:', code, ignore) };
}

export function passwordResetEmail(to, code) {
  const minutes = VERIFICATION_CODE_TTL_SECONDS / 60;
  const ignore = 'If you did not ask to reset your password, you can ignore this email and your password will stay the same. Never share this code with anyone.';
  return { to, subject: 'Your InventaAPI password reset code',
    text: `Your InventaAPI password reset code is ${code}.\n\nEnter this code on the login page to choose a new password. It expires in ${minutes} minutes.\n\n${ignore}`,
    html: codeEmailHtml('Reset your password', 'Enter this code on the InventaAPI login page to choose a new password:', code, ignore) };
}

const requestedEmail = body => {
  const email = normalizeSignupEmail(body?.email);
  if (!validSignupEmail(email)) throw new VerificationError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
  return email;
};
const respond = (handler, unavailable = UNAVAILABLE, unavailableCode = 'VERIFICATION_UNAVAILABLE') => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { return await handler(req, res); } catch (error) {
    if (!(error instanceof VerificationError)) return res.status(503).json({ success: false, code: unavailableCode, error: unavailable });
    if (error.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
    return res.status(error.status).json({ success: false, code: error.code, error: error.message,
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
  }
};
const codeSent = { success: true, expiresInSeconds: VERIFICATION_CODE_TTL_SECONDS, resendAvailableInSeconds: VERIFICATION_RESEND_SECONDS };

// Stores a new hashed code. Per-address limits are shared by every backend instance:
// one code per minute, five per hour. Resolves to the previous send time.
function issueCode(db, ref, at, code, fields = {}) {
  const salt = randomBytes(16).toString('hex');
  return db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data() || {};
    const wait = millis(record.lastSentAt) + VERIFICATION_RESEND_SECONDS * 1000 - at.getTime();
    if (wait > 0) throw new VerificationError(429, 'VERIFICATION_RESEND_COOLDOWN',
      `Please wait ${seconds(wait)} seconds before requesting another code.`, seconds(wait));
    const windowStart = millis(record.sendWindowStartedAt), current = at.getTime() - windowStart < SEND_WINDOW_MS;
    const sendCount = current ? record.sendCount || 0 : 0;
    if (sendCount >= MAX_SENDS_PER_WINDOW) throw new VerificationError(429, 'VERIFICATION_SEND_LIMIT',
      'Too many codes were requested for this email. Please try again later.', seconds(windowStart + SEND_WINDOW_MS - at.getTime()));
    tx.set(ref, { codeHash: keyed(salt, code), codeSalt: salt, attempts: 0,
      codeExpiresAt: new Date(at.getTime() + VERIFICATION_CODE_TTL_SECONDS * 1000),
      lastSentAt: at, sendCount: sendCount + 1, sendWindowStartedAt: current ? record.sendWindowStartedAt : at,
      ...fields, expireAt: new Date(at.getTime() + RECORD_RETENTION_MS) });
    return record.lastSentAt ?? null;
  });
}

async function deliverCode({ db, ref, previousSentAt, sendEmail, message, report, failure }) {
  try { await sendEmail(message); } catch (error) {
    // An undelivered code is withdrawn and the cooldown released; the hourly count remains.
    try { await db.runTransaction(async tx => { tx.update(ref, { codeHash: null, codeSalt: null, lastSentAt: previousSentAt }); }); }
    catch { /* the cooldown still expires on its own */ }
    try { report(typeof error?.code === 'string' ? error.code : String(error?.message || 'unknown').slice(0, 120)); }
    catch { /* diagnostics never change the response */ }
    throw new VerificationError(503, 'EMAIL_DELIVERY_FAILED', failure);
  }
}

// Failed attempts must commit, so outcomes are returned rather than thrown inside the transaction.
// A correct code runs `matched` in the same transaction.
function redeemCode(db, ref, at, code, matched) {
  return db.runTransaction(async tx => {
    const record = (await tx.get(ref)).data();
    if (!record?.codeHash) return [400, 'VERIFICATION_CODE_MISSING', CODE_MISSING];
    if (!(millis(record.codeExpiresAt) > at.getTime())) return [400, 'VERIFICATION_CODE_EXPIRED', 'This code has expired. Request a new code.'];
    if (!same(keyed(record.codeSalt, code), record.codeHash)) {
      const attempts = (record.attempts || 0) + 1, remaining = VERIFICATION_MAX_ATTEMPTS - attempts;
      tx.update(ref, remaining > 0 ? { attempts } : { attempts, codeHash: null, codeSalt: null });
      return remaining > 0 ? [400, 'VERIFICATION_CODE_INCORRECT', `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`]
        : [429, 'VERIFICATION_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.'];
    }
    matched(tx);
    return null;
  });
}

export function createEmailVerificationHandlers({ getDb, emailRegistered, verifyIdToken, markEmailVerified, sendEmail,
  now = () => new Date(), createCode = sixDigitCode,
  createToken = () => randomBytes(32).toString('base64url'),
  report = reportDeliveryFailure }) {
  const recordRef = (db, email) => db.collection(VERIFICATION_COLLECTION).doc(sha256(email));

  const send = respond(async (req, res) => {
    const email = requestedEmail(req.body), db = getDb();
    if (!effectiveSystemSettings((await db.collection('system').doc('settings').get()).data()).allowNewRegistrations) {
      throw new VerificationError(403, 'REGISTRATION_CLOSED', REGISTRATION_MESSAGE);
    }
    if (await emailRegistered(email)) throw new VerificationError(409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered. Please sign in.');
    const at = now(), code = createCode(), ref = recordRef(db, email);
    const previousSentAt = await issueCode(db, ref, at, code, { tokenHash: null, tokenExpiresAt: null, verifiedAt: null });
    await deliverCode({ db, ref, previousSentAt, sendEmail, message: verificationEmail(email, code), report,
      failure: 'We could not send the verification email. Please try again in a moment.' });
    return res.json(codeSent);
  });

  const verify = respond(async (req, res) => {
    const email = requestedEmail(req.body), code = req.body?.code;
    if (!validVerificationCode(code)) throw new VerificationError(400, 'INVALID_CODE', 'Enter the 6-digit code from the email.');
    const db = getDb(), ref = recordRef(db, email), at = now(), token = createToken();
    const failure = await redeemCode(db, ref, at, code, tx => tx.update(ref, { codeHash: null, codeSalt: null, attempts: 0,
      verifiedAt: at, tokenHash: sha256(token), tokenExpiresAt: new Date(at.getTime() + VERIFICATION_TOKEN_TTL_SECONDS * 1000),
      expireAt: new Date(at.getTime() + RECORD_RETENTION_MS) }));
    if (failure) throw new VerificationError(...failure);
    return res.json({ success: true, verificationToken: token, expiresInSeconds: VERIFICATION_TOKEN_TTL_SECONDS });
  });

  // The identity's own email selects the record, so a token can only verify the inbox it was issued for.
  const confirm = respond(async (req, res) => {
    const bearer = typeof req.headers?.authorization === 'string' ? /^Bearer ([^\s]+)$/u.exec(req.headers.authorization) : null;
    let actor;
    try { actor = bearer && await verifyIdToken(bearer[1], true); } catch { actor = null; }
    if (typeof actor?.uid !== 'string' || !actor.uid) throw new VerificationError(401, 'UNAUTHENTICATED', 'Your sign-up session could not be verified.');
    const email = normalizeSignupEmail(actor.email), token = req.body?.verificationToken;
    if (!validSignupEmail(email) || typeof token !== 'string' || token.length > 128) throw new VerificationError(400, 'VERIFICATION_TOKEN_INVALID', TOKEN_INVALID);
    const db = getDb(), ref = recordRef(db, email), record = (await ref.get()).data();
    if (!same(sha256(token), record?.tokenHash) || !(millis(record.tokenExpiresAt) > now().getTime())) {
      throw new VerificationError(400, 'VERIFICATION_TOKEN_INVALID', TOKEN_INVALID);
    }
    await markEmailVerified(actor.uid);
    // Redeemed: remove the record. If removal fails the token only re-verifies this same inbox until it expires.
    try { await db.runTransaction(async tx => { tx.delete(ref); }); } catch { /* bounded by tokenExpiresAt */ }
    return res.json({ success: true });
  });

  return { send, verify, confirm };
}

// Password recovery by emailed code. An unknown or disabled address gets the same reply and
// no email. `findAccount` resolves an address to its Firebase uid, or null.
export function createPasswordResetHandlers({ getDb, findAccount, setPassword, revokeSessions, sendEmail,
  now = () => new Date(), createCode = sixDigitCode, report = reportDeliveryFailure }) {
  const recordRef = (db, email) => db.collection(PASSWORD_RESET_COLLECTION).doc(sha256(email));
  const handle = handler => respond(handler, RESET_UNAVAILABLE, 'PASSWORD_RESET_UNAVAILABLE');

  const send = handle(async (req, res) => {
    const email = requestedEmail(req.body);
    if (!await findAccount(email)) return res.json(codeSent);
    const db = getDb(), at = now(), code = createCode(), ref = recordRef(db, email);
    const previousSentAt = await issueCode(db, ref, at, code);
    await deliverCode({ db, ref, previousSentAt, sendEmail, message: passwordResetEmail(email, code), report,
      failure: 'We could not send the password reset email. Please try again in a moment.' });
    return res.json(codeSent);
  });

  const confirm = handle(async (req, res) => {
    const email = requestedEmail(req.body), code = req.body?.code, password = req.body?.password;
    if (!validVerificationCode(code)) throw new VerificationError(400, 'INVALID_CODE', 'Enter the 6-digit code from the email.');
    if (!validNewPassword(password)) throw new VerificationError(400, 'INVALID_PASSWORD', `Choose a password with at least ${PASSWORD_MIN_LENGTH} characters.`);
    const db = getDb(), ref = recordRef(db, email);
    // Single use: the transaction that accepts the code also deletes it.
    const failure = await redeemCode(db, ref, now(), code, tx => tx.delete(ref));
    if (failure) throw new VerificationError(...failure);
    const uid = await findAccount(email);
    if (!uid) throw new VerificationError(400, 'VERIFICATION_CODE_MISSING', CODE_MISSING);
    try { await setPassword(uid, password); } catch (error) {
      if (PASSWORD_REJECTED.includes(error?.code)) throw new VerificationError(400, 'PASSWORD_REJECTED',
        'That password cannot be used. Request a new code and choose a different password.');
      throw error;
    }
    // Other signed-in sessions must log in again. Firebase also expires them on a password change.
    try { await revokeSessions(uid); } catch { /* the password change already invalidates older sessions */ }
    return res.json({ success: true });
  });

  return { send, confirm };
}
