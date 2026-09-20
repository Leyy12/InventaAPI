import { createHash } from 'node:crypto';
import { comparisonText, normalizeDisplayText, normalizeSegment, normalizeSku, productIdentityKeys, projectProduct } from './product-contract.js';
import { normalizeProductImageUrl, submissionError } from './product-submission-contract.js';

export const catalogError = (status, message) => submissionError(status, message);
export const identityId = key => createHash('sha256').update(JSON.stringify(key)).digest('hex');
export const catalogDigest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Internal service/test dependency only. Production always defaults to identityId.
// Evidence is compared byte-for-byte; the document ID is never proof of identity.
function validIdentityEvidence(identity) {
  if (typeof identity !== 'string') return false;
  if (identity.startsWith('sku:')) return !!normalizeSku(identity.slice(4)) && normalizeSku(identity.slice(4)) === identity.slice(4);
  if (!identity.startsWith('fallback:')) return false;
  try {
    const value = JSON.parse(identity.slice(9));
    return plainObject(value) && ['segment', 'category', 'brand', 'name', 'size', 'capacity']
      .every(field => typeof value[field] === 'string') && !!value.name
      && Array.isArray(value.variants) && value.variants.every(token => typeof token === 'string');
  } catch { return false; }
}
export function reservationIntegrityProblems(bindings, reservations = [], deriveReservationId = identityId) {
  const problems = [], identitiesById = new Map(), wantedById = new Map();
  const remember = (id, identity) => {
    if (!validIdentityEvidence(identity) || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/u.test(id)) {
      problems.push({ id, kind: 'RESERVATION_EVIDENCE_CONFLICT' }); return;
    }
    const previous = identitiesById.get(id);
    if (previous !== undefined && previous !== identity) {
      problems.push({ id, kind: 'RESERVATION_ID_COLLISION', identities: [previous, identity] });
    } else identitiesById.set(id, identity);
    if (deriveReservationId(identity) !== id) problems.push({ id, kind: 'RESERVATION_EVIDENCE_CONFLICT', identity });
  };
  for (const binding of bindings) {
    remember(binding.id, binding.identity);
    wantedById.set(binding.id, binding);
  }
  for (const { id, data } of reservations) {
    remember(id, data?.identity);
    const wanted = wantedById.get(id);
    if (!plainObject(data) || typeof data.productId !== 'string' || !data.productId
      || !['bound', 'retired', 'deleted', undefined].includes(data.state)
      || (wanted && (data.identity !== wanted.identity || data.productId !== wanted.productId || (data.state && data.state !== 'bound')))
      || (!wanted && (!data.state || data.state === 'bound'))) {
      problems.push({ id, kind: 'RESERVATION_CONFLICT' });
    }
  }
  return problems;
}
export function reservationIntegrityError(problems) {
  const error = catalogError(409, 'Reservation integrity conflict; operator review required.');
  error.code = problems.some(problem => problem.kind === 'RESERVATION_ID_COLLISION')
    ? 'RESERVATION_ID_COLLISION' : 'RESERVATION_INTEGRITY_CONFLICT';
  // Local operator diagnostics, deliberately not serialized by HTTP handlers.
  error.problems = problems;
  return error;
}
export function onlyFields(value, fields) {
  if (!plainObject(value) || Object.keys(value).some(key => !fields.includes(key))) throw catalogError(400, 'Unsupported request fields.');
}
function text(value, field, maximum, required = false) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw catalogError(400, `Invalid ${field}.`);
  }
  const result = normalizeDisplayText(value) || '';
  if (required && !result) throw catalogError(400, `Missing ${field}.`);
  return result;
}
export function strictPrice(value) {
  if (typeof value === 'string' && /^\d+(?:\.\d+)?$/u.test(value.trim())) value = Number(value.trim());
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e9) {
    throw catalogError(400, 'Price must be a finite non-negative number; missing/malformed prices are invalid.');
  }
  return value;
}
function safePayload(value, depth = 0) {
  if (depth > 8) throw catalogError(400, 'Variant payload is too deeply nested.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(v => safePayload(v, depth + 1)); return; }
  if (plainObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw catalogError(400, 'Unsupported variant key.');
      safePayload(val, depth + 1);
    }
    return;
  }
  throw catalogError(400, 'Invalid variant payload.');
}

// Canonical identity remains exclusively productIdentityKeys from Phase 1.
export function validateCatalogProduct(input, previous = null) {
  onlyFields(input, ['name', 'brand', 'segment', 'category', 'description', 'sku', 'variants', 'image_url', 'status']);
  if (Object.values(input).some(value => value === null || value === undefined)) throw catalogError(400, 'Product fields cannot be null or undefined.');
  const old = previous ? projectProduct(previous) : null;
  const result = {};
  for (const [field, maximum, required] of [['name', 160, true], ['brand', 120, false], ['category', 120, true],
    ['description', 4000, false], ['sku', 120, false]]) {
    // Do not materialize a projected variant SKU as a new root SKU on edits.
    const fallback = field === 'sku' ? (previous?.sku ?? '') : (old?.[field] ?? '');
    result[field] = text(input[field] ?? fallback, field, maximum, required);
  }
  result.segment = normalizeSegment(input.segment ?? old?.segment);
  if (!result.segment) throw catalogError(400, 'Segment must be Grocery, Pharmacy or Hardware.');
  try { result.image_url = normalizeProductImageUrl(input.image_url ?? old?.image_url ?? ''); }
  catch (error) { throw catalogError(400, error.message); }
  result.status = input.status ?? previous?.status ?? 'Active';
  if (!['Active', 'Archived', 'Inactive'].includes(result.status)) throw catalogError(400, 'Invalid product status.');
  result.is_active = result.status === 'Active';
  const variants = input.variants ?? previous?.variants ?? old?.variantPayloads;
  if (!Array.isArray(variants) || !variants.length || variants.length > 50) throw catalogError(400, 'Provide 1–50 priced variants.');
  result.variants = variants.map(variant => {
    if (!plainObject(variant)) throw catalogError(400, 'Invalid variant.');
    safePayload(variant);
    // Preserve arbitrary Phase 1 payload fields and valid existing value types.
    strictPrice(variant.price);
    for (const key of ['flavor', 'size', 'dosage', 'form', 'specs', 'dimensions', 'value', 'variantName', 'sku', 'expirationDate']) {
      if (variant[key] !== undefined) text(variant[key], key, 200);
    }
    if (variant.image_url !== undefined) {
      try { normalizeProductImageUrl(variant.image_url); } catch { throw catalogError(400, 'Invalid variant image URL.'); }
    }
    return structuredClone(variant);
  });
  if (JSON.stringify(result).length > 100000) throw catalogError(400, 'Product payload is too large.');
  const candidate = { ...previous, ...result };
  if (!productIdentityKeys(candidate).length) throw catalogError(400, 'Product has no canonical identity.');
  return result;
}
export function brandNameKey(product) {
  const canonical = projectProduct(product);
  return canonical?.name && canonical.brand
    ? JSON.stringify([comparisonText(canonical.brand), comparisonText(canonical.name)]) : null;
}
export function possibleDuplicates(product, records, excludedId = null) {
  const group = brandNameKey(product), keys = new Set(productIdentityKeys(product));
  return group ? records.filter(record => record.id !== excludedId && brandNameKey(record.data) === group
    && !productIdentityKeys(record.data).some(key => keys.has(key))).map(record => record.id).sort() : [];
}
