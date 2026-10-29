import express from 'express';
import { createCustomerNotifier, messages } from '../services/customer-notify.js';
import { getAuth } from '../services/supabase-auth.js';
import { createAdminEntitlements } from '../services/admin-entitlements.js';
import { getDataStore, FieldPath } from '../database/data-store.js';
import { createAdminTrafficHandler } from '../services/admin-traffic.js';
import { createAdminKeyInventoryHandler } from '../services/admin-key-inventory.js';
import { verifyAuthToken, requireAdmin } from '../middleware/auth.js';
import { createSystemSettingsHandlers } from '../services/system-settings.js';
import { createRequire } from 'node:module';

const router = express.Router();
const systemSettings = createSystemSettingsHandlers({ getDb: () => getDataStore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  apiVersion: createRequire(import.meta.url)('../package.json').version,
  notifier: createCustomerNotifier(), messages });
router.get('/system/settings', systemSettings.read);
router.patch('/system/settings', systemSettings.save);
router.get('/system/information', systemSettings.information);
router.get('/system/backup', systemSettings.backup);
router.post('/system/restore', systemSettings.restore);
router.get('/api-keys/inventory', createAdminKeyInventoryHandler({ getDb: () => getDataStore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked), documentId: FieldPath.documentId() }));
router.get('/traffic', createAdminTrafficHandler({ getDb: () => getDataStore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked), documentId: FieldPath.documentId() }));
router.post('/entitlements', createAdminEntitlements({ getDb: () => getDataStore(),
  monthlyCutoverAt: process.env.FREE_MONTHLY_QUOTA_CUTOVER_AT,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) }));


/**
 * GET /api/v1/admin/stats
 * Returns real aggregate counts for the admin dashboard.
 * No authentication required for internal use (admin panel is server-side).
 */
router.get('/stats', verifyAuthToken, requireAdmin, async (req, res) => {
  try {
    const db = getDataStore();

    // Count all registered users
    const usersSnap = await db.collection('users').count().get();
    const usersCount = usersSnap.data().count;

    // Fetch the 10 most recent audit log entries
    const auditSnap = await db.collection('audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const recentAuditLogs = auditSnap.docs.map(doc => {
      const data = doc.data();
      const date = data.timestamp ? data.timestamp.toDate() : new Date();
      return {
        id: doc.id,
        time: date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
        message: data.action || data.description || 'System event',
        color: 'text-slate-400',
      };
    });

    res.json({ usersCount, recentAuditLogs });
  } catch (error) {
    console.error('[Admin Stats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

export default router;
