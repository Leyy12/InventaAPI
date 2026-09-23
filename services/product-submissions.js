import { createHash, randomUUID } from 'node:crypto';
import { accountBlocked, evaluateEntitlement } from '../functions/subscription-lifecycle.mjs';
import { prepareCatalogWrite } from './catalog-writer.js';
import { submissionError, validateSubmissionContent } from './product-submission-contract.js';
import { restrictedSegmentAccount, activeCustomerSegment } from './customer-segment.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/u;
const states = ['submitted', 'approved', 'rejected'];

function reviewView(snapshot) {
  const data = snapshot.data();
  let content = null;
  // Legacy requests were client-writable. Never pass their arbitrary objects to the review renderer.
  try { content = validateSubmissionContent(data.content); } catch { /* Show a legacy-resolution placeholder. */ }
  const safeText = value => typeof value === 'string' ? value : '';
  return { id: snapshot.id, userId: safeText(data.userId), status: safeText(data.status),
    createdAt: safeText(data.createdAt), productId: safeText(data.productId) || null, content };
}

// Dependencies are injected: isolated tests never import Firebase or configuration.
export function createProductSubmissionHandlers({ getDb, verifyIdToken, now = () => new Date(), makeId = randomUUID, deriveReservationId }) {
  const timestamp = () => now().toISOString();
  const wrap = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const authorization = req.headers?.authorization;
      if (typeof authorization !== 'string' || !/^Bearer \S+$/u.test(authorization)) throw submissionError(401, 'Authentication required.');
      let token;
      try { token = await verifyIdToken(authorization.slice(7), true); }
      catch { throw submissionError(401, 'Invalid or revoked authentication.'); }
      if (!token?.uid || typeof token.uid !== 'string') throw submissionError(401, 'Invalid authentication.');
      const result = await action(req, getDb(), token.uid);
      return res.status(result.code || 200).json(result.body);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 503;
      return res.status(status).json({ error: status === 503 ? 'Submission service unavailable; retry the same operation.' : error.message });
    }
  };
  async function account(tx, db, uid, admin = false) {
    const snapshot = await tx.get(db.collection('users').doc(uid));
    const data = snapshot.data();
    if (!snapshot.exists || accountBlocked(data)) throw submissionError(403, 'Account is unavailable.');
    if (admin && String(data.role || '').toLowerCase() !== 'admin') throw submissionError(403, 'Admin access required.');
    return data;
  }
  function onlyKeys(value, keys) {
    if (Object.keys(value || {}).some(key => !keys.includes(key))) throw submissionError(400, 'Unsupported request fields.');
  }
  function requestRef(req, db) {
    if (!idPattern.test(req.params?.id || '')) throw submissionError(400, 'Invalid submission ID.');
    return db.collection('product_requests').doc(req.params.id);
  }
  async function trusted(tx, db, ref) {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw submissionError(404, 'Submission not found.');
    const data = snapshot.data();
    if (data.version !== 1 || !/^[a-f0-9]{64}$/u.test(data.operationId || '') || !states.includes(data.status)) {
      throw submissionError(409, 'Legacy or invalid submission requires separate operator resolution.');
    }
    const operation = (await tx.get(db.collection('product_submission_operations').doc(data.operationId))).data();
    const content = validateSubmissionContent(data.content);
    if (!operation || operation.submissionId !== ref.id || operation.userId !== data.userId || operation.digest !== hash(content)) {
      throw submissionError(409, 'Submission provenance is invalid.');
    }
    return { data, content };
  }

  const submit = wrap(async (req, db, uid) => {
    onlyKeys(req.query, []);
    const operationKey = req.headers['idempotency-key'];
    if (typeof operationKey !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/u.test(operationKey)) {
      throw submissionError(400, 'A stable Idempotency-Key is required.');
    }
    const content = validateSubmissionContent(req.body);
    const digest = hash(content), operationId = hash([uid, operationKey]);
    const operationRef = db.collection('product_submission_operations').doc(operationId);
    const ref = db.collection('product_requests').doc(makeId());
    return db.runTransaction(async tx => {
      const owner = await account(tx, db, uid);
      const scopedOwner = { ...owner, plan: evaluateEntitlement(owner, now()).plan };
      if (restrictedSegmentAccount(scopedOwner) && content.segment !== activeCustomerSegment(scopedOwner)) {
        throw submissionError(403, 'Product segment is outside your account business segment.');
      }
      const operation = (await tx.get(operationRef)).data();
      if (operation) {
        if (operation.digest !== digest || operation.userId !== uid) throw submissionError(409, 'This operation was already used for different content.');
        const existing = await trusted(tx, db, db.collection('product_requests').doc(operation.submissionId));
        return { body: { id: operation.submissionId, status: existing.data.status, replayed: true } };
      }
      if ((await tx.get(ref)).exists) throw submissionError(409, 'Submission identifier collision. Retry later.');
      const at = timestamp();
      tx.set(ref, { version: 1, userId: uid, operationId, content, status: 'submitted',
        createdAt: at, updatedAt: at, reviewedAt: null, reviewedBy: null, productId: null });
      tx.set(operationRef, { userId: uid, submissionId: ref.id, digest, createdAt: at });
      return { code: 201, body: { id: ref.id, status: 'submitted', replayed: false } };
    });
  });

  const list = wrap(async (req, db, uid) => {
    onlyKeys(req.query, ['status', 'after']);
    const status = req.query?.status || 'submitted', cursor = req.query?.after;
    if (!states.includes(status) || (cursor !== undefined && (typeof cursor !== 'string' || !idPattern.test(cursor)))) {
      throw submissionError(400, 'Invalid list filter.');
    }
    return db.runTransaction(async tx => {
      await account(tx, db, uid, true);
      let query = db.collection('product_requests').where('status', '==', status).orderBy('__name__');
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await tx.get(query.limit(51));
      const rows = snapshot.docs.slice(0, 50).map(reviewView);
      return { body: { submissions: rows, next: snapshot.docs.length > 50 ? rows.at(-1).id : null } };
    });
  });
  const read = wrap(async (req, db, uid) => {
    onlyKeys(req.query, []);
    return db.runTransaction(async tx => {
      await account(tx, db, uid, true);
      const ref = requestRef(req, db);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw submissionError(404, 'Submission not found.');
      return { body: reviewView(snapshot) };
    });
  });
  const review = decision => wrap(async (req, db, uid) => {
    onlyKeys(req.query, []);
    onlyKeys(req.body, []);
    return db.runTransaction(async tx => {
      await account(tx, db, uid, true);
      const ref = requestRef(req, db);
      const { data, content } = await trusted(tx, db, ref);
      if (data.status === decision) return { body: { id: ref.id, status: decision, productId: data.productId, replayed: true } };
      if (data.status !== 'submitted') throw submissionError(409, 'Submission already has a final review decision.');
      const at = timestamp();
      let productId = null;
      let prepared;
      if (decision === 'approved') {
        await account(tx, db, data.userId);
        productId = `submission_${ref.id}`;
        prepared = await prepareCatalogWrite({ tx, db, uid, action: 'create', productId, input: content, at, deriveReservationId });
      }
      prepared?.apply();
      tx.update(ref, { status: decision, productId, reviewedBy: uid, reviewedAt: at, updatedAt: at });
      return { body: { id: ref.id, status: decision, productId, replayed: false } };
    });
  });
  return { submit, list, read, approve: review('approved'), reject: review('rejected') };
}
