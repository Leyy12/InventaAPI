import { createHash } from 'node:crypto';
import {
  ApiSecurityError, accountEntitlement, issueCredential, publicKeyMetadata, sendSecurityError,
  usageForToday, validDocumentId, upgradeRequiredError, assertActiveKey, trialUsage,
} from './api-key-security.js';
import { authorizedProductIds } from './daas-catalog.js';
import { normalizeSegment } from './product-contract.js';
import { restrictedSegmentAccount, activeCustomerSegment } from './customer-segment.js';

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

export function createApiKeyHandlers({ getDb, verifyIdToken, clock = () => new Date(), monthlyCutoverAt = null }) {
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
    let account = accountDoc.data();
    let entitlement = accountEntitlement(account, clock());
    let legacyConsumed = false;
    if (entitlement.activeTrial && !Object.hasOwn(account, 'trialConsumed')) {
      const history = await tx.get(db.collection('account_trial_usage').doc(uid));
      legacyConsumed = trialUsage(history.data(), entitlement).used === 500;
      if (legacyConsumed) { account = { ...account, trialConsumed: true }; entitlement = accountEntitlement(account, clock()); }
    }
    const usage = entitlement.upgradeRequired ? { used: null, period: 'upgrade_required', resetsAt: null, state: 'upgrade_required' }
      : entitlement.activeTrial ? { used: null, period: 'trial_catalog', resetsAt: entitlement.expiresAt }
        : usageForToday(usageDoc.exists ? usageDoc.data() : null, clock());
    if (entitlement.normalization) tx.update(userRef, entitlement.normalization);
    if (legacyConsumed) tx.update(userRef, { trialConsumed: true });
    return { account: { ...account, ...entitlement.normalization }, entitlement, usage };
    });
  }

  async function currentAccount(tx, db, uid, context, requireIssuance = false) {
    const account = (await tx.get(db.collection('users').doc(uid))).data();
    const now = clock();
    const entitlement = accountEntitlement(account, now);
    if (requireIssuance && entitlement.upgradeRequired) throw upgradeRequiredError();
    if (context && (entitlement.plan !== context.entitlement.plan || account.selectedSegment !== context.account.selectedSegment
      || account.businessSegment !== context.account.businessSegment)) {
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

  async function validateScope(db, scope, context, tx = null) {
    const scopedAccount = { ...context.account, plan: context.entitlement.plan };
    const restricted = restrictedSegmentAccount(scopedAccount);
    const selected = activeCustomerSegment(scopedAccount);
    const ids = authorizedProductIds(scope);
    if (restricted && ids.length && !selected) {
      throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Select a supported account segment first.');
    }
    for (const id of ids) {
      const ref = db.collection('products').doc(id);
      const snapshot = tx ? await tx.get(ref) : await ref.get();
      if (!snapshot.exists) throw new ApiSecurityError(400, 'INVALID_SCOPE', 'A selected product no longer exists.');
      const product = snapshot.data();
      if (restricted && normalizeSegment(product.segment || product.businessType) !== selected) {
        throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Product is outside your account segment.');
      }
    }
  }

  async function audit(db, action, actor, id) {
    // No credentials or request bodies enter audit logs. Audit failure must not replay mutations.
    await db.collection('audit_logs').add({ action, userId: actor.uid, keyId: id, timestamp: clock() }).catch(() => {});
  }

  function trialProductCount(scope) {
    const count = authorizedProductIds(scope).length;
    if (count < 50) throw new ApiSecurityError(400, 'TRIAL_PRODUCT_MINIMUM',
      'Select at least 50 products to generate or maintain your Free Trial API key.');
    if (count > 500) throw new ApiSecurityError(400, 'TRIAL_PRODUCT_MAXIMUM', 'Free Trial permits at most 500 products.');
    return count;
  }

  async function trialKeys(tx, db, uid, entitlement, { scope = null, existingId = null } = {}) {
    if (!entitlement.activeTrial) return;
    if (scope) trialProductCount(scope);
    const keys = await tx.get(db.collection('api_keys').where('userId', '==', uid));
    const active = keys.docs.filter(doc => doc.data().status === 'active');
    if (existingId ? active.length !== 1 || active[0].id !== existingId : active.length > 0) {
      throw new ApiSecurityError(409, 'TRIAL_KEY_LIMIT',
        'Free Trial permits one active API key. Manage or replace your existing key instead.');
    }
  }

  function serializeTrialMutation(tx, db, uid, entitlement) {
    if (entitlement.activeTrial) {
      // Every Trial key create/rotate/revoke/scope update reads and writes the
      // same account, serializing phantom additions without a new composite index.
      tx.update(db.collection('users').doc(uid), { trialKeyMutationAt: clock().toISOString() });
    }
  }

  function verifyTrialBoundary(entitlement) {
    if (entitlement.activeTrial && clock().getTime() >= Date.parse(entitlement.expiresAt)) throw upgradeRequiredError();
  }

  return {
    list: authenticated(async (req, res, actor, db) => {
      const context = await accountContext(db, actor.uid);
      const keys = await db.collection('api_keys').where('userId', '==', actor.uid).get();
      const activeKeys = keys.docs.filter(doc => doc.data().status === 'active');
      const productsIncluded = new Set(activeKeys.flatMap(doc => authorizedProductIds(doc.data()))).size;
      return res.json({ success: true, keys: keys.docs.filter(doc => doc.data().status === 'active')
        .map(doc => publicKeyMetadata(doc.id, doc.data(), context.entitlement, context.usage)),
      usage: { ...context.usage, limit: context.entitlement.limit, scope: 'account' },
      ...(context.entitlement.activeTrial ? { trialCatalog: { productsIncluded, minimumProducts: 50, maximumProducts: 500,
        productsAvailable: Math.max(0, 500 - productsIncluded), activeKeys: activeKeys.length, maximumActiveKeys: 1,
        expiresAt: context.entitlement.expiresAt } } : {}) });
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
      if (context.entitlement.upgradeRequired) throw upgradeRequiredError();
      const scope = scopeFromBody(body);
      await validateScope(db, scope, context);
      const issued = issueCredential();
      const key = await db.runTransaction(async tx => {
        const entitlement = await currentAccount(tx, db, actor.uid, context, true);
        await trialKeys(tx, db, actor.uid, entitlement, { scope });
        if (entitlement.activeTrial) await validateScope(db, scope, context, tx);
        // Recompute on every transaction retry, including a retry across midnight.
        // Caller dates/timezones never enter this account-level generation policy.
        const now = clock();
        const window = now.toISOString().slice(0, 10);
        const nextDay = new Date(now);
        nextDay.setUTCHours(24, 0, 0, 0);
        const nextEligibleAt = nextDay.toISOString();
        const ownerHash = createHash('sha256').update(actor.uid, 'utf8').digest('hex');
        const marker = db.collection('api_key_generation_days').doc(`${ownerHash}_${window}`);
        if ((await tx.get(marker)).exists) {
          throw new ApiSecurityError(409, 'API_KEY_DAILY_GENERATION_LIMIT',
            "You've already generated an API key today. You can generate another after the next UTC reset.",
            { nextEligibleAt });
        }
        const ref = db.collection('api_keys').doc(issued.id);
        if ((await tx.get(ref)).exists) throw new ApiSecurityError(503, 'KEY_COLLISION', 'Retry key creation.');
        const record = {
          ...issued.stored, ...scope, scopeVersion: 0, name, userId: actor.uid, userEmail: actor.email || '',
          status: 'active', createdAt: now, lastUsed: null, requestsUsed: 0,
          plan: context.entitlement.plan, requestLimit: context.entitlement.limit,
          productAvailability: Object.fromEntries(authorizedProductIds(scope).map(id => [id, { availableSince: now }])),
        };
        verifyTrialBoundary(entitlement);
        tx.set(ref, record);
        tx.set(marker, { userId: actor.uid, window, keyId: issued.id, createdAt: now, nextEligibleAt });
        serializeTrialMutation(tx, db, actor.uid, entitlement);
        return record;
      });
      await audit(db, 'API Key Generated', actor, issued.id);
      return res.json({ success: true, ...publicKeyMetadata(issued.id, key, context.entitlement, context.usage), key: issued.credential });
    }),
    replace: authenticated(async (req, res, actor, db) => {
      const oldRef = refFor(db, req.params.id);
      const context = await accountContext(db, actor.uid);
      if (context.entitlement.upgradeRequired) throw upgradeRequiredError();
      const issued = issueCredential();
      const record = await db.runTransaction(async tx => {
        const entitlement = await currentAccount(tx, db, actor.uid, context);
        if (entitlement.upgradeRequired) throw upgradeRequiredError();
        const oldKey = assertOwner(await tx.get(oldRef), actor.uid);
        assertActiveKey(oldKey, clock());
        await trialKeys(tx, db, actor.uid, entitlement, { scope: oldKey, existingId: oldRef.id });
        if (entitlement.activeTrial) await validateScope(db, oldKey, context, tx);
        const newRef = db.collection('api_keys').doc(issued.id);
        if ((await tx.get(newRef)).exists) throw new ApiSecurityError(503, 'KEY_COLLISION', 'Retry key replacement.');
        const now = clock();
        // Only allowlisted, non-secret fields survive rotation. In particular, a
        // legacy plaintext `key` and unknown future fields are never copied.
        const replacement = {
          ...issued.stored,
          name: oldKey.name || 'Replacement API key',
          userId: actor.uid, userEmail: actor.email || '',
          status: 'active', createdAt: now, lastUsed: null, requestsUsed: 0,
          plan: entitlement.plan, requestLimit: entitlement.limit,
          linkedProductIds: Array.isArray(oldKey.linkedProductIds) ? oldKey.linkedProductIds : [],
          linkedVariantSelections: oldKey.linkedVariantSelections && typeof oldKey.linkedVariantSelections === 'object'
            && !Array.isArray(oldKey.linkedVariantSelections) ? oldKey.linkedVariantSelections : {},
          linkedProducts: Array.isArray(oldKey.linkedProducts)
            ? oldKey.linkedProducts.filter(value => validDocumentId(value?.id)).map(value => ({ id: value.id })) : [],
          productAvailability: oldKey.productAvailability || {},
          scopeVersion: Number.isSafeInteger(oldKey.scopeVersion) ? oldKey.scopeVersion : 0,
          ...(oldKey.expiresAt != null ? { expiresAt: oldKey.expiresAt } : {}),
          replacesKeyId: oldRef.id, rotationReason: 'replacement',
        };
        verifyTrialBoundary(entitlement);
        tx.update(oldRef, { status: 'revoked', revokedAt: now,
          replacedByKeyId: issued.id, rotationReason: 'replacement' });
        tx.set(newRef, replacement);
        serializeTrialMutation(tx, db, actor.uid, entitlement);
        return replacement;
      });
      await audit(db, 'API Key Replaced', actor, oldRef.id);
      return res.json({ success: true,
        ...publicKeyMetadata(issued.id, record, context.entitlement, context.usage),
        key: issued.credential });
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
      if (context.entitlement.upgradeRequired) throw upgradeRequiredError();
      const scope = scopeFromBody(req.body || {});
      await validateScope(db, scope, context);
      const count = await db.runTransaction(async tx => {
        const entitlement = await currentAccount(tx, db, actor.uid, context, true);
        const existing = assertOwner(await tx.get(ref), actor.uid);
        assertActiveKey(existing, clock());
        await trialKeys(tx, db, actor.uid, entitlement, { scope, existingId: ref.id });
        if (entitlement.activeTrial) await validateScope(db, scope, context, tx);
        const version = Number.isSafeInteger(existing.scopeVersion) ? existing.scopeVersion : 0;
        if (entitlement.activeTrial && req.body?.expectedScopeVersion !== version) {
          throw new ApiSecurityError(409, 'CATALOG_CHANGED', 'Catalog changed. Reload your current selection before saving.');
        }
        const previousIds = new Set(authorizedProductIds(existing));
        const availability = Object.fromEntries(authorizedProductIds(scope).flatMap(id => {
          if (Object.hasOwn(existing.productAvailability || {}, id)) return [[id, existing.productAvailability[id]]];
          return previousIds.has(id) ? [] : [[id, { availableSince: clock() }]];
        }));
        // Clear legacy snapshots too: otherwise the Phase 1 fallback could reauthorize removed IDs.
        verifyTrialBoundary(entitlement);
        tx.update(ref, { ...scope, scopeVersion: version + 1, productAvailability: availability });
        serializeTrialMutation(tx, db, actor.uid, entitlement);
        return Object.keys(availability).length;
      });
      await audit(db, 'API Key Products Updated', actor, ref.id);
      return res.json({ success: true, ...scope, productAvailabilityCount: count });
    }),
    revoke: authenticated(async (req, res, actor, db) => {
      const ref = refFor(db, req.params.id);
      await db.runTransaction(async tx => {
        const entitlement = await currentAccount(tx, db, actor.uid);
        assertOwner(await tx.get(ref), actor.uid);
        tx.update(ref, { status: 'revoked', revokedAt: clock() });
        serializeTrialMutation(tx, db, actor.uid, entitlement);
      });
      await audit(db, 'API Key Revoked', actor, ref.id);
      return res.json({ success: true, message: 'API key revoked.' });
    }),
  };
}
