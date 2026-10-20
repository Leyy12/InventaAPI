import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { effectiveSystemSettings, REGISTRATION_MESSAGE } from './system-settings-contract.mjs';
import { normalizeSignupEmail, validSignupEmail, validVerificationCode, VERIFICATION_CODE_TTL_SECONDS,
  VERIFICATION_RESEND_SECONDS, VERIFICATION_MAX_ATTEMPTS } from './email-verification-contract.mjs';

// Signup email ownership: send a code -> verify it for a single-use token -> the
// new Firebase identity redeems the token to become email_verified. Firestore only
// accepts a Customer profile from a verified identity (firestore.rules).
// Records are server-only, keyed by an email hash, and hold only hashed codes/tokens.
export const VERIFICATION_COLLECTION = 'email_verifications';
export const VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;
const SEND_WINDOW_MS = 60 * 60 * 1000, MAX_SENDS_PER_WINDOW = 5;
// Optional Firestore TTL field; a successful confirmation deletes the record anyway.
const RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE = 'Email verification is temporarily unavailable. Please try again later.';
const TOKEN_INVALID = 'Your email verification expired or does not match this account. Request a new code.';

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

export function verificationEmail(to, code) {
  const minutes = VERIFICATION_CODE_TTL_SECONDS / 60;
  const ignore = 'If you did not try to create an InventaAPI account, you can ignore this email. Never share this code with anyone.';
  return { to, subject: 'Your InventaAPI verification code',
    text: `Your InventaAPI verification code is ${code}.\n\nEnter this code on the sign-up page to confirm your email address. It expires in ${minutes} minutes.\n\n${ignore}`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">`
      + `<h1 style="font-size:20px;margin:0 0 16px">Verify your email address</h1>`
      + `<p style="margin:0 0 16px;line-height:1.5">Enter this code on the InventaAPI sign-up page to finish creating your account:</p>`
      + `<p style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:8px;margin:0 0 16px">${code}</p>`
      + `<p style="margin:0 0 16px;line-height:1.5">The code expires in ${minutes} minutes.</p>`
      + `<p style="margin:0;color:#64748b;font-size:13px;line-height:1.5">${ignore}</p></div>` };
}

export function createEmailVerificationHandlers({ getDb, emailRegistered, verifyIdToken, markEmailVerified, sendEmail,
  now = () => new Date(), createCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
  createToken = () => randomBytes(32).toString('base64url'),
  report = reason => console.warn(`[Email verification] Code delivery failed (${reason})`) }) {
  const recordRef = (db, email) => db.collection(VERIFICATION_COLLECTION).doc(sha256(email));
  const requestedEmail = body => {
    const email = normalizeSignupEmail(body?.email);
    if (!validSignupEmail(email)) throw new VerificationError(400, 'INVALID_EMAIL', 'Enter a valid email address.');
    return email;
  };
  const wrap = handler => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { return await handler(req, res); } catch (error) {
      if (!(error instanceof VerificationError)) return res.status(503).json({ success: false, code: 'VERIFICATION_UNAVAILABLE', error: UNAVAILABLE });
      if (error.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
      return res.status(error.status).json({ success: false, code: error.code, error: error.message,
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
    }
  };

  const send = wrap(async (req, res) => {
    const email = requestedEmail(req.body), db = getDb();
    if (!effectiveSystemSettings((await db.collection('system').doc('settings').get()).data()).allowNewRegistrations) {
      throw new VerificationError(403, 'REGISTRATION_CLOSED', REGISTRATION_MESSAGE);
    }
    if (await emailRegistered(email)) throw new VerificationError(409, 'EMAIL_ALREADY_REGISTERED', 'This email is already registered. Please sign in.');
    const at = now(), code = createCode(), salt = randomBytes(16).toString('hex'), ref = recordRef(db, email);
    // Per-address limits are shared by every backend instance: one code per minute, five per hour.
    const previousSentAt = await db.runTransaction(async tx => {
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
        tokenHash: null, tokenExpiresAt: null, verifiedAt: null, expireAt: new Date(at.getTime() + RECORD_RETENTION_MS) });
      return record.lastSentAt ?? null;
    });
    try { await sendEmail(verificationEmail(email, code)); } catch (error) {
      // An undelivered code is withdrawn and the cooldown released; the hourly count remains.
      try { await db.runTransaction(async tx => { tx.update(ref, { codeHash: null, codeSalt: null, lastSentAt: previousSentAt }); }); }
      catch { /* the cooldown still expires on its own */ }
      try { report(typeof error?.code === 'string' ? error.code : String(error?.message || 'unknown').slice(0, 120)); }
      catch { /* diagnostics never change the response */ }
      throw new VerificationError(503, 'EMAIL_DELIVERY_FAILED', 'We could not send the verification email. Please try again in a moment.');
    }
    return res.json({ success: true, expiresInSeconds: VERIFICATION_CODE_TTL_SECONDS, resendAvailableInSeconds: VERIFICATION_RESEND_SECONDS });
  });

  const verify = wrap(async (req, res) => {
    const email = requestedEmail(req.body), code = req.body?.code;
    if (!validVerificationCode(code)) throw new VerificationError(400, 'INVALID_CODE', 'Enter the 6-digit code from the email.');
    const db = getDb(), ref = recordRef(db, email), at = now(), token = createToken();
    // Failed attempts must commit, so outcomes are returned rather than thrown inside the transaction.
    const failure = await db.runTransaction(async tx => {
      const record = (await tx.get(ref)).data();
      if (!record?.codeHash) return [400, 'VERIFICATION_CODE_MISSING', 'No active code for this email. Request a new code.'];
      if (!(millis(record.codeExpiresAt) > at.getTime())) return [400, 'VERIFICATION_CODE_EXPIRED', 'This code has expired. Request a new code.'];
      if (!same(keyed(record.codeSalt, code), record.codeHash)) {
        const attempts = (record.attempts || 0) + 1, remaining = VERIFICATION_MAX_ATTEMPTS - attempts;
        tx.update(ref, remaining > 0 ? { attempts } : { attempts, codeHash: null, codeSalt: null });
        return remaining > 0 ? [400, 'VERIFICATION_CODE_INCORRECT', `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`]
          : [429, 'VERIFICATION_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.'];
      }
      tx.update(ref, { codeHash: null, codeSalt: null, attempts: 0, verifiedAt: at, tokenHash: sha256(token),
        tokenExpiresAt: new Date(at.getTime() + VERIFICATION_TOKEN_TTL_SECONDS * 1000), expireAt: new Date(at.getTime() + RECORD_RETENTION_MS) });
      return null;
    });
    if (failure) throw new VerificationError(...failure);
    return res.json({ success: true, verificationToken: token, expiresInSeconds: VERIFICATION_TOKEN_TTL_SECONDS });
  });

  // The identity's own email selects the record, so a token can only verify the inbox it was issued for.
  const confirm = wrap(async (req, res) => {
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
