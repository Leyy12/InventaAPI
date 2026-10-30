import { ApiSecurityError, sendSecurityError, validDocumentId } from './api-key-security.js';
import { accountBlocked } from '../functions/subscription-lifecycle.mjs';

export const HISTORY_LIMIT = 50;

export function recordedTimestamp(value) {
  try {
    // The writer stores stored timestamps. Do not parse arbitrary strings,
    // numeric epochs or missing values into invented historical dates.
    const date = value instanceof Date ? value : value?.toDate?.();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
}

const safeText = (value, max) => typeof value === 'string' && value && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;

// Rows the customer deleted from their history: hidden from their view only (the
// records stay for admin traffic statistics). api_history_hidden/<uid> holds the
// ids of individually deleted rows and, for "clear all", a time before which
// every row is hidden.
export const HIDDEN_COLLECTION = 'api_history_hidden';
const MAX_HIDDEN_IDS = 5000;
const hiddenFilter = hidden => {
  const ids = hidden?.ids && typeof hidden.ids === 'object' ? hidden.ids : {};
  const before = typeof hidden?.clearedBefore === 'string' ? hidden.clearedBefore : null;
  return row => !ids[row.id] && !(before && (recordedTimestamp(row.data.timestamp) || '') <= before);
};

export function historyRecord(data, id = null) {
  const name = typeof data.keyName === 'string' ? data.keyName.trim() : '';
  // Never fall back to apiKeyId: legacy IDs may themselves be credentials.
  // Names are user-provided labels, not consumer identities. Suppress obvious
  // credential material accidentally used as a label, too.
  const keyName = name && name.length <= 120 && !/[\u0000-\u001f\u007f]|daas_|bearer\s|eyJ|[a-f0-9]{32,}/iu.test(name)
    ? name : null;
  return {
    id: typeof id === 'string' && id.length <= 200 ? id : null,
    keyName,
    timestamp: recordedTimestamp(data.timestamp),
    endpoint: ['/catalog', '/sales', '/sales-feed'].includes(data.endpoint) ? `/daas/v1${data.endpoint}` : null,
    method: ['GET', 'POST'].includes(data.method) ? data.method : null,
    statusCode: Number.isInteger(data.statusCode) && data.statusCode >= 100 && data.statusCode <= 599 ? data.statusCode : null,
    // Where the call came from (automatic app detection): the website's domain
    // and/or the caller's IP, and whether this was the app's first call.
    source: safeText(data.consumerLabel, 260),
    domain: safeText(data.consumerDomain, 253),
    ip: safeText(data.consumerIp, 64),
    newApp: data.newConsumer === true,
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
      const hidden = (await db.collection(HIDDEN_COLLECTION).doc(actor.uid).get()).data();
      // Read further back so deleted rows don't shrink the visible window.
      const snapshot = await db.collection('api_telemetry').where('userId', '==', actor.uid)
        .orderBy('timestamp', 'desc').orderBy(documentId, 'desc').limit(HISTORY_LIMIT * 4 + 1).get();
      // Recheck the deletion/disabled/role barrier after the read, too.
      if (!permitted((await accountRef.get()).data())) throw new ApiSecurityError(403, 'ACCOUNT_DISABLED', 'Customer history is unavailable for this account.');
      const allRows = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
      if (allRows.some(row => row.data.userId !== actor.uid)) throw new Error('History ownership invariant');
      const rows = allRows.filter(hiddenFilter(hidden));
      const records = rows.slice(0, HISTORY_LIMIT).map(row => historyRecord(row.data, row.id));
      // Corrupt timestamp types can sort ahead of real timestamps in the database.
      // Keep valid recorded dates newest-first and put unavailable dates last.
      // Stable sort preserves the document-ID tie-breaker.
      records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      return res.json({ success: true, records, limit: HISTORY_LIMIT, hasMore: rows.length > HISTORY_LIMIT });
    } catch (error) { return sendSecurityError(res, error); }
  };
}

// POST /api/v1/api-keys/history/delete  { ids: [...] } or { all: true }
// Removes rows from the customer's own history view (the records themselves are
// kept for admin traffic statistics). Only the caller's own rows can be hidden.
export function createApiHistoryDeleteHandler({ getDb, verifyIdToken, clock = () => new Date() }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = /^Bearer ([^\s]+)$/u.exec(req.headers?.authorization || '')?.[1];
      if (!token) throw new ApiSecurityError(401, 'AUTH_REQUIRED', 'Sign in to manage request history.');
      let actor;
      try { actor = await verifyIdToken(token, true); }
      catch { throw new ApiSecurityError(401, 'AUTH_INVALID', 'Please sign in again.'); }
      if (!validDocumentId(actor?.uid)) throw new ApiSecurityError(401, 'AUTH_INVALID', 'Please sign in again.');
      const body = req.body || {};
      const all = body.all === true;
      const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
      if (!all && (!ids.length || ids.length > 200 || !ids.every(id => typeof id === 'string' && validDocumentId(id)))) {
        throw new ApiSecurityError(400, 'HISTORY_PARAMETERS', 'Send { "all": true } or { "ids": [...] } (1–200 history rows).');
      }
      const db = getDb();
      // Only the caller's own rows may be hidden.
      if (!all) {
        const docs = await Promise.all(ids.map(id => db.collection('api_telemetry').doc(id).get()));
        if (docs.some(doc => !doc.exists || doc.data().userId !== actor.uid)) throw new ApiSecurityError(404, 'HISTORY_NOT_FOUND', 'History row not found.');
      }
      const ref = db.collection(HIDDEN_COLLECTION).doc(actor.uid);
      const hiddenCount = await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data() || {};
        const now = clock().toISOString();
        if (all) {
          tx.set(ref, { userId: actor.uid, clearedBefore: now, ids: {}, updatedAt: now });
          return null;
        }
        const kept = Object.entries(current.ids && typeof current.ids === 'object' ? current.ids : {}).slice(-(MAX_HIDDEN_IDS - ids.length));
        const next = Object.fromEntries([...kept, ...ids.map(id => [id, 1])]);
        tx.set(ref, { userId: actor.uid, clearedBefore: current.clearedBefore ?? null, ids: next, updatedAt: now });
        return ids.length;
      });
      return res.json({ success: true, cleared: all, deleted: hiddenCount });
    } catch (error) { return sendSecurityError(res, error); }
  };
}
