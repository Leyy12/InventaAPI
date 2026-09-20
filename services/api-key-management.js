import {
  ApiSecurityError, accountEntitlement, issueCredential, publicKeyMetadata, sendSecurityError,
  usageForToday, validDocumentId,
} from './api-key-security.js';
import { authorizedProductIds } from './daas-catalog.js';
import { normalizeSegment } from './product-contract.js';

function scopeFromBody(body) {
  const full = body.linkedProductIds ?? [];
  const partial = body.linkedVariantSelections ?? {};
  const legacy = body.linkedProducts ?? [];
  if (!Array.isArray(full) || !full.every(validDocumentId)
    || !partial || typeof partial !== 'object' || Array.isArray(partial)
    || !Object.entries(partial).every(([id, values]) => validDocumentId(id) && Array.isArray(values)
      && values.length > 0 && values.every(value => typeof value === 'string' && value.length <= 500))
    || !Array.isArray(legacy) || !legacy.every(value => value && validDocumentId(value.id))) {
    throw new ApiSecurityError(400, 'INVALID_SCOPE', 'Provide product document IDs and non-empty variant selections.');
  }
  // Legacy input contributes IDs only; partial scope always takes precedence.
  const ids = [...new Set([...full, ...legacy.map(value => value.id)])].filter(id => !Object.hasOwn(partial, id));
  const scope = { linkedProductIds: ids, linkedVariantSelections: partial, linkedProducts: [] };
  if (authorizedProductIds(scope).length > 500) throw new ApiSecurityError(400, 'INVALID_SCOPE', 'At most 500 product IDs per key.');
  return scope;
}

function keyName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new ApiSecurityError(400, 'INVALID_NAME', 'A key name of 1–120 characters is required.');
  }
  return value.trim();
}

export function createApiKeyHandlers({ getDb, verifyIdToken, clock = () => new Date() }) {
  const authenticated = operation => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const match = typeof req.headers.authorization === 'string'
        ? /^Bearer ([^\s]+)$/u.exec(req.headers.authorization) : null;
      if (!match) throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'A Firebase ID token is required.');
      let actor;
      try { actor = await verifyIdToken(match[1], true); } catch {
        throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'Invalid or expired authentication.');
      }
      if (!validDocumentId(actor?.uid)) throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'Invalid authentication.');
      return await operation(req, res, actor, getDb());
    } catch (error) { return sendSecurityError(res, error); }
  };

  async function accountContext(db, uid) {
    return db.runTransaction(async tx => {
    const userRef = db.collection('users').doc(uid);
    const accountDoc = await tx.get(userRef);
    if (!accountDoc.exists) throw new ApiSecurityError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
    const usageDoc = await tx.get(db.collection('account_api_usage').doc(uid));
    const account = accountDoc.data();
    const entitlement = accountEntitlement(account, clock());
    if (entitlement.normalization) tx.update(userRef, entitlement.normalization);
    return { account: { ...account, ...entitlement.normalization }, entitlement, usage: usageForToday(usageDoc.exists ? usageDoc.data() : null, clock()) };
    });
  }

  async function currentAccount(tx, db, uid, context) {
    const account = (await tx.get(db.collection('users').doc(uid))).data();
    const entitlement = accountEntitlement(account, clock());
    if (context && (entitlement.plan !== context.entitlement.plan || account.selectedSegment !== context.account.selectedSegment)) {
      throw new ApiSecurityError(409, 'ENTITLEMENT_CHANGED', 'Account changed. Retry with current entitlement.');
    }
    return entitlement;
  }

  function refFor(db, id) {
    if (!validDocumentId(id)) throw new ApiSecurityError(400, 'INVALID_KEY_ID', 'Invalid key document ID.');
    return db.collection('api_keys').doc(id);
  }

  function assertOwner(snapshot, uid) {
    if (!snapshot.exists) throw new ApiSecurityError(404, 'KEY_NOT_FOUND', 'API key not found.');
    if (snapshot.data().userId !== uid) throw new ApiSecurityError(403, 'FORBIDDEN', 'You do not own this API key.');
    return snapshot.data();
  }

  async function validateScope(db, scope, context) {
    const selected = normalizeSegment(context.account.selectedSegment);
    const ids = authorizedProductIds(scope);
    if (context.entitlement.level === 0 && ids.length && !selected) {
      throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Select a supported account segment first.');
    }
    for (const id of ids) {
      const snapshot = await db.collection('products').doc(id).get();
      if (!snapshot.exists) throw new ApiSecurityError(400, 'INVALID_SCOPE', 'A selected product no longer exists.');
      const product = snapshot.data();
      if (context.entitlement.level === 0 && normalizeSegment(product.segment || product.businessType) !== selected) {
        throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Product is outside your account segment.');
      }
    }
  }

  async function audit(db, action, actor, id) {
    // No credentials or request bodies enter audit logs. Audit failure must not replay mutations.
    await db.collection('audit_logs').add({ action, userId: actor.uid, keyId: id, timestamp: clock() }).catch(() => {});
  }

  return {
    list: authenticated(async (req, res, actor, db) => {
      const context = await accountContext(db, actor.uid);
      const keys = await db.collection('api_keys').where('userId', '==', actor.uid).get();
      return res.json({ success: true, keys: keys.docs.filter(doc => doc.data().status === 'active')
        .map(doc => publicKeyMetadata(doc.id, doc.data(), context.entitlement, context.usage)),
      usage: { ...context.usage, limit: context.entitlement.limit, scope: 'account' } });
    }),
    view: authenticated(async (req, res, actor, db) => {
      const snapshot = await refFor(db, req.params.id).get();
      const key = assertOwner(snapshot, actor.uid);
      const context = await accountContext(db, actor.uid);
      return res.json({ success: true, key: publicKeyMetadata(snapshot.id, key, context.entitlement, context.usage) });
    }),
    create: authenticated(async (req, res, actor, db) => {
      const body = req.body || {};
      const name = keyName(body.keyName);
      const context = await accountContext(db, actor.uid);
      const scope = scopeFromBody(body);
      await validateScope(db, scope, context);
      const issued = issueCredential();
      const now = clock();
      const key = {
        ...issued.stored, ...scope, name, userId: actor.uid, userEmail: actor.email || '',
        status: 'active', createdAt: now, lastUsed: null, requestsUsed: 0,
        plan: context.entitlement.plan, requestLimit: context.entitlement.limit,
        productAvailability: Object.fromEntries(authorizedProductIds(scope).map(id => [id, { availableSince: now }])),
      };
      await db.runTransaction(async tx => {
        await currentAccount(tx, db, actor.uid, context);
        const ref = db.collection('api_keys').doc(issued.id);
        if ((await tx.get(ref)).exists) throw new ApiSecurityError(503, 'KEY_COLLISION', 'Retry key creation.');
        tx.set(ref, key);
      });
      await audit(db, 'API Key Generated', actor, issued.id);
      return res.json({ success: true, ...publicKeyMetadata(issued.id, key, context.entitlement, context.usage), key: issued.credential });
    }),
    rename: authenticated(async (req, res, actor, db) => {
      const name = keyName(req.body?.name);
      if (Object.keys(req.body || {}).some(field => !['name', 'userId'].includes(field))) {
        throw new ApiSecurityError(400, 'INVALID_METADATA', 'Only the key name can be edited.');
      }
      const ref = refFor(db, req.params.id);
      await db.runTransaction(async tx => {
        await currentAccount(tx, db, actor.uid);
        assertOwner(await tx.get(ref), actor.uid);
        tx.update(ref, { name });
      });
      await audit(db, 'API Key Renamed', actor, ref.id);
      return res.json({ success: true, name });
    }),
    products: authenticated(async (req, res, actor, db) => {
      const ref = refFor(db, req.params.id);
      assertOwner(await ref.get(), actor.uid);
      const context = await accountContext(db, actor.uid);
      const scope = scopeFromBody(req.body || {});
      await validateScope(db, scope, context);
      const count = await db.runTransaction(async tx => {
        await currentAccount(tx, db, actor.uid, context);
        const existing = assertOwner(await tx.get(ref), actor.uid);
        const previousIds = new Set(authorizedProductIds(existing));
        const availability = Object.fromEntries(authorizedProductIds(scope).flatMap(id => {
          if (Object.hasOwn(existing.productAvailability || {}, id)) return [[id, existing.productAvailability[id]]];
          return previousIds.has(id) ? [] : [[id, { availableSince: clock() }]];
        }));
        // Clear legacy snapshots too: otherwise the Phase 1 fallback could reauthorize removed IDs.
        tx.update(ref, { ...scope, productAvailability: availability });
        return Object.keys(availability).length;
      });
      await audit(db, 'API Key Products Updated', actor, ref.id);
      return res.json({ success: true, ...scope, productAvailabilityCount: count });
    }),
    revoke: authenticated(async (req, res, actor, db) => {
      const ref = refFor(db, req.params.id);
      await db.runTransaction(async tx => {
        await currentAccount(tx, db, actor.uid);
        assertOwner(await tx.get(ref), actor.uid);
        tx.update(ref, { status: 'revoked', revokedAt: clock() });
      });
      await audit(db, 'API Key Revoked', actor, ref.id);
      return res.json({ success: true, message: 'API key revoked.' });
    }),
  };
}
