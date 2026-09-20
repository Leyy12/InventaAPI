import { authenticatedPayment, requirePayment } from './payment-contract.js';
import { validDocumentId, usageForToday } from './api-key-security.js';
import { accountBlocked, evaluateEntitlement } from '../functions/subscription-lifecycle.mjs';

export function createAdminEntitlements({ getDb, verifyIdToken, clock = () => new Date() }) {
  return authenticatedPayment({ getDb, verifyIdToken }, async (req, res, uid, db) => {
    const admin = (await db.collection('users').doc(uid).get()).data();
    requirePayment(!accountBlocked(admin) && admin.role?.toLowerCase() === 'admin', 'FORBIDDEN', 'Admin access required.', 403);
    const ids = req.body?.ids;
    requirePayment(Array.isArray(ids) && ids.length <= 100 && ids.every(validDocumentId), 'INVALID_ACCOUNTS', 'At most 100 account IDs.', 400);
    const accounts = {};
    for (const id of new Set(ids)) accounts[id] = await db.runTransaction(async tx => {
      const account = (await tx.get(db.collection('users').doc(id))).data();
      const storedUsage = (await tx.get(db.collection('account_api_usage').doc(id))).data();
      if (accountBlocked(account)) return { plan: 'Disabled', status: 'inactive', limit: 0, used: null, active: false };
      try {
        const now = clock();
        const effective = evaluateEntitlement(account, now);
        return { plan: effective.plan, status: effective.status, limit: effective.limit,
          used: storedUsage ? usageForToday(storedUsage, now).used : null, active: true };
      } catch { return { plan: 'Unavailable', status: 'unverified', limit: 0, used: null, active: false }; }
    });
    return res.json({ accounts });
  });
}
