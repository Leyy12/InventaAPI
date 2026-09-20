import { accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { evaluateProductVisibility, productIdentityKeys } from './product-contract.js';
import { normalizeProductImageUrl } from './product-submission-contract.js';
import { catalogError, identityId, possibleDuplicates, reservationIntegrityError, reservationIntegrityProblems, validateCatalogProduct } from './catalog-contract.js';
import { auditCatalog } from './catalog-audit.js';

export async function requireCatalogAdmin(tx, db, uid) {
  const account = (await tx.get(db.collection('users').doc(uid))).data();
  if (!account || accountBlocked(account) || String(account.role || '').toLowerCase() !== 'admin') {
    throw catalogError(403, 'Admin access required.');
  }
}
export async function readCatalog(tx, db) {
  const snapshot = await tx.get(db.collection('products').limit(5001));
  if (snapshot.docs.length > 5000) throw catalogError(503, 'Catalog exceeds safe scan limit; operator migration required.');
  return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
}

// Read/validate first; returned apply closure stages writes only after caller's other reads.
// This enables submission finalization and import receipts in the SAME transaction.
export async function prepareCatalogWrite({ tx, db, uid, action, productId, input = {}, expectedRevision, at, deriveReservationId = identityId }) {
  await requireCatalogAdmin(tx, db, uid);
  if (typeof productId !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/u.test(productId)) throw catalogError(400, 'Invalid product ID.');
  if (!['create', 'edit', 'archive', 'restore', 'delete'].includes(action)) throw catalogError(400, 'Invalid catalog action.');
  const controlRef = db.collection('catalog_control').doc('writer');
  const control = (await tx.get(controlRef)).data();
  if (control?.frozen) throw catalogError(409, 'Catalog is frozen for operator maintenance.');
  const ref = db.collection('products').doc(productId);
  const previous = (await tx.get(ref)).data();
  if (action === 'create' && previous) throw catalogError(409, 'Product already exists.');
  if (action !== 'create' && !previous) throw catalogError(404, 'Product not found.');
  if (action !== 'create' && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
    || expectedRevision !== (previous.catalogRevision ?? 0))) throw catalogError(409, 'Product changed; reload before editing.');
  const records = await readCatalog(tx, db);
  const audit = auditCatalog(records, [], { deriveReservationId });
  const integrity = audit.problems.filter(problem => problem.kind.startsWith('RESERVATION_'));
  if (integrity.length) throw reservationIntegrityError(integrity);
  // Existing malformed catalogs/collisions require explicit offline operator resolution.
  if (!audit.ok) throw catalogError(409, 'Catalog audit required: historical collision or malformed product.');
  const payload = ['create', 'edit'].includes(action) ? validateCatalogProduct(input, previous) : {};
  let product = { ...previous, ...payload };
  if (action === 'archive' || action === 'restore') {
    product = { ...product, status: action === 'archive' ? 'Archived' : 'Active', is_active: action === 'restore' };
  }
  if ('image' in product && 'image_url' in payload) product.image = '';
  if (action !== 'delete') {
    try {
      normalizeProductImageUrl(Object.hasOwn(product, 'image_url') ? product.image_url : product.image ?? '');
      for (const variant of product.variants || []) if (variant.image_url !== undefined) normalizeProductImageUrl(variant.image_url);
    } catch { throw catalogError(400, 'Invalid product image URL; correct it before changing publication state.'); }
  }
  // Do not silently clear contradictory legacy publication flags. A restore or
  // Active edit must really be public under the unchanged Phase 1 contract.
  if (action !== 'delete' && product.status === 'Active' && !evaluateProductVisibility(product).visible) {
    throw catalogError(409, 'Conflicting legacy publication flags; operator resolution required before activation.');
  }
  const oldKeys = previous ? productIdentityKeys(previous) : [];
  const newKeys = action === 'delete' ? [] : productIdentityKeys(product);
  if (records.some(record => record.id !== productId && productIdentityKeys(record.data).some(key => newKeys.includes(key)))) {
    throw catalogError(409, 'Canonical catalog conflict; no product was overwritten.');
  }
  // Check the complete old/new union AND the existing catalog before any write.
  // This also covers unbackfilled products and two different keys in one operation.
  const requested = [...new Set([...oldKeys, ...newKeys])].map(identity =>
    ({ id: deriveReservationId(identity), identity, productId, state: 'bound' }));
  const mappingProblems = reservationIntegrityProblems([...audit.reservations, ...requested], [], deriveReservationId);
  if (mappingProblems.length) throw reservationIntegrityError(mappingProblems);
  // Check candidate ambiguity too (e.g. repeated SKUs inside a variant array).
  if (action !== 'delete' && !auditCatalog([{ id: productId, data: product }]).ok) throw catalogError(400, 'Product has ambiguous or malformed variants.');
  const claims = [];
  for (const binding of requested) {
    const key = binding.identity;
    const claim = db.collection('product_submission_identity').doc(binding.id);
    const existing = (await tx.get(claim)).data();
    const problems = reservationIntegrityProblems([binding], existing === undefined ? [] : [{ id: binding.id, data: existing }], deriveReservationId);
    if (problems.length) throw reservationIntegrityError(problems);
    claims.push({ ref: claim, data: { version: 1, identity: key, productId,
      state: newKeys.includes(key) ? 'bound' : action === 'delete' ? 'deleted' : 'retired', updatedAt: at } });
  }
  product = { ...product, createdAt: previous?.createdAt ?? at, updatedAt: at, catalogRevision: (previous?.catalogRevision ?? 0) + 1 };
  const warnings = action === 'delete' ? [] : possibleDuplicates(product, records, productId);
  return { product: { ...product, id: productId }, possibleDuplicates: warnings,
    apply() {
      if (action === 'delete') tx.delete(ref); else tx.set(ref, product);
      for (const claim of claims) tx.set(claim.ref, claim.data);
      // Shared serializing fence also protects legacy identities not yet backfilled.
      tx.set(controlRef, { ...control, version: 1, revision: (control?.revision ?? 0) + 1, updatedAt: at });
    } };
}

// Dependency-injected operator tooling: caller must hold a verified write freeze.
// No production CLI is supplied; offline plan and emulator/memory verification only.
export async function backfillCatalogReservations(db, at, { deriveReservationId = identityId } = {}) {
  return db.runTransaction(async tx => {
    const controlRef = db.collection('catalog_control').doc('writer');
    const control = (await tx.get(controlRef)).data();
    if (control?.frozen !== true) throw catalogError(409, 'Write freeze required for backfill.');
    const records = await readCatalog(tx, db);
    const existing = await tx.get(db.collection('product_submission_identity'));
    const reservations = existing.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    const audit = auditCatalog(records, reservations, { deriveReservationId });
    const integrity = audit.problems.filter(problem => problem.kind.startsWith('RESERVATION_'));
    if (integrity.length) throw reservationIntegrityError(integrity);
    if (!audit.ok) throw catalogError(409, 'Resolve catalog and reservation conflicts before backfill.');
    assertBackfillReservationPlan(records, audit.reservations, reservations, deriveReservationId);
    // Small catalogs only in one atomic transaction. Larger plans require a separately
    // reviewed chunked migration during freeze, never a partial ready signal.
    if (audit.reservations.length > 400) throw catalogError(409, 'Backfill exceeds single-batch limit; approved chunked migration required.');
    for (const binding of audit.reservations) {
      const { id, ...data } = binding;
      tx.set(db.collection('product_submission_identity').doc(id), { ...data, updatedAt: at });
    }
    tx.set(controlRef, { ...control, version: 1, auditCompletedAt: at, revision: (control.revision ?? 0) + 1 });
    return { reserved: audit.reservations.length, frozen: true };
  });
}

// Apply-layer defense: independently prove plan coverage/ownership and ID/evidence
// integrity, not merely a caller's audit.ok. Runs before any tx.set, including completion.
export function assertBackfillReservationPlan(records, plan, reservations, deriveReservationId = identityId) {
  const expected = new Map(), seen = new Set();
  for (const record of records) for (const identity of productIdentityKeys(record.data)) {
    if (expected.has(identity)) throw catalogError(409, 'Canonical catalog conflict in backfill plan.');
    expected.set(identity, record.id);
  }
  const problems = reservationIntegrityProblems(plan, reservations, deriveReservationId);
  for (const binding of plan) {
    if (seen.has(binding.identity) || !expected.has(binding.identity) || expected.get(binding.identity) !== binding.productId
      || binding.state !== 'bound' || binding.version !== 1) problems.push({ id: binding.id, kind: 'RESERVATION_PLAN_CONFLICT' });
    seen.add(binding.identity);
  }
  if (seen.size !== expected.size) problems.push({ kind: 'RESERVATION_PLAN_CONFLICT' });
  if (problems.length) throw reservationIntegrityError(problems);
}
