import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { evaluateEntitlement, PLAN_LEVELS } from '../functions/subscription-lifecycle.mjs';
export { PLAN_LEVELS };

export class ApiSecurityError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

const own = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const SECURE_CREDENTIAL = /^daas_v2_([a-f0-9]{32})\.([a-f0-9]{64})$/;

export function validDocumentId(id) {
  return typeof id === 'string' && id.length > 0 && id.trim() === id
    && !/[\/\u0000-\u001f\u007f]/u.test(id) && !['.', '..'].includes(id)
    && !/^__.*__$/u.test(id) && Buffer.byteLength(id, 'utf8') <= 1500;
}

export function issueCredential() {
  const id = randomBytes(16).toString('hex');
  const credential = `daas_v2_${id}.${randomBytes(32).toString('hex')}`;
  return {
    id,
    credential,
    stored: { credentialVersion: 2, credentialHash: digest(credential), keyPrefix: `daas_v2_${id.slice(0, 8)}` },
  };
}

export function parseCredential(credential) {
  if (typeof credential !== 'string' || credential.length > 256) return null;
  const secure = SECURE_CREDENTIAL.exec(credential);
  if (secure) return { version: 2, id: secure[1] };
  // Reserve versioned syntax, including malformed/unknown versions: no downgrade.
  if (/^daas_v\d/u.test(credential)) return null;
  return /^daas_[A-Za-z0-9_-]+$/u.test(credential) ? { version: 1 } : null;
}

export function credentialMatches(id, key, credential) {
  const parsed = parseCredential(credential);
  if (!key || !parsed) return false;
  if (parsed.version === 2) {
    if (parsed.id !== id || key.credentialVersion !== 2
      || typeof key.credentialHash !== 'string' || !/^[a-f0-9]{64}$/u.test(key.credentialHash)) return false;
    return timingSafeEqual(Buffer.from(key.credentialHash, 'hex'), Buffer.from(digest(credential), 'hex'));
  }
  if (own(key, 'credentialVersion') || own(key, 'credentialHash') || own(key, 'keyPrefix')) return false;
  return typeof key.key === 'string'
    && timingSafeEqual(Buffer.from(digest(key.key), 'hex'), Buffer.from(digest(credential), 'hex'));
}

export function assertActiveKey(key, now = new Date()) {
  if (!key || key.status !== 'active' || !validDocumentId(key.userId)) {
    throw new ApiSecurityError(401, 'INVALID_API_KEY', 'Invalid, inactive, or revoked API key.');
  }
  // Credential expiry only. subscriptionExpiresAt is deliberately not read here.
  if (key.expiresAt != null) {
    let expiry;
    try {
      expiry = typeof key.expiresAt.toDate === 'function' ? key.expiresAt.toDate() : new Date(key.expiresAt);
    } catch { expiry = new Date(NaN); }
    if (!Number.isFinite(expiry.getTime()) || expiry <= now) {
      throw new ApiSecurityError(401, 'EXPIRED_API_KEY', 'API key has expired or has invalid expiry data.');
    }
  }
}

export async function authenticateCredential(db, credential, now = new Date()) {
  const parsed = parseCredential(credential);
  let snapshot;
  if (parsed?.version === 2) {
    snapshot = await db.collection('api_keys').doc(parsed.id).get();
  } else if (parsed?.version === 1) {
    const matches = await db.collection('api_keys').where('key', '==', credential).limit(2).get();
    if (matches.docs.length === 1) snapshot = matches.docs[0];
  }
  if (!snapshot?.exists || !credentialMatches(snapshot.id, snapshot.data(), credential)) {
    throw new ApiSecurityError(401, 'INVALID_API_KEY', 'Invalid, inactive, or revoked API key.');
  }
  const key = snapshot.data();
  assertActiveKey(key, now);
  return { ...key, id: snapshot.id };
}

export function accountEntitlement(account, now = new Date()) {
  try { return evaluateEntitlement(account, now); }
  catch (error) { throw new ApiSecurityError(error.status || 503, error.code || 'ENTITLEMENT_UNAVAILABLE', error.message); }
}

export function upgradeRequiredError() {
  return new ApiSecurityError(403, 'UPGRADE_REQUIRED', 'Your Free Trial has ended. Upgrade to Pro to continue using the API.');
}

export function usageForToday(stored, now = new Date()) {
  const window = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const storedDay = typeof stored?.window === 'string' ? new Date(`${stored.window}T00:00:00.000Z`) : null;
  if (stored && (typeof stored.window !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(stored.window)
    || !Number.isFinite(storedDay?.getTime()) || storedDay.toISOString().slice(0, 10) !== stored.window
    || stored.window > window || !Number.isSafeInteger(stored.used) || stored.used < 0)) {
    throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to verify account usage.');
  }
  if (stored && Object.hasOwn(stored, 'holdUntil')) {
    const boundary = new Date(storedDay);
    boundary.setUTCDate(boundary.getUTCDate() + 1);
    if (stored.holdUntil !== boundary.toISOString() || stored.used !== 0) {
      throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to verify account cutover state.');
    }
  }
  return { window, used: stored?.window === window ? stored.used : 0, resetsAt: tomorrow.toISOString(),
    ...(stored?.window === window && stored.holdUntil ? { holdUntil: stored.holdUntil } : {}) };
}

export function publicKeyMetadata(id, key, entitlement, usage) {
  // An allowlist prevents plaintext legacy credentials, hashes, and future secrets leaking.
  return {
    id, name: key.name || '', status: key.status, userId: key.userId,
    keyPrefix: key.credentialVersion === 2 ? key.keyPrefix : 'daas_legacy',
    credentialVersion: key.credentialVersion === 2 ? 2 : 1,
    createdAt: key.createdAt ?? null, lastUsed: key.lastUsed ?? null, expiresAt: key.expiresAt ?? null,
    linkedProductIds: key.linkedProductIds || [], linkedVariantSelections: key.linkedVariantSelections || {},
    plan: entitlement.plan, requestLimit: entitlement.limit, requestsUsed: usage.used,
    usageScope: 'account', resetAt: usage.resetsAt,
    quotaPeriod: usage.period || 'daily',
    quotaState: usage.state === 'upgrade_required' ? 'upgrade_required' : usage.holdUntil ? 'pending_clean_window' : 'active',
  };
}

// Separate from paid daily usage and daily key-generation markers. Never infer
// this month's opening balance from a legacy daily/per-key counter.
export function freeMonthlyUsage(stored, accountSnapshot, now = new Date(), cutoverAt = null) {
  const window = now.toISOString().slice(0, 7);
  const next = new Date(now); next.setUTCDate(1); next.setUTCHours(0, 0, 0, 0); next.setUTCMonth(next.getUTCMonth() + 1);
  const resetsAt = next.toISOString();
  if (stored) {
    const start = typeof stored.window === 'string' ? new Date(`${stored.window}-01T00:00:00.000Z`) : new Date(NaN);
    if (!/^\d{4}-\d{2}$/u.test(stored.window) || !Number.isFinite(start.getTime())
      || start.toISOString().slice(0, 7) !== stored.window || stored.window > window
      || !Number.isSafeInteger(stored.used) || stored.used < 0) {
      throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to verify monthly account usage.');
    }
    if (Object.hasOwn(stored, 'holdUntil')) {
      start.setUTCMonth(start.getUTCMonth() + 1);
      if (stored.holdUntil !== start.toISOString() || stored.used !== 0) throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to verify monthly cutover state.');
    }
    return { window, period: 'monthly', used: stored.window === window ? stored.used : 0, resetsAt,
      ...(stored.window === window && stored.holdUntil ? { holdUntil: stored.holdUntil } : {}) };
  }
  let newAccount = false;
  try {
    const cutoff = new Date(cutoverAt), created = accountSnapshot?.createTime?.toDate();
    newAccount = typeof cutoverAt === 'string' && cutoff.toISOString() === cutoverAt && cutoff <= now
      && created instanceof Date && created > cutoff && created <= now;
  } catch { /* Unknown provenance fails closed. */ }
  return { window, period: 'monthly', used: 0, resetsAt, ...(!newAccount ? { holdUntil: resetsAt } : {}) };
}

export function trialUsage(stored, entitlement) {
  if (!stored || stored.startedAt !== entitlement.startedAt || stored.expiresAt !== entitlement.expiresAt
    || !Number.isSafeInteger(stored.used) || stored.used < 0 || stored.used > 500) {
    throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to verify trial usage.');
  }
  return { used: stored.used, period: 'trial', window: 'trial', resetsAt: entitlement.expiresAt };
}

export function sendSecurityError(res, error) {
  if (error instanceof ApiSecurityError) {
    return res.status(error.status).json({ success: false, error: error.code, message: error.message, ...error.details });
  }
  // Never echo SDK errors: legacy query errors can contain credential material.
  return res.status(503).json({ success: false, error: 'SERVICE_UNAVAILABLE', message: 'Unable to verify API-key access. Please retry.' });
}
