import {
  ApiSecurityError, PLAN_LEVELS, accountEntitlement, assertActiveKey, credentialMatches, usageForToday, trialUsage,
  upgradeRequiredError,
} from './api-key-security.js';
import { TRIAL_MIN_PRODUCTS, TRIAL_MAX_PRODUCTS } from '../functions/entitlement-limits.mjs';
import { authorizedProductIds } from './daas-catalog.js';

function provablyPostCutover(accountSnapshot, cutoverAt, now) {
  // Only deployment configuration and Firestore snapshot metadata qualify.
  // data().createdAt is customer-writable and must NEVER be used as evidence.
  if (typeof cutoverAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(cutoverAt)) return false;
  const cutoff = new Date(cutoverAt);
  if (!Number.isFinite(cutoff.getTime()) || cutoff.toISOString() !== cutoverAt || cutoff > now) return false;
  try {
    const created = accountSnapshot.createTime?.toDate();
    return created instanceof Date && Number.isFinite(created.getTime()) && created > cutoff && created <= now;
  } catch { return false; }
}

export async function consumeAccountQuota(db, { keyId, userId, credential, allowedPlans = null, paidSubscriptionRequired = false,
  cutoverAt = null, monthlyCutoverAt = null, clock = () => new Date() }) {
  const keyRef = db.collection('api_keys').doc(keyId);
  const userRef = db.collection('users').doc(userId);
  const usageRef = db.collection('account_api_usage').doc(userId);
  const result = await db.runTransaction(async transaction => {
    // All reads precede writes. Key, owner, entitlement, and usage participate in retries.
    const keyDoc = await transaction.get(keyRef);
    const userDoc = await transaction.get(userRef);
    const usageDoc = await transaction.get(usageRef);
    const now = clock();
    const key = keyDoc.exists ? keyDoc.data() : null;
    assertActiveKey(key, now);
    if (key.userId !== userId || !credentialMatches(keyId, key, credential)) {
      throw new ApiSecurityError(401, 'INVALID_API_KEY', 'API key changed or was revoked.');
    }
    if (!userDoc.exists) throw new ApiSecurityError(401, 'ACCOUNT_NOT_FOUND', 'API-key account no longer exists.');
    const account = userDoc.data();
    const entitlement = accountEntitlement(account, now);
    const trialKeys = entitlement.activeTrial
      ? await transaction.get(db.collection('api_keys').where('userId', '==', userId)) : null;
    const legacyHistory = entitlement.activeTrial && !Object.hasOwn(account, 'trialConsumed')
      ? await transaction.get(db.collection('account_trial_usage').doc(userId)) : null;
    if (entitlement.normalization) transaction.update(userRef, entitlement.normalization);
    const effectiveAccount = { ...account, ...entitlement.normalization, plan: entitlement.plan, apiRequestLimit: entitlement.limit };
    if (entitlement.upgradeRequired) return { denied: upgradeRequiredError() };
    if (paidSubscriptionRequired && (entitlement.level < 1 || entitlement.activeTrial)) {
      return { denied: new ApiSecurityError(403, 'PLAN_UPGRADE_REQUIRED', 'A paid subscription is required for sales analytics.') };
    }
    if (allowedPlans && entitlement.level < Math.min(...allowedPlans.map(plan => PLAN_LEVELS[plan] ?? Infinity))) {
      return { denied: new ApiSecurityError(403, 'PLAN_UPGRADE_REQUIRED', 'Your account plan does not include this endpoint.') };
    }
    if (entitlement.activeTrial) {
      if (clock().getTime() >= Date.parse(entitlement.expiresAt)) return { denied: upgradeRequiredError() };
      if (legacyHistory && trialUsage(legacyHistory.data(), entitlement).used === 500) {
        transaction.update(userRef, { trialConsumed: true });
        return { denied: upgradeRequiredError() };
      }
      const active = trialKeys.docs.filter(doc => doc.data().status === 'active');
      if (active.length !== 1 || active[0].id !== keyId) return { denied: new ApiSecurityError(403,
        'TRIAL_KEY_LIMIT', 'Free Trial permits one active API key. Revoke additional legacy keys.') };
      const products = authorizedProductIds(key).length;
      // Preserve legacy over-cap reads; every catalog mutation forbids additions.
      // Zero products is also a valid Trial catalog (no product data authorized).
      // Calls do not consume products or change Trial history/expiry. Historical
      // request counters remain audit evidence, never an access allowance.
      transaction.update(keyRef, { lastUsed: now.toISOString() });
      return { key: { ...key, id: keyId }, account: effectiveAccount,
        usage: { used: null, limit: null, remaining: null, period: 'trial_catalog', scope: 'account',
          resetsAt: entitlement.expiresAt, productsIncluded: products, minimumProducts: TRIAL_MIN_PRODUCTS, maximumProducts: TRIAL_MAX_PRODUCTS } };
    }
    // Trial admission has no request allowance. Paid daily quota
    // and its existing clean-window cutover semantics are unchanged.
    const usage = usageForToday(usageDoc.exists ? usageDoc.data() : null, now);
    if (!usageDoc.exists && !provablyPostCutover(userDoc, cutoverAt, now)) {
      transaction.set(usageRef, { ...usage, holdUntil: usage.resetsAt, updatedAt: now.toISOString() });
      return { pendingCleanWindow: usage.resetsAt };
    }
    if (usage.holdUntil) return { pendingCleanWindow: usage.holdUntil };
    const { limit } = entitlement;
    if (limit !== null && usage.used >= limit) {
      return { denied: new ApiSecurityError(429, 'Rate Limit Exceeded', 'Daily account allowance exhausted. Resets at midnight UTC.', {
        quota: { ...usage, limit, remaining: 0, scope: 'account' },
      }) };
    }
    if (usage.used === Number.MAX_SAFE_INTEGER) throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to record usage.');
    const used = usage.used + 1;
    transaction.set(usageRef, { ...usage, used, updatedAt: now.toISOString() });
    // Keep per-key diagnostics for existing admin screens; never use them as allowance.
    const keyUsed = key.resetAt === usage.resetsAt && Number.isSafeInteger(key.requestsUsed) && key.requestsUsed >= 0
      ? key.requestsUsed : 0;
    transaction.update(keyRef, { lastUsed: now.toISOString(), requestsUsed: Math.min(keyUsed + 1, Number.MAX_SAFE_INTEGER), resetAt: usage.resetsAt });
    return {
      key: { ...key, id: keyId }, account: effectiveAccount,
      usage: { ...usage, used, limit, remaining: limit === null ? null : limit - used, unlimited: limit === null, scope: 'account' },
    };
  });
  // Throw only AFTER committing the hold, otherwise the transaction rolls it
  // back and every retry/next-day request would establish another first hold.
  if (result.denied) throw result.denied;
  if (result.pendingCleanWindow) {
    throw new ApiSecurityError(503, 'QUOTA_CUTOVER_PENDING', 'Account quota becomes available at the next clean UTC window.', {
      quota: { used: null, remaining: 0, resetsAt: result.pendingCleanWindow, scope: 'account', state: 'pending_clean_window' },
    });
  }
  return result;
}
