import { productIdentityKeys, projectProduct, normalizeSku, comparisonText } from './product-contract.js';
import { brandNameKey, identityId, plainObject, reservationIntegrityProblems, strictPrice } from './catalog-contract.js';

// Per-product findings that depend only on that product's data. `facts` (optional) is a
// WeakMap keyed by the data object; a caller that re-audits the same unchanged objects
// many times (one import request) passes one so each product is examined once.
function productFacts(data, facts) {
  const known = facts?.get(data);
  if (known) return known;
  const kinds = [];
  const canonical = projectProduct(data);
  if (!canonical.name || !canonical.category || !canonical.segment) kinds.push('MISSING_IDENTITY_FIELDS');
  if (data.variants !== undefined && (!Array.isArray(data.variants) || data.variants.some(v => !plainObject(v)))) kinds.push('MALFORMED_VARIANTS');
  if (data.variations !== undefined && (!Array.isArray(data.variations) || data.variations.some(v => !plainObject(v)))) kinds.push('AMBIGUOUS_VARIANTS');
  const variantKeys = new Set();
  for (const variant of canonical.variants) {
    const key = normalizeSku(variant.sku) || JSON.stringify(['flavor', 'size', 'dosage', 'form', 'specs', 'dimensions', 'value', 'variantName']
      .map(field => comparisonText(variant[field])));
    if (variantKeys.has(key)) kinds.push('AMBIGUOUS_VARIANTS');
    variantKeys.add(key);
  }
  // Missing/invalid prices are reported without inventing a price for a legacy record.
  const prices = Array.isArray(data.variants) && data.variants.length ? data.variants.map(v => v?.price) : [data.price ?? data.attributes?.price];
  for (const price of prices) { try { strictPrice(price); } catch { kinds.push('INVALID_OR_MISSING_PRICE'); break; } }
  const keys = productIdentityKeys(data);
  if (!keys.length) kinds.push('MISSING_IDENTITY');
  const result = { kinds, keys, group: brandNameKey(data) };
  facts?.set(data, result);
  return result;
}
export const catalogFacts = (data, facts) => productFacts(data, facts);

// Plain local/exported {id,data} records only. No SDK, configuration or I/O.
export function auditCatalog(records, reservations = [], { deriveReservationId = identityId, facts } = {}) {
  const problems = [], owners = new Map(), groups = new Map(), ids = new Set(), keysById = new Map();
  for (const record of records) {
    const id = record?.id, data = record?.data;
    if (typeof id !== 'string' || !id || id.includes('/') || ids.has(id) || !plainObject(data)) {
      problems.push({ id: typeof id === 'string' ? id : null, kind: 'MALFORMED_PRODUCT' }); continue;
    }
    ids.add(id);
    const { kinds, keys, group } = productFacts(data, facts);
    for (const kind of kinds) problems.push({ id, kind });
    keysById.set(id, new Set(keys));
    for (const key of keys) { if (!owners.has(key)) owners.set(key, []); owners.get(key).push(id); }
    if (group) { if (!groups.has(group)) groups.set(group, []); groups.get(group).push(id); }
  }
  const collisions = [...owners].filter(([, list]) => list.length > 1).map(([identity, productIds]) => ({ identity, productIds }));
  // Include every distinct identity, even identities with duplicate product owners.
  // Canonical ownership collisions and reservation-ID collisions are separate faults.
  const allBindings = [...owners].map(([identity, [productId]]) =>
    ({ id: deriveReservationId(identity), identity, productId, state: 'bound', version: 1 }));
  problems.push(...reservationIntegrityProblems(allBindings, reservations, deriveReservationId));
  const bindings = allBindings.filter(binding => owners.get(binding.identity).length === 1);
  const possibleDuplicates = [...groups].flatMap(([brandName, list]) => {
    const distinct = new Set();
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) {
      const a = list[i], b = list[j];
      if (![...keysById.get(b)].some(key => keysById.get(a).has(key))) { distinct.add(a); distinct.add(b); }
    }
    return distinct.size ? [{ brandName, productIds: [...distinct] }] : [];
  });
  return { ok: problems.length === 0 && collisions.length === 0, products: records.length,
    uniqueIdentities: bindings.length, collisions, problems, possibleDuplicates,
    // Never emit an executable backfill plan when any historical ambiguity remains.
    reservations: problems.length || collisions.length ? [] : bindings };
}
