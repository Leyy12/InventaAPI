import { authenticatedPayment, requirePayment } from './payment-contract.js';
import { validDocumentId, usageForToday, freeMonthlyUsage, trialUsage } from './api-key-security.js';
import { accountBlocked, evaluateEntitlement, trialState } from '../functions/subscription-lifecycle.mjs';

export function createAdminEntitlements({ getDb, verifyIdToken, clock = () => new Date(), monthlyCutoverAt = null }) {
  return authenticatedPayment({ getDb, verifyIdToken }, async (req, res, uid, db) => {
    const admin = (await db.collection('users').doc(uid).get()).data();
    requirePayment(!accountBlocked(admin) && admin.role?.toLowerCase() === 'admin', 'FORBIDDEN', 'Admin access required.', 403);
    const ids = req.body?.ids;
    requirePayment(Array.isArray(ids) && ids.length <= 100 && ids.every(validDocumentId), 'INVALID_ACCOUNTS', 'At most 100 account IDs.', 400);
    const accounts = {};
    for (const id of new Set(ids)) accounts[id] = await db.runTransaction(async tx => {
      const accountDoc = await tx.get(db.collection('users').doc(id));
      const account = accountDoc.data();
      const storedUsage = (await tx.get(db.collection('account_api_usage').doc(id))).data();
      if (accountBlocked(account)) return { plan: 'Disabled', status: 'inactive', limit: 0, used: null, active: false };
      try {
        const now = clock();
        const effective = evaluateEntitlement(account, now);
        let trial = null, trialQuota = null, trialHistoryUnavailable = false;
        try {
          trial = trialState(account, now);
          trialQuota = trial.used ? trialUsage((await tx.get(db.collection('account_trial_usage').doc(id))).data(), trial) : null;
        } catch (error) {
          // Optional ended/legacy Trial history must not hide valid paid usage.
          // A currently active Trial still requires its authoritative counter.
          if (effective.activeTrial) throw error;
          trialHistoryUnavailable = true;
        }
        const monthly = effective.level === 0 ? await tx.get(db.collection('account_free_monthly_usage').doc(id)) : null;
        const usage = effective.activeTrial ? trialQuota : effective.level === 0
          ? freeMonthlyUsage(monthly.exists ? monthly.data() : null, accountDoc, now, monthlyCutoverAt)
          : storedUsage ? usageForToday(storedUsage, now) : null;
        return { plan: effective.plan, status: effective.status, limit: effective.limit,
          used: usage?.holdUntil ? null : usage?.used ?? null, active: true,
          period: usage?.period || 'daily', resetsAt: usage?.resetsAt ?? null, holdUntil: usage?.holdUntil ?? null,
          ...(trialHistoryUnavailable ? { trialHistoryUnavailable: true } : {}),
          ...(trialQuota ? { trial: { used: trialQuota.used, limit: 500, active: !!effective.activeTrial,
            expiresAt: trial.expiresAt } } : {}) };
      } catch { return { plan: 'Unavailable', status: 'unverified', limit: 0, used: null, active: false }; }
    });
    return res.json({ accounts });
  });
}
