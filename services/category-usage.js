import { ApiSecurityError, sendSecurityError, validDocumentId } from './api-key-security.js';
import { accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { authorizedProductIds } from './daas-catalog.js';
import { REPORT_SEGMENTS, categoryUsageReport } from './reporting.js';

export const CATEGORY_USAGE_CACHE_MS = 60000;

// Aggregate counts only: no user IDs, key names or product IDs leave the API.
export async function loadCategoryUsage(db) {
  const [products, keys] = await Promise.all([db.collection('products').get(), db.collection('api_keys').where('status', '==', 'active').get()]);
  const links = keys.docs.map(doc => doc.data()).filter(key => key.status === 'active' && validDocumentId(key.userId))
    .map(key => ({ userId: key.userId, productIds: authorizedProductIds(key) })).filter(key => key.productIds.length);
  const owners = [...new Set(links.map(key => key.userId))];
  const accounts = await Promise.all(owners.map(async id => [id, (await db.collection('users').doc(id).get()).data()]));
  const active = new Set(accounts.filter(([, account]) => !accountBlocked(account)).map(([id]) => id));
  const records = products.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  const holders = links.filter(key => active.has(key.userId));
  return Object.fromEntries(['All', ...REPORT_SEGMENTS].map(segment => [segment, categoryUsageReport(records, holders, segment)]));
}

export function createCategoryUsageHandler({ getDb, verifyIdToken, now = Date.now }) {
  let cached = null;
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = /^Bearer ([^\s]+)$/u.exec(req.headers?.authorization || '')?.[1];
      if (!token) throw new ApiSecurityError(401, 'AUTH_REQUIRED', 'Sign in to view category usage.');
      let actor;
      try { actor = await verifyIdToken(token, true); }
      catch { throw new ApiSecurityError(401, 'AUTH_INVALID', 'Please sign in again.'); }
      if (!validDocumentId(actor?.uid)) throw new ApiSecurityError(401, 'AUTH_INVALID', 'Please sign in again.');
      const db = getDb();
      const account = (await db.collection('users').doc(actor.uid).get()).data();
      if (accountBlocked(account) || typeof account.role !== 'string'
        || !['admin', 'developer', 'consumer', 'business'].includes(account.role.toLowerCase())) {
        throw new ApiSecurityError(403, 'ACCOUNT_DISABLED', 'Category usage is unavailable for this account.');
      }
      if (!cached || now() - cached.at > CATEGORY_USAGE_CACHE_MS) cached = { at: now(), segments: await loadCategoryUsage(db) };
      return res.json({ success: true, segments: cached.segments, updatedAt: new Date(cached.at).toISOString() });
    } catch (error) {
      if (error instanceof ApiSecurityError) return sendSecurityError(res, error);
      return res.status(503).json({ success: false, error: 'CATEGORY_USAGE_UNAVAILABLE', message: 'Category usage is temporarily unavailable. Retry later.' });
    }
  };
}
