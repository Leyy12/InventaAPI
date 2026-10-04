import { evaluateEntitlement, trialState, accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { normalizeSegment } from './product-contract.js';
import { ApiSecurityError, validDocumentId, sendSecurityError, trialUsage } from './api-key-security.js';
import { authorizedProductIds } from './daas-catalog.js';

export function createFreeTrialHandlers({ getDb, verifyIdToken, revokeRefreshTokens, clock = () => new Date() }) {
  const wrap = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const match = /^Bearer (\S+)$/u.exec(req.headers?.authorization || '');
      let actor;
      try { if (match) actor = await verifyIdToken(match[1], true); } catch { /* Uniform rejection. */ }
      if (!validDocumentId(actor?.uid)) throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'Authentication required.');
      if (Object.keys(req.body || {}).length || Object.keys(req.query || {}).length) throw new ApiSecurityError(400, 'INVALID_REQUEST', 'Trial terms are server-controlled.');
      return res.json(await action(getDb(), actor.uid));
    } catch (error) { return sendSecurityError(res, error); }
  };
  function customer(account) {
    if (accountBlocked(account) || !['developer', 'consumer', 'business'].includes(String(account.role).toLowerCase())) {
      throw new ApiSecurityError(403, 'ACCOUNT_UNAVAILABLE', 'An active Customer account is required.');
    }
  }
  async function eligibleTrial(tx, db, uid, now) {
    const ref = db.collection('users').doc(uid), usageRef = db.collection('account_trial_usage').doc(uid);
    const account = (await tx.get(ref)).data();
    const previous = await tx.get(usageRef);
    customer(account);
    if (previous.exists || ['hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt', 'trialExpiredAt', 'trialExhaustedAt']
      .concat('trialConsumed').some(field => Object.hasOwn(account, field))) throw new ApiSecurityError(409, 'TRIAL_ALREADY_USED', 'Trial is unavailable or was already consumed.');
    if (!['free', 'starter'].includes(String(account.plan).toLowerCase())) {
      throw new ApiSecurityError(403, 'TRIAL_INELIGIBLE', 'Only normal Free accounts may activate a trial.');
    }
    const segment = normalizeSegment(account.businessSegment);
    if (!segment) throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Account business segment requires review.');
    return { ref, usageRef, segment };
  }
  return {
    // Session establishment, not a browser timestamp or API-key request, is the
    // only new normal activation path. The account and counter commit together.
    session: wrap((db, uid) => db.runTransaction(async tx => {
      const ref = db.collection('users').doc(uid), usageRef = db.collection('account_trial_usage').doc(uid);
      const account = (await tx.get(ref)).data();
      const previous = await tx.get(usageRef);
      customer(account);
      const now = clock();
      if (!['free', 'starter'].includes(String(account.plan).toLowerCase())) {
        evaluateEntitlement(account, now);
        return { success: true, initialized: false };
      }
      const trial = trialState(account, now);
      if (trial.used) {
        // Missing/corrupt existing state is never repaired by resetting a Trial.
        const history = trialUsage(previous.data(), trial);
        // Preserve genuinely consumed legacy request-based Trials. New catalog
        // Trials never increment this historical counter or end at 500 products.
        if (!Object.hasOwn(account, 'trialConsumed') && history.used === 500) tx.update(ref, { trialConsumed: true });
        return { success: true, initialized: false };
      }
      if (previous.exists) throw new ApiSecurityError(503, 'TRIAL_UNAVAILABLE', 'Existing Trial state requires review.');
      const segment = normalizeSegment(account.businessSegment);
      if (!segment) throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Account business segment requires review.');
      const startedAt = now.toISOString(), expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString();
      tx.update(ref, { trialVersion: 1, hasUsedFreeTrial: true, trialConsumed: false,
        trialStartedAt: startedAt, trialExpiresAt: expiresAt, selectedSegment: segment });
      tx.set(usageRef, { startedAt, expiresAt, used: 0, updatedAt: startedAt });
      return { success: true, initialized: true };
    })),
    activate: wrap(async (db, uid) => {
      // Authorization and eligibility precede the external Auth mutation. Recheck
      // inside the final transaction because another activation may race us.
      await db.runTransaction(tx => eligibleTrial(tx, db, uid, clock()));
      try { await revokeRefreshTokens(uid); } catch {
        // The Auth call may have succeeded remotely even if its response failed.
        // No Trial state has been written; reauthentication makes retry safe.
        throw new ApiSecurityError(503, 'TRIAL_ACTIVATION_UNAVAILABLE',
          'Unable to confirm Trial activation. Sign in again and retry.', { reauthenticationRequired: true });
      }
      try {
        return await db.runTransaction(async tx => {
          const now = clock();
          const { ref, usageRef, segment } = await eligibleTrial(tx, db, uid, now);
          const end = new Date(now); end.setUTCDate(end.getUTCDate() + 7);
          const startedAt = now.toISOString(), expiresAt = end.toISOString();
          tx.update(ref, { trialVersion: 1, hasUsedFreeTrial: true, trialStartedAt: startedAt, trialExpiresAt: expiresAt, selectedSegment: segment });
          tx.set(usageRef, { startedAt, expiresAt, used: 0, updatedAt: startedAt });
          return { success: true, startedAt, expiresAt, minimumProducts: 50, maximumProducts: 500, maximumActiveKeys: 1,
            serverTime: startedAt, reauthenticationRequired: true };
        });
      } catch (error) {
        // Refresh tokens were revoked already. Never report a normal retry that
        // might reuse the old session; preserve the original Trial on conflicts.
        if (error instanceof ApiSecurityError) throw new ApiSecurityError(error.status, error.code, error.message,
          { ...error.details, reauthenticationRequired: true });
        throw new ApiSecurityError(503, 'TRIAL_ACTIVATION_UNAVAILABLE',
          'Unable to confirm Trial activation. Sign in again and check Trial status.', { reauthenticationRequired: true });
      }
    }),
    status: wrap((db, uid) => db.runTransaction(async tx => {
      const account = (await tx.get(db.collection('users').doc(uid))).data();
      customer(account);
      const now = clock(), trial = trialState(account, now);
      let effective = evaluateEntitlement(account, now);
      let legacyConsumed = false;
      if (trial.used && !Object.hasOwn(account, 'trialConsumed')) {
        const history = (await tx.get(db.collection('account_trial_usage').doc(uid))).data();
        legacyConsumed = trialUsage(history, trial).used === 500;
        if (legacyConsumed && effective.activeTrial) effective = evaluateEntitlement({ ...account, trialConsumed: true }, now);
      }
      const keys = await tx.get(db.collection('api_keys').where('userId', '==', uid));
      const activeKeys = keys.docs.filter(doc => doc.data().status === 'active');
      const productCount = new Set(activeKeys.flatMap(doc => authorizedProductIds(doc.data()))).size;
      const eligible = !trial.used && ['free', 'starter'].includes(String(account.plan).toLowerCase())
        && !!normalizeSegment(account.businessSegment);
      const exhausted = trial.exhausted || account.trialConsumed === true || legacyConsumed, active = effective.activeTrial === true;
      const paid = effective.activePro || effective.level === 2;
      return { eligible, hasUsedFreeTrial: trial.used, active, expired: trial.expired,
        exhausted, upgradeRequired: effective.upgradeRequired === true,
        endReason: exhausted ? 'exhausted' : trial.expired ? 'expired' : null,
        status: paid ? 'paid' : active ? 'active' : effective.upgradeRequired ? 'upgrade_required'
          : eligible ? 'eligible' : 'ineligible',
        startedAt: trial.startedAt, expiresAt: trial.expiresAt, serverTime: now.toISOString(),
        secondsRemaining: active ? Math.max(0, (Date.parse(trial.expiresAt) - now.getTime()) / 1000) : 0,
        productsIncluded: productCount, minimumProducts: 50, maximumProducts: 500,
        productsAvailable: Math.max(0, 500 - productCount), activeKeys: activeKeys.length, maximumActiveKeys: 1 };
    })),
  };
}
