import {
  ApiSecurityError, PLAN_LEVELS, accountEntitlement, assertActiveKey, credentialMatches, usageForToday, trialUsage, freeMonthlyUsage,
} from './api-key-security.js';

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

export async function consumeAccountQuota(db, { keyId, userId, credential, allowedPlans = null, cutoverAt = null, monthlyCutoverAt = null, clock = () => new Date() }) {
  const keyRef = db.collection('api_keys').doc(keyId);
  const userRef = db.collection('users').doc(userId);
  const usageRef = db.collection('account_api_usage').doc(userId);
  const monthlyRef = db.collection('account_free_monthly_usage').doc(userId);
  const result = await db.runTransaction(async transaction => {
    // All reads precede writes. Key, owner, entitlement, and usage participate in retries.
    const keyDoc = await transaction.get(keyRef);
    const userDoc = await transaction.get(userRef);
    const usageDoc = await transaction.get(usageRef);
    const monthlyDoc = await transaction.get(monthlyRef);
    const now = clock();
    const key = keyDoc.exists ? keyDoc.data() : null;
    assertActiveKey(key, now);
    if (key.userId !== userId || !credentialMatches(keyId, key, credential)) {
      throw new ApiSecurityError(401, 'INVALID_API_KEY', 'API key changed or was revoked.');
    }
    if (!userDoc.exists) throw new ApiSecurityError(401, 'ACCOUNT_NOT_FOUND', 'API-key account no longer exists.');
    const account = userDoc.data();
    const entitlement = accountEntitlement(account, now);
    const trialRef = db.collection('account_trial_usage').doc(userId);
    const trialDoc = entitlement.activeTrial ? await transaction.get(trialRef) : null;
    if (entitlement.normalization) transaction.update(userRef, entitlement.normalization);
    const effectiveAccount = { ...account, ...entitlement.normalization, plan: entitlement.plan, apiRequestLimit: entitlement.limit };
    if (allowedPlans && entitlement.level < Math.min(...allowedPlans.map(plan => PLAN_LEVELS[plan] ?? Infinity))) {
      return { denied: new ApiSecurityError(403, 'PLAN_UPGRADE_REQUIRED', 'Your account plan does not include this endpoint.') };
    }
    const monthly = entitlement.level === 0 || entitlement.activeTrial
      ? freeMonthlyUsage(monthlyDoc.exists ? monthlyDoc.data() : null, userDoc, now, monthlyCutoverAt) : null;
    if (monthly && !monthlyDoc.exists) transaction.set(monthlyRef, { ...monthly, updatedAt: now.toISOString() });
    const usage = entitlement.level === 0 ? monthly : usageForToday(usageDoc.exists ? usageDoc.data() : null, now);
    if (entitlement.level !== 0 && !usageDoc.exists && !provablyPostCutover(userDoc, cutoverAt, now)) {
      // Historical per-key counters could be edited/deleted and lost concurrent
      // increments. Never invent an opening balance from those records.
      transaction.set(usageRef, { ...usage, holdUntil: usage.resetsAt, updatedAt: now.toISOString() });
      return { pendingCleanWindow: usage.resetsAt };
    }
    if (usage.holdUntil) return { pendingCleanWindow: usage.holdUntil };
    if (entitlement.activeTrial) {
      const trial = trialUsage(trialDoc?.data(), entitlement);
      if (trial.used >= entitlement.limit) return { denied: new ApiSecurityError(429, 'Rate Limit Exceeded',
        'The 500-request trial allowance is exhausted.', { quota: { ...trial, limit: 500, remaining: 0, scope: 'account' } }) };
      const used = trial.used + 1;
      transaction.update(trialRef, { used, updatedAt: now.toISOString() });
      // The 500th admission remains a Trial request. The same transaction ends
      // Trial entitlement for every subsequent request/reader, without key revocation.
      if (used === 500) transaction.update(userRef, { trialExhaustedAt: now.toISOString() });
      transaction.update(keyRef, { lastUsed: now.toISOString() });
      return { key: { ...key, id: keyId }, account: effectiveAccount,
        usage: { ...trial, used, limit: 500, remaining: 500 - used, scope: 'account' } };
    }
    const { limit } = entitlement;
    if (limit !== null && usage.used >= limit) {
      return { denied: new ApiSecurityError(429, 'Rate Limit Exceeded', entitlement.level === 0
        ? 'Monthly Free account allowance exhausted. Resets on the first day of the next UTC month.'
        : 'Daily account allowance exhausted. Resets at midnight UTC.', {
        quota: { ...usage, limit, remaining: 0, scope: 'account' },
      }) };
    }
    if (usage.used === Number.MAX_SAFE_INTEGER) throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to record usage.');
    const used = usage.used + 1;
    transaction.set(entitlement.level === 0 ? monthlyRef : usageRef, { ...usage, used, updatedAt: now.toISOString() });
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
