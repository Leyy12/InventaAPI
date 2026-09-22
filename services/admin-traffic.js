import { validDocumentId } from './api-key-security.js';
import { accountBlocked } from '../functions/subscription-lifecycle.mjs';

export const ADMIN_TRAFFIC_LIMIT = 500;
class TrafficError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function timestamp(value) {
  try {
    // Preserve R4's recorded Date/Timestamp/string support, never invent dates.
    const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : value?.toDate?.();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
}
export function trafficRecord(data = {}) {
  return {
    timestamp: timestamp(data?.timestamp),
    success: typeof data?.success === 'boolean' ? data.success : null,
    latencyMs: typeof data?.latencyMs === 'number' && Number.isFinite(data.latencyMs) && data.latencyMs >= 0 ? data.latencyMs : null,
  };
}
export function createAdminTrafficHandler({ getDb, verifyIdToken, documentId }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = /^Bearer ([^\s]+)$/u.exec(req.headers?.authorization || '')?.[1];
      if (!token) throw new TrafficError(401, 'AUTH_REQUIRED', 'Sign in to view Admin traffic.');
      let actor;
      try { actor = await verifyIdToken(token, true); }
      catch { throw new TrafficError(401, 'AUTH_INVALID', 'Unable to verify this session. Sign in again.'); }
      if (!validDocumentId(actor?.uid)) throw new TrafficError(401, 'AUTH_INVALID', 'Unable to verify this session.');
      if (Object.keys(req.query || {}).length || Object.keys(req.body || {}).length) {
        throw new TrafficError(400, 'TRAFFIC_PARAMETERS', 'Traffic accepts no lookup or pagination parameters.');
      }
      const db = getDb();
      const accountRef = db.collection('users').doc(actor.uid);
      const permitted = account => !accountBlocked(account) && typeof account.role === 'string' && account.role.toLowerCase() === 'admin';
      const authorize = async () => {
        if (!permitted((await accountRef.get()).data())) throw new TrafficError(403, 'ADMIN_REQUIRED', 'An active Admin account is required.');
      };
      await authorize();
      const snapshot = await db.collection('api_telemetry').orderBy('timestamp', 'desc')
        .orderBy(documentId, 'desc').limit(ADMIN_TRAFFIC_LIMIT).get();
      // Recheck role/deletion barriers before releasing even this minimal sample.
      await authorize();
      if (snapshot.docs.length > ADMIN_TRAFFIC_LIMIT) throw new Error('Query bound violated');
      const records = snapshot.docs.map(doc => trafficRecord(doc.data()));
      // Invalid historical timestamp types can sort first in Firestore. Keep them
      // as excluded samples, after valid dates. Stable sort preserves ID tie order.
      records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      return res.json({ success: true, records, limit: ADMIN_TRAFFIC_LIMIT });
    } catch (error) {
      if (error instanceof TrafficError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
      return res.status(503).json({ success: false, code: 'ADMIN_TRAFFIC_UNAVAILABLE', error: 'Admin traffic is temporarily unavailable. Retry later.' });
    }
  };
}
