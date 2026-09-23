import { evaluateEntitlement, trialState, accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { normalizeSegment } from './product-contract.js';
import { ApiSecurityError, validDocumentId, sendSecurityError, trialUsage } from './api-key-security.js';

export function createFreeTrialHandlers({ getDb, verifyIdToken, clock = () => new Date() }) {
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
  return {
    activate: wrap((db, uid) => db.runTransaction(async tx => {
      const ref = db.collection('users').doc(uid), usageRef = db.collection('account_trial_usage').doc(uid);
      const account = (await tx.get(ref)).data();
      const previous = await tx.get(usageRef);
      customer(account);
      const now = clock();
      if (previous.exists || ['hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt', 'trialExpiredAt', 'trialExhaustedAt']
        .some(field => Object.hasOwn(account, field))) throw new ApiSecurityError(409, 'TRIAL_ALREADY_USED', 'Trial is unavailable or was already consumed.');
      if (!['free', 'starter'].includes(String(account.plan).toLowerCase()) || evaluateEntitlement(account, now).level !== 0) {
        throw new ApiSecurityError(403, 'TRIAL_INELIGIBLE', 'Only normal Free accounts may activate a trial.');
      }
      const segment = normalizeSegment(account.businessSegment);
      if (!segment) throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Account business segment requires review.');
      const end = new Date(now); end.setUTCDate(end.getUTCDate() + 7);
      const startedAt = now.toISOString(), expiresAt = end.toISOString();
      tx.update(ref, { trialVersion: 1, hasUsedFreeTrial: true, trialStartedAt: startedAt, trialExpiresAt: expiresAt, selectedSegment: segment });
      tx.set(usageRef, { startedAt, expiresAt, used: 0, updatedAt: startedAt });
      return { success: true, startedAt, expiresAt, allowance: 500, serverTime: startedAt };
    })),
    status: wrap((db, uid) => db.runTransaction(async tx => {
      const account = (await tx.get(db.collection('users').doc(uid))).data();
      customer(account);
      const now = clock(), trial = trialState(account, now);
      const effective = evaluateEntitlement(account, now);
      const record = trial.used ? (await tx.get(db.collection('account_trial_usage').doc(uid))).data() : null;
      const used = trial.used ? trialUsage(record, { startedAt: trial.startedAt, expiresAt: trial.expiresAt }).used : 0;
      const eligible = !trial.used && ['free', 'starter'].includes(String(account.plan).toLowerCase())
        && effective.level === 0 && !!normalizeSegment(account.businessSegment);
      const exhausted = trial.exhausted || used >= 500, active = effective.activeTrial === true && !exhausted;
      const paid = effective.activePro || effective.level === 2;
      return { eligible, hasUsedFreeTrial: trial.used, active, expired: trial.expired,
        exhausted, upgradeRequired: effective.upgradeRequired === true,
        endReason: exhausted ? 'exhausted' : trial.expired ? 'expired' : null,
        status: paid ? 'paid' : active ? 'active' : effective.upgradeRequired ? 'upgrade_required'
          : eligible ? 'eligible' : 'ineligible',
        startedAt: trial.startedAt, expiresAt: trial.expiresAt, serverTime: now.toISOString(),
        secondsRemaining: active ? Math.max(0, (Date.parse(trial.expiresAt) - now.getTime()) / 1000) : 0,
        used, allowance: 500, remaining: active ? 500 - used : 0 };
    })),
  };
}
