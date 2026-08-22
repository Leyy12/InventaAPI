import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

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

    // Count only pending product requests
    const pendingSnap = await db.collection('product_requests')
      .where('status', '==', 'pending')
      .count()
      .get();
    const pendingCount = pendingSnap.data().count;

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

    res.json({ usersCount, pendingCount, recentAuditLogs });
  } catch (error) {
    console.error('[Admin Stats] Error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

export default router;
