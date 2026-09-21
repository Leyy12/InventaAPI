import { ApiSecurityError, sendSecurityError, validDocumentId } from './api-key-security.js';
import { accountBlocked } from '../functions/subscription-lifecycle.mjs';

export const HISTORY_LIMIT = 50;

export function recordedTimestamp(value) {
  try {
    // The writer stores Firestore timestamps. Do not parse arbitrary strings,
    // numeric epochs or missing values into invented historical dates.
    const date = value instanceof Date ? value : value?.toDate?.();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
}

export function historyRecord(data) {
  const name = typeof data.keyName === 'string' ? data.keyName.trim() : '';
  // Never fall back to apiKeyId: legacy IDs may themselves be credentials.
  // Names are user-provided labels, not consumer identities. Suppress obvious
  // credential material accidentally used as a label, too.
  const keyName = name && name.length <= 120 && !/[\u0000-\u001f\u007f]|daas_|bearer\s|eyJ|[a-f0-9]{32,}/iu.test(name)
    ? name : null;
  return {
    keyName,
    timestamp: recordedTimestamp(data.timestamp),
    endpoint: ['/catalog', '/sales-feed'].includes(data.endpoint) ? `/daas/v1${data.endpoint}` : null,
    method: data.method === 'GET' ? 'GET' : null,
    statusCode: Number.isInteger(data.statusCode) && data.statusCode >= 100 && data.statusCode <= 599 ? data.statusCode : null,
  };
}

export function createApiHistoryHandler({ getDb, verifyIdToken, documentId }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = /^Bearer ([^\s]+)$/u.exec(req.headers?.authorization || '')?.[1];
      if (!token) throw new ApiSecurityError(401, 'AUTH_REQUIRED', 'Sign in to view request history.');
      let actor;
      try { actor = await verifyIdToken(token, true); }
      catch { throw new ApiSecurityError(401, 'AUTH_INVALID', 'Please sign in again.'); }
      if (!validDocumentId(actor?.uid)) throw new ApiSecurityError(401, 'AUTH_INVALID', 'Please sign in again.');
      // Fixed recent window: no caller account, key, document or cursor lookup.
      if (Object.keys(req.query || {}).length || Object.keys(req.body || {}).length) {
        throw new ApiSecurityError(400, 'HISTORY_PARAMETERS', 'History does not accept lookup or pagination parameters.');
      }
      const db = getDb();
      const accountRef = db.collection('users').doc(actor.uid);
      // Match the existing Customer role aliases; never accept a token role claim.
      const permitted = account => !accountBlocked(account) && typeof account.role === 'string'
        && ['developer', 'consumer', 'business'].includes(account.role.toLowerCase());
      if (!permitted((await accountRef.get()).data())) throw new ApiSecurityError(403, 'ACCOUNT_DISABLED', 'Customer history is unavailable for this account.');
      const snapshot = await db.collection('api_telemetry').where('userId', '==', actor.uid)
        .orderBy('timestamp', 'desc').orderBy(documentId, 'desc').limit(HISTORY_LIMIT + 1).get();
      // Recheck the deletion/disabled/role barrier after the read, too.
      if (!permitted((await accountRef.get()).data())) throw new ApiSecurityError(403, 'ACCOUNT_DISABLED', 'Customer history is unavailable for this account.');
      const rows = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
      if (rows.some(row => row.data.userId !== actor.uid)) throw new Error('History ownership invariant');
      const records = rows.slice(0, HISTORY_LIMIT).map(row => historyRecord(row.data));
      // Corrupt timestamp types can sort ahead of real timestamps in Firestore.
      // Keep valid recorded dates newest-first and put unavailable dates last.
      // Stable sort preserves Firestore's document-ID tie-breaker.
      records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      return res.json({ success: true, records, limit: HISTORY_LIMIT, hasMore: rows.length > HISTORY_LIMIT });
    } catch (error) { return sendSecurityError(res, error); }
  };
}
