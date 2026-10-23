import { validDocumentId } from './api-key-security.js';
import { accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { inventoryRecord, inventoryCounts, validateInventoryResponse, INVENTORY_PAGE_SIZE, INVENTORY_MAX_RECORDS, INVENTORY_MAX_BYTES } from './admin-key-inventory-contract.mjs';

class InventoryError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const projection = ['userId', 'name', 'userEmail', 'status', 'createdAt', 'lastUsed', 'credentialVersion', 'keyPrefix',
  'linkedProductIds', 'linkedVariantSelections', 'linkedProducts'];
export function createAdminKeyInventoryHandler({ getDb, verifyIdToken, documentId }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const token = /^Bearer ([^\s]+)$/u.exec(req.headers?.authorization || '')?.[1];
      if (!token) throw new InventoryError(401, 'AUTH_REQUIRED', 'An Admin session is required.');
      const identity = async () => {
        try {
          const actor = await verifyIdToken(token, true);
          if (!validDocumentId(actor?.uid)) throw new Error('Invalid identity');
          return actor.uid;
        } catch { throw new InventoryError(401, 'AUTH_INVALID', 'Unable to verify this session.'); }
      };
      const uid = await identity();
      const db = getDb();
      const accountRef = db.collection('users').doc(uid);
      const authorize = account => {
        if (accountBlocked(account) || account.active === false || account.blocked === true || ['inactive', 'blocked'].includes(account.status)
          || typeof account.role !== 'string' || account.role.toLowerCase() !== 'admin') {
          throw new InventoryError(403, 'ADMIN_REQUIRED', 'An active Admin account is required.');
        }
      };
      authorize((await accountRef.get()).data());
      if (Object.keys(req.query || {}).length || Object.keys(req.body || {}).length) {
        throw new InventoryError(400, 'INVENTORY_PARAMETERS', 'Inventory accepts no query selectors or scopes.');
      }
      // A consistent, read-only snapshot includes missing/invalid historical dates.
      // Internal ID pagination is bounded; cap failures return no partial records/counts.
      const records = await db.runTransaction(async tx => {
        authorize((await tx.get(accountRef)).data());
        const result = [];
        let bytes = 0;
        let cursor = null;
        for (;;) {
          let query = db.collection('api_keys').select(...projection).orderBy(documentId, 'asc').limit(INVENTORY_PAGE_SIZE);
          if (cursor !== null) query = query.startAfter(cursor);
          const snapshot = await tx.get(query);
          if (snapshot.docs.length > INVENTORY_PAGE_SIZE) throw new Error('Inventory page bound violated');
          if (result.length + snapshot.docs.length > INVENTORY_MAX_RECORDS) throw new Error('Inventory size exceeded');
          for (const doc of snapshot.docs) {
            if (cursor !== null && Buffer.compare(Buffer.from(doc.id), Buffer.from(cursor)) <= 0) throw new Error('Inventory cursor did not advance');
            const record = inventoryRecord(doc.id, doc.data());
            bytes += Buffer.byteLength(JSON.stringify(record), 'utf8') + 1;
            if (bytes > INVENTORY_MAX_BYTES) throw new Error('Inventory response size exceeded');
            result.push(record);
            cursor = doc.id;
          }
          if (snapshot.docs.length < INVENTORY_PAGE_SIZE) return result;
        }
      }, { readOnly: true });
      if (await identity() !== uid) throw new InventoryError(401, 'AUTH_INVALID', 'Session identity changed.');
      authorize((await accountRef.get()).data());
      records.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id));
      const response = validateInventoryResponse({ success: true, complete: true, records, counts: inventoryCounts(records) });
      if (Buffer.byteLength(JSON.stringify(response), 'utf8') > INVENTORY_MAX_BYTES) throw new Error('Inventory response size exceeded');
      return res.json(response);
    } catch (error) {
      if (error instanceof InventoryError) {
        console.warn('[Admin inventory]', error.status, error.code);
        return res.status(error.status).json({ success: false, code: error.code, error: error.message });
      }
      // Logged (message only, never key data) so a failed inventory can be diagnosed.
      console.error('[Admin inventory] unavailable:', error?.message || error);
      return res.status(503).json({ success: false, code: 'ADMIN_INVENTORY_UNAVAILABLE', error: 'Complete inventory is unavailable. Retry later.' });
    }
  };
}
