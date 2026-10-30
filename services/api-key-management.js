import { createHash } from 'node:crypto';
import { requestLimitPolicy, promisedRequestAllowance } from '../functions/request-limit-policy.mjs';
import { resolveRequestContracts, preserveRequestContracts } from '../functions/request-contract-evidence.mjs';
import {
  ApiSecurityError, accountEntitlement, issueCredential, publicKeyMetadata, sendSecurityError,
  usageForToday, validDocumentId, upgradeRequiredError, assertActiveKey, trialUsage,
} from './api-key-security.js';
import { TRIAL_MIN_PRODUCTS, TRIAL_MAX_PRODUCTS, TRIAL_MAX_ACTIVE_KEYS, trialCatalogChangeAllowed } from '../functions/entitlement-limits.mjs';
import { authorizedProductIds } from './daas-catalog.js';
import { openCredential, sealCredential } from './credential-vault.js';
import { normalizeSegment } from './product-contract.js';
import { restrictedSegmentAccount, activeCustomerSegment } from './customer-segment.js';
import { paidQuotaPlan, readMonthlySummary } from './paid-monthly-quota.js';
import { PAID_MONTHLY_REQUEST_LIMIT, PRO_KEY_PRODUCT_LIMIT, PRO_MAX_KEY_PRODUCT_LIMIT } from '../functions/entitlement-limits.mjs';

// Products one paid key may hold: Pro 500; Pro Max 1,500 (its one key covers all three segments).
const keyProductLimit = plan => plan === 'pro_max' ? PRO_MAX_KEY_PRODUCT_LIMIT : PRO_KEY_PRODUCT_LIMIT;

// Paid keys: the monthly allowance this key draws from replaces the daily figures.
function withMonthly(metadata, key, context) {
  const monthly = context.monthly;
  if (!monthly) return metadata;
  // Pro Max: the one key draws from every segment's allowance; show the total used.
  const used = monthly.plan === 'pro'
    ? (monthly.buckets.find(item => item.bucket === 'account') || { used: 0 }).used
    : monthly.buckets.reduce((sum, item) => sum + item.used, 0);
  return { ...metadata, requestLimit: monthly.limit, requestsUsed: used, resetAt: monthly.resetsAt,
    usageScope: monthly.plan === 'pro' ? 'account' : 'segment', quotaPeriod: 'monthly',
    segment: monthly.plan === 'pro' ? normalizeSegment(key.segment) || null : null };
}

// Adds products to an existing selection. A product added in full replaces a
// variant-only selection; variant selections for the same product are combined.
export function mergeScope(existing, addFull, addPartial) {
  const partial = { ...(existing?.linkedVariantSelections && typeof existing.linkedVariantSelections === 'object'
    && !Array.isArray(existing.linkedVariantSelections) ? existing.linkedVariantSelections : {}) };
  const full = new Set(authorizedProductIds(existing || {}).filter(id => !Object.hasOwn(partial, id)));
  for (const id of addFull) { full.add(id); delete partial[id]; }
  for (const [id, values] of Object.entries(addPartial)) {
    if (full.has(id)) continue;
    partial[id] = [...new Set([...(partial[id] || []), ...values])];
  }
  return { linkedProductIds: [...full], linkedVariantSelections: partial, linkedProducts: [] };
}

function scopeFromBody(body, allowLegacyReduction = false) {
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
  if (!allowLegacyReduction && authorizedProductIds(scope).length > PRO_MAX_KEY_PRODUCT_LIMIT) {
    throw new ApiSecurityError(400, 'INVALID_SCOPE', `At most ${PRO_MAX_KEY_PRODUCT_LIMIT.toLocaleString('en-US')} product IDs per key.`);
  }
  return scope;
}

function keyName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new ApiSecurityError(400, 'INVALID_NAME', 'A key name of 1–120 characters is required.');
  }
  return value.trim();
}

export function createApiKeyHandlers({ getDb, verifyIdToken, clock = () => new Date(), monthlyCutoverAt = null, vaultSecret = null,
  notifier = null, messages = null }) {
  // Best-effort email + bell after a key change; never affects the change itself.
  const tell = async (db, actor, message) => {
    if (!notifier || !messages) return;
    try {
      const email = actor.email || (await db.collection('users').doc(actor.uid).get()).data()?.email;
      await notifier.notify(db, { userId: actor.uid, email, ...message });
    } catch { /* notification is optional */ }
  };
  const sealed = issued => {
    const value = sealCredential(issued.credential, issued.id, vaultSecret);
    return value ? { credentialSealed: value } : {};
  };
  const authenticated = operation => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const match = typeof req.headers.authorization === 'string'
        ? /^Bearer ([^\s]+)$/u.exec(req.headers.authorization) : null;
      if (!match) throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'A sign-in token is required.');
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
    const requestLimits = requestLimitPolicy((await tx.get(db.collection('system').doc('settings'))).data());
    let account = accountDoc.data();
    const resolved = await resolveRequestContracts(tx, db, uid, account, { recoverHistorical: true, recordCompleteness: true });
    const requestContracts = resolved.contracts;
    let entitlement = accountEntitlement(account, clock(), requestLimits, requestContracts);
    let legacyConsumed = false;
    if (entitlement.activeTrial && !Object.hasOwn(account, 'trialConsumed')) {
      const history = await tx.get(db.collection('account_trial_usage').doc(uid));
      legacyConsumed = trialUsage(history.data(), entitlement).used === 500;
      if (legacyConsumed) { account = { ...account, trialConsumed: true }; entitlement = accountEntitlement(account, clock(), requestLimits, requestContracts); }
    }
    const usage = entitlement.upgradeRequired ? { used: null, period: 'upgrade_required', resetsAt: null, state: 'upgrade_required' }
      : entitlement.activeTrial && promisedRequestAllowance(requestContracts, 'free_trial') === null ? { used: null, period: 'trial_catalog', resetsAt: entitlement.expiresAt }
        : entitlement.activeTrial && !usageDoc.exists ? { used: null, period: 'daily', resetsAt: null, state: 'unavailable' }
        : usageForToday(usageDoc.exists ? usageDoc.data() : null, clock());
    const paidPlan = paidQuotaPlan(entitlement);
    const monthly = paidPlan ? await readMonthlySummary(tx, db, uid, paidPlan,
      (await tx.get(db.collection('api_keys').where('userId', '==', uid))).docs.map(doc => doc.data()), clock()) : null;
    preserveRequestContracts(tx, resolved);
    if (entitlement.normalization) tx.update(userRef, entitlement.normalization);
    if (legacyConsumed) tx.update(userRef, { trialConsumed: true });
    return { account: { ...account, ...entitlement.normalization }, entitlement, usage, monthly };
    });
  }

  async function currentAccount(tx, db, uid, context, requireIssuance = false) {
    const account = (await tx.get(db.collection('users').doc(uid))).data();
    const now = clock();
    // Rename/revoke keep their existing security recovery path even when the
    // mutable allowance policy is unavailable. Issuance/scope changes reverify it.
    const requestLimits = context || requireIssuance ? requestLimitPolicy((await tx.get(db.collection('system').doc('settings'))).data()) : undefined;
    const requestContracts = context || requireIssuance ? (await resolveRequestContracts(tx, db, uid, account)).contracts : undefined;
    const entitlement = accountEntitlement(account, now, requestLimits, requestContracts);
    if (requireIssuance && entitlement.upgradeRequired) throw upgradeRequiredError();
    if (context && (entitlement.plan !== context.entitlement.plan || entitlement.limit !== context.entitlement.limit || account.selectedSegment !== context.account.selectedSegment
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

  // The Trial catalog is the union of product IDs across active keys, so
  // reusing a product in another key never consumes another product slot.
  function trialProductCount(scope, previous, otherKeys) {
    const ids = authorizedProductIds(scope);
    const requested = new Set(ids);
    if (previous && authorizedProductIds(previous).some(id => !requested.has(id))) {
      throw new ApiSecurityError(400, 'TRIAL_PRODUCT_REMOVAL_NOT_ALLOWED',
        'Products already included in a Free Trial cannot be removed.');
    }
    const others = otherKeys.flatMap(key => authorizedProductIds(key));
    const before = [...others, ...(previous ? authorizedProductIds(previous) : [])];
    if (!trialCatalogChangeAllowed(before, [...others, ...ids])) {
      throw new ApiSecurityError(400, 'TRIAL_PRODUCT_MAXIMUM',
        `Free Trial permits up to ${TRIAL_MAX_PRODUCTS} products across all keys. Existing over-cap catalogs cannot add products.`);
    }
    return ids.length;
  }

  async function trialKeys(tx, db, uid, entitlement, { scope = null, existingId = null, previous = null } = {}) {
    if (!entitlement.activeTrial) return;
    const keys = await tx.get(db.collection('api_keys').where('userId', '==', uid));
    const active = keys.docs.filter(doc => doc.data().status === 'active');
    if (existingId ? active.length > TRIAL_MAX_ACTIVE_KEYS || !active.some(doc => doc.id === existingId)
      : active.length >= TRIAL_MAX_ACTIVE_KEYS) {
      throw new ApiSecurityError(409, 'TRIAL_KEY_LIMIT',
        'Free Trial includes one API key. Add products to it, or revoke it before creating a new one.');
    }
    if (scope) trialProductCount(scope, previous, active.filter(doc => doc.id !== existingId).map(doc => doc.data()));
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

  // Paid key rules. Each product's segment decides where it may go.
  async function productSegments(tx, db, ids) {
    const segments = new Map();
    for (const id of ids) {
      const snapshot = await tx.get(db.collection('products').doc(id));
      if (!snapshot.exists) throw new ApiSecurityError(400, 'INVALID_SCOPE', 'A selected product no longer exists.');
      const product = snapshot.data();
      segments.set(id, normalizeSegment(product.segment || product.businessType));
    }
    return segments;
  }
  const PRO_MAX_KEY_GROUP = 'all segments';
  const newestFirst = (a, b) => String(b.data().createdAt?.toISOString?.() ?? b.data().createdAt ?? '')
    .localeCompare(String(a.data().createdAt?.toISOString?.() ?? a.data().createdAt ?? ''));
  const PRO_ONE_KEY = 'Pro includes one API key. Use "Add to my API key" on the Products page to add products to it.';
  const PRO_MAX_ONE_KEY = 'Pro Max includes one API key for all three segments. Use "Add to my API key" on the Products page to add products to it.';
  const proSegmentOnly = segment => `Pro adds products from your ${segment} segment only. Pro Max covers all three segments.`;

  // Generate endpoint for paid plans: Pro and Pro Max each hold ONE key. Pro's key
  // stays in its segment; Pro Max's key may hold products from all three segments.
  async function paidKeySegment(tx, db, uid, plan, scope, context, entitlement) {
    const keys = await tx.get(db.collection('api_keys').where('userId', '==', uid));
    const active = keys.docs.filter(doc => doc.data().status === 'active');
    const segments = await productSegments(tx, db, authorizedProductIds(scope));
    if (plan === 'pro') {
      if (active.length) throw new ApiSecurityError(409, 'PRO_SINGLE_KEY', PRO_ONE_KEY);
      const segment = activeCustomerSegment({ ...context.account, plan: entitlement.plan });
      if (!segment) throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Select your business segment first.');
      if ([...segments.values()].some(value => value !== segment)) throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', proSegmentOnly(segment));
      if (segments.size > PRO_KEY_PRODUCT_LIMIT) throw new ApiSecurityError(400, 'KEY_PRODUCT_LIMIT', `Your API key can hold at most ${PRO_KEY_PRODUCT_LIMIT} products.`);
      return segment;
    }
    if (active.length) throw new ApiSecurityError(409, 'PRO_MAX_SINGLE_KEY', PRO_MAX_ONE_KEY);
    if ([...segments.values()].some(value => !value)) throw new ApiSecurityError(400, 'INVALID_SCOPE', 'A selected product has no business segment.');
    if (segments.size > PRO_MAX_KEY_PRODUCT_LIMIT) throw new ApiSecurityError(400, 'KEY_PRODUCT_LIMIT', `Your Pro Max API key can hold at most ${PRO_MAX_KEY_PRODUCT_LIMIT.toLocaleString('en-US')} products.`);
    return null; // one key for every segment: not tagged with a segment
  }

  return {
    list: authenticated(async (req, res, actor, db) => {
      const context = await accountContext(db, actor.uid);
      const keys = await db.collection('api_keys').where('userId', '==', actor.uid).get();
      const activeKeys = keys.docs.filter(doc => doc.data().status === 'active');
      const productsIncluded = new Set(activeKeys.flatMap(doc => authorizedProductIds(doc.data()))).size;
      return res.json({ success: true, keys: keys.docs.filter(doc => doc.data().status === 'active')
        .map(doc => withMonthly(publicKeyMetadata(doc.id, doc.data(), context.entitlement, context.usage), doc.data(), context)),
      usage: { ...context.usage, limit: context.entitlement.limit, scope: 'account' },
      ...(context.monthly ? { monthlyUsage: context.monthly } : {}),
      ...(context.entitlement.activeTrial ? { trialCatalog: { productsIncluded, minimumProducts: TRIAL_MIN_PRODUCTS, maximumProducts: TRIAL_MAX_PRODUCTS,
        productsAvailable: Math.max(0, TRIAL_MAX_PRODUCTS - productsIncluded), activeKeys: activeKeys.length, maximumActiveKeys: TRIAL_MAX_ACTIVE_KEYS,
        expiresAt: context.entitlement.expiresAt } } : {}) });
    }),
    view: authenticated(async (req, res, actor, db) => {
      const snapshot = await refFor(db, req.params.id).get();
      const key = assertOwner(snapshot, actor.uid);
      const context = await accountContext(db, actor.uid);
      return res.json({ success: true, key: withMonthly(publicKeyMetadata(snapshot.id, key, context.entitlement, context.usage), key, context) });
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
        const paidPlan = paidQuotaPlan(entitlement);
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
        // Paid key rules (one Pro key; one Pro Max key per segment) after the daily rule.
        const segment = paidPlan ? await paidKeySegment(tx, db, actor.uid, paidPlan, scope, context, entitlement) : null;
        const ref = db.collection('api_keys').doc(issued.id);
        if ((await tx.get(ref)).exists) throw new ApiSecurityError(503, 'KEY_COLLISION', 'Retry key creation.');
        const record = {
          ...issued.stored, ...sealed(issued), ...scope, scopeVersion: 0, name, userId: actor.uid, userEmail: actor.email || '',
          status: 'active', createdAt: now, lastUsed: null, requestsUsed: 0,
          plan: context.entitlement.plan, requestLimit: paidPlan ? PAID_MONTHLY_REQUEST_LIMIT : context.entitlement.limit,
          ...(segment ? { segment } : {}),
          productAvailability: Object.fromEntries(authorizedProductIds(scope).map(id => [id, { availableSince: now }])),
        };
        verifyTrialBoundary(entitlement);
        tx.set(ref, record);
        tx.set(marker, { userId: actor.uid, window, keyId: issued.id, createdAt: now, nextEligibleAt });
        serializeTrialMutation(tx, db, actor.uid, entitlement);
        return record;
      });
      await audit(db, 'API Key Generated', actor, issued.id);
      if (messages) await tell(db, actor, messages.keyCreated(name));
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
        await trialKeys(tx, db, actor.uid, entitlement, { scope: oldKey, existingId: oldRef.id, previous: oldKey });
        if (entitlement.activeTrial) await validateScope(db, oldKey, context, tx);
        const newRef = db.collection('api_keys').doc(issued.id);
        if ((await tx.get(newRef)).exists) throw new ApiSecurityError(503, 'KEY_COLLISION', 'Retry key replacement.');
        const now = clock();
        // Only allowlisted, non-secret fields survive rotation. In particular, a
        // legacy plaintext `key` and unknown future fields are never copied.
        const replacement = {
          ...issued.stored, ...sealed(issued),
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
    // Owner-only copy of a sealed secret. Keys created before sealing existed,
    // or while no vault secret is configured, stay hash-only and unrecoverable.
    reveal: authenticated(async (req, res, actor, db) => {
      const ref = refFor(db, req.params.id);
      const key = assertOwner(await ref.get(), actor.uid);
      assertActiveKey(key, clock());
      const credential = openCredential(key.credentialSealed, ref.id, vaultSecret);
      if (!credential) {
        throw new ApiSecurityError(404, 'KEY_NOT_RECOVERABLE',
          'This key was created before copy was available. Create a new key to be able to copy it later.');
      }
      await audit(db, 'API Key Copied', actor, ref.id);
      return res.json({ success: true, key: credential });
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
      const scope = scopeFromBody(req.body || {}, context.entitlement.activeTrial);
      const editPlan = paidQuotaPlan(context.entitlement);
      if (editPlan && authorizedProductIds(scope).length > keyProductLimit(editPlan)) {
        throw new ApiSecurityError(400, 'KEY_PRODUCT_LIMIT', `Your API key can hold at most ${keyProductLimit(editPlan).toLocaleString('en-US')} products.`);
      }
      if (!context.entitlement.activeTrial) await validateScope(db, scope, context);
      const count = await db.runTransaction(async tx => {
        const entitlement = await currentAccount(tx, db, actor.uid, context, true);
        const existing = assertOwner(await tx.get(ref), actor.uid);
        assertActiveKey(existing, clock());
        const version = Number.isSafeInteger(existing.scopeVersion) ? existing.scopeVersion : 0;
        if (entitlement.activeTrial && req.body?.expectedScopeVersion !== version) {
          throw new ApiSecurityError(409, 'CATALOG_CHANGED', 'Catalog changed. Reload your current selection before saving.');
        }
        await trialKeys(tx, db, actor.uid, entitlement, { scope, existingId: ref.id, previous: existing });
        if (entitlement.activeTrial) await validateScope(db, scope, context, tx);
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
    // Pro and Pro Max: add the selection to the account's ONE API key (created the
    // first time). Pro accepts products from its segment; Pro Max from all three.
    addProducts: authenticated(async (req, res, actor, db) => {
      const context = await accountContext(db, actor.uid);
      if (context.entitlement.upgradeRequired) throw upgradeRequiredError();
      const plan = paidQuotaPlan(context.entitlement);
      if (!plan) throw new ApiSecurityError(403, 'PAID_PLAN_REQUIRED', 'Adding products to an API key this way needs an active Pro or Pro Max plan.');
      const scope = scopeFromBody(req.body || {});
      const ids = authorizedProductIds(scope);
      if (!ids.length) throw new ApiSecurityError(400, 'INVALID_SCOPE', 'Select at least one product.');
      const issued = [issueCredential()];
      const results = await db.runTransaction(async tx => {
        const entitlement = await currentAccount(tx, db, actor.uid, context, true);
        if (paidQuotaPlan(entitlement) !== plan) throw new ApiSecurityError(409, 'ENTITLEMENT_CHANGED', 'Account changed. Retry with current entitlement.');
        // Reads first: products, keys and the new key IDs.
        const segments = await productSegments(tx, db, ids);
        const keys = await tx.get(db.collection('api_keys').where('userId', '==', actor.uid));
        const active = keys.docs.filter(doc => doc.data().status === 'active');
        for (const credential of issued) {
          if ((await tx.get(db.collection('api_keys').doc(credential.id))).exists) throw new ApiSecurityError(503, 'KEY_COLLISION', 'Retry adding products.');
        }
        const now = clock();
        const partial = scope.linkedVariantSelections;
        const groups = new Map();
        const addTo = (segment, id) => {
          const group = groups.get(segment) || { full: [], partial: {} };
          if (Object.hasOwn(partial, id)) group.partial[id] = partial[id]; else group.full.push(id);
          groups.set(segment, group);
        };
        let proKey = null;
        if (plan === 'pro') {
          const tagged = active.filter(doc => normalizeSegment(doc.data().segment)).sort(newestFirst);
          proKey = tagged[0] || [...active].sort(newestFirst)[0] || null;
          const segment = normalizeSegment(proKey?.data().segment) || activeCustomerSegment({ ...context.account, plan: entitlement.plan });
          if (!segment) throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', 'Select your business segment first.');
          for (const id of ids) {
            if (segments.get(id) !== segment) throw new ApiSecurityError(403, 'PLAN_SEGMENT_RESTRICTION', proSegmentOnly(segment));
            addTo(segment, id);
          }
        } else {
          // Pro Max: the one combined key (untagged), or, for an account that still
          // has older per-segment keys, the oldest of those.
          const untagged = active.filter(doc => !normalizeSegment(doc.data().segment)).sort(newestFirst);
          proKey = untagged[0] || [...active].sort(newestFirst).at(-1) || null;
          for (const id of ids) {
            if (!segments.get(id)) throw new ApiSecurityError(400, 'INVALID_SCOPE', 'A selected product has no business segment.');
            addTo(PRO_MAX_KEY_GROUP, id);
          }
        }
        verifyTrialBoundary(entitlement);
        const out = [];
        let next = 0;
        for (const [segment, group] of groups) {
          const target = proKey;
          const existing = target ? target.data() : {};
          if (target) assertActiveKey(existing, now);
          const merged = mergeScope(existing, group.full, group.partial);
          const total = authorizedProductIds(merged).length;
          if (total > keyProductLimit(plan)) {
            throw new ApiSecurityError(400, 'KEY_PRODUCT_LIMIT', `Your API key can hold at most ${keyProductLimit(plan).toLocaleString('en-US')} products.`);
          }
          const before = new Set(authorizedProductIds(existing));
          const availability = { ...(existing.productAvailability || {}) };
          for (const id of authorizedProductIds(merged)) if (!before.has(id) && !Object.hasOwn(availability, id)) availability[id] = { availableSince: now };
          const added = authorizedProductIds(merged).filter(id => !before.has(id)).length;
          if (target) {
            const version = Number.isSafeInteger(existing.scopeVersion) ? existing.scopeVersion : 0;
            tx.update(db.collection('api_keys').doc(target.id), { ...merged, scopeVersion: version + 1, productAvailability: availability,
              ...(plan === 'pro' && !normalizeSegment(existing.segment) ? { segment } : {}) });
            out.push({ segment: plan === 'pro' ? segment : null, keyId: target.id, name: existing.name || '', created: false, added, total });
            continue;
          }
          const credential = issued[next++];
          const name = plan === 'pro' ? `${segment} API key` : 'Pro Max API key';
          tx.set(db.collection('api_keys').doc(credential.id), {
            ...credential.stored, ...sealed(credential), ...merged, scopeVersion: 0, name, ...(plan === 'pro' ? { segment } : {}),
            userId: actor.uid, userEmail: actor.email || '', status: 'active', createdAt: now, lastUsed: null, requestsUsed: 0,
            plan: entitlement.plan, requestLimit: PAID_MONTHLY_REQUEST_LIMIT, productAvailability: availability,
          });
          out.push({ segment: plan === 'pro' ? segment : null, keyId: credential.id, name, created: true, added, total, key: credential.credential });
        }
        return out;
      });
      for (const result of results) await audit(db, result.created ? 'API Key Generated' : 'API Key Products Updated', actor, result.keyId);
      if (messages) await tell(db, actor, messages.productsAdded(results));
      return res.json({ success: true, results });
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
