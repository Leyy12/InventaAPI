import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { createAdminEntitlements } from '../services/admin-entitlements.js';
import { getFirestore, FieldPath } from '../database/firestore.js';
import { createAdminTrafficHandler } from '../services/admin-traffic.js';
import { createAdminKeyInventoryHandler } from '../services/admin-key-inventory.js';
import { verifyFirebaseToken, requireAdmin } from '../middleware/auth.js';
import { createSystemSettingsHandlers } from '../services/system-settings.js';
import { createRequire } from 'node:module';
import { getFirestore as getFirebaseFirestore, FieldPath as FirebaseFieldPath } from 'firebase-admin/firestore';
import { PostgresFirestore } from '../database/postgres-firestore.js';
import { usesSupabase } from '../database/firestore.js';
import { createSupabaseCopy } from '../services/supabase-copy.js';

const router = express.Router();
const systemSettings = createSystemSettingsHandlers({ getDb: () => getFirestore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  apiVersion: createRequire(import.meta.url)('../package.json').version });
router.get('/system/settings', systemSettings.read);
router.patch('/system/settings', systemSettings.save);
router.get('/system/information', systemSettings.information);
router.get('/api-keys/inventory', createAdminKeyInventoryHandler({ getDb: () => getFirestore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked), documentId: FieldPath.documentId() }));
router.get('/traffic', createAdminTrafficHandler({ getDb: () => getFirestore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked), documentId: FieldPath.documentId() }));
router.post('/entitlements', createAdminEntitlements({ getDb: () => getFirestore(),
  monthlyCutoverAt: process.env.FREE_MONTHLY_QUOTA_CUTOVER_AT,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) }));

// One-time Firestore → Supabase copy. Only available while the API still reads Firebase.
let supabaseTarget;
const supabaseCopy = createSupabaseCopy({
  source: { listCollections: () => getFirebaseFirestore().listCollections(),
    collection: name => getFirebaseFirestore().collection(name) },
  target: new Proxy({}, { get: (_, prop) => {
    supabaseTarget ||= new PostgresFirestore({ connectionString: process.env.SUPABASE_DB_URL });
    const value = supabaseTarget[prop];
    return typeof value === 'function' ? value.bind(supabaseTarget) : value;
  } }),
  documentId: FirebaseFieldPath.documentId(),
  enabled: () => !usesSupabase && Boolean(process.env.SUPABASE_DB_URL),
});
router.post('/supabase-copy', verifyFirebaseToken, requireAdmin, supabaseCopy.step);
router.get('/supabase-copy/status', verifyFirebaseToken, requireAdmin, supabaseCopy.status);

/**
 * GET /api/v1/admin/stats
 * Returns real aggregate counts for the admin dashboard.
 * No authentication required for internal use (admin panel is server-side).
 */
router.get('/stats', verifyFirebaseToken, requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();

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
