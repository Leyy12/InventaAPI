export const PRODUCT_SEGMENTS = Object.freeze(['Grocery', 'Pharmacy', 'Hardware']);

const SEGMENT_ALIASES = new Map([
  ['grocery', 'Grocery'],
  ['groceries', 'Grocery'],
  ['food', 'Grocery'],
  ['pharmacy', 'Pharmacy'],
  ['pharmaceutical', 'Pharmacy'],
  ['drug', 'Pharmacy'],
  ['medicine', 'Pharmacy'],
  ['hardware', 'Hardware'],
  ['tool', 'Hardware'],
  ['tools', 'Hardware'],
]);

const NEGATIVE_STATUSES = new Set([
  'archived', 'deleted', 'disabled', 'inactive', 'pending', 'rejected',
  'retired', 'unapproved', 'unpublished', 'draft',
]);
const POSITIVE_STATUSES = new Set(['active', 'approved', 'current', 'published']);
const STATUS_FIELDS = ['status', 'publicationStatus', 'publication_status', 'state'];
const PUBLICATION_BOOLEAN_FIELDS = ['is_active', 'isActive', 'active', 'published', 'is_published', 'isPublished'];
const ARCHIVE_BOOLEAN_FIELDS = ['archived', 'is_archived', 'isArchived'];
const PLACEHOLDER_SKUS = new Set([
  '-', 'n/a', 'na', 'none', 'null', 'undefined', 'unknown', 'no sku', 'not applicable',
]);
const VARIANT_TEXT_FIELDS = [
  'flavor', 'size', 'dosage', 'form', 'specs', 'dimensions', 'value',
  'variantName', 'sku', 'expirationDate', 'image_url',
];

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeDisplayText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export function comparisonText(value) {
  return (normalizeDisplayText(value) || '').toLocaleLowerCase('en-US');
}

export function normalizeSku(value) {
  const display = normalizeDisplayText(value);
  if (!display || PLACEHOLDER_SKUS.has(display.toLocaleLowerCase('en-US'))) return null;
  return display.toLocaleUpperCase('en-US');
}

export function normalizeSegment(value) {
  const normalized = comparisonText(value);
  return normalized ? SEGMENT_ALIASES.get(normalized) || null : null;
}

export function normalizeCategory(value) {
  return normalizeDisplayText(value);
}

function firstText(...values) {
  for (const value of values) {
    const normalized = normalizeDisplayText(value);
    if (normalized) return normalized;
  }
  return null;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/,/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function clonePlainObject(value) {
  return plainObject(value) ? { ...value } : {};
}

function normalizeVariant(value) {
  if (!plainObject(value)) return null;
  const variant = {};
  for (const field of VARIANT_TEXT_FIELDS) {
    const normalized = firstText(value[field]);
    if (normalized) variant[field] = normalized;
  }
  const price = optionalNumber(value.price);
  if (price !== null) variant.price = price;
  return Object.keys(variant).length ? variant : null;
}

function stableComparisonValue(value, depth = 0) {
  if (depth > 5) return '"[depth-limit]"';
  if (Array.isArray(value)) {
    return `[${value.map(item => stableComparisonValue(item, depth + 1)).sort().join(',')}]`;
  }
  if (plainObject(value)) {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(comparisonText(key))}:${stableComparisonValue(value[key], depth + 1)}`).join(',')}}`;
  }
  if (typeof value === 'string') return JSON.stringify(comparisonText(value));
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return JSON.stringify(value);
  return '""';
}

function normalizedStatusEntries(product) {
  const entries = [];
  for (const field of STATUS_FIELDS) {
    if (!hasOwn(product, field)) continue;
    const value = comparisonText(product[field]);
    entries.push({ field, value });
  }
  return entries;
}

/**
 * Publication is fail-closed. Any explicit negative or malformed publication
 * signal wins over a positive signal. A document with no recognized positive
 * signal is not public.
 */
export function evaluateProductVisibility(product) {
  if (!plainObject(product)) return { visible: false, reason: 'invalid_product' };

  for (const field of ARCHIVE_BOOLEAN_FIELDS) {
    if (!hasOwn(product, field)) continue;
    if (typeof product[field] !== 'boolean') return { visible: false, reason: `invalid_${field}` };
    if (product[field]) return { visible: false, reason: 'archived' };
  }

  const statuses = normalizedStatusEntries(product);
  for (const { field, value } of statuses) {
    if (!value || (!NEGATIVE_STATUSES.has(value) && !POSITIVE_STATUSES.has(value))) {
      return { visible: false, reason: `unknown_${field}` };
    }
    if (NEGATIVE_STATUSES.has(value)) return { visible: false, reason: value };
  }

  let positiveBoolean = false;
  for (const field of PUBLICATION_BOOLEAN_FIELDS) {
    if (!hasOwn(product, field)) continue;
    if (typeof product[field] !== 'boolean') return { visible: false, reason: `invalid_${field}` };
    if (product[field] === false) return { visible: false, reason: `${field}_false` };
    positiveBoolean = true;
  }

  if (statuses.some(({ value }) => POSITIVE_STATUSES.has(value))) {
    return { visible: true, reason: 'positive_status' };
  }
  if (positiveBoolean) return { visible: true, reason: 'positive_flag' };
  return { visible: false, reason: 'no_publication_signal' };
}

function lowestPricedVariant(variants) {
  if (!variants.length) return null;
  return variants.reduce((best, candidate) => {
    if (!best) return candidate;
    const bestPrice = optionalNumber(best.price);
    const candidatePrice = optionalNumber(candidate.price);
    if (candidatePrice === null) return best;
    if (bestPrice === null || candidatePrice < bestPrice) return candidate;
    return best;
  }, null);
}

function identityKeysFromCanonical(product) {
  const skus = new Set();
  const rootSku = normalizeSku(product.sku);
  if (rootSku) skus.add(rootSku);
  for (const variant of product.variants || []) {
    const sku = normalizeSku(variant.sku);
    if (sku) skus.add(sku);
  }
  if (skus.size) {
    return [...skus].sort().map(sku => `sku:${sku}`);
  }

  const name = comparisonText(product.name);
  if (!name) return [];
  const variantTokens = new Set();
  for (const variant of product.variants || []) {
    for (const field of ['flavor', 'size', 'dosage', 'form', 'specs', 'dimensions', 'value', 'variantName']) {
      const value = comparisonText(variant[field]);
      if (value) variantTokens.add(`${comparisonText(field)}:${value}`);
    }
  }
  for (const variation of product.variations || []) {
    const type = comparisonText(variation.type || variation.name || 'variant');
    const options = Array.isArray(variation.options) ? variation.options : [];
    if (options.length) {
      for (const option of options) {
        const value = comparisonText(option);
        if (value) variantTokens.add(`${type}:${value}`);
      }
    } else {
      variantTokens.add(`legacy:${stableComparisonValue(variation)}`);
    }
  }
  const fallback = {
    segment: comparisonText(product.segment),
    category: comparisonText(product.category),
    brand: comparisonText(product.brand),
    name,
    size: variantTokens.size ? '' : comparisonText(product.size),
    capacity: comparisonText(product.capacity),
    variants: [...variantTokens].sort(),
  };
  return [`fallback:${JSON.stringify(fallback)}`];
}

/**
 * Projects current `variants[]` products and legacy root-field/`variations[]`
 * products into one non-destructive representation. It never writes or mutates
 * the source document.
 */
export function projectProduct(source, documentId = null) {
  if (!plainObject(source)) return null;
  const attributes = clonePlainObject(source.attributes);
  const rootSku = firstText(source.sku, source.barcode, source.productCode, source.product_code);
  const rootPrice = optionalNumber(source.price ?? attributes.price);
  const rootSize = firstText(source.size, attributes.size);
  const rootExpiration = firstText(source.expirationDate, source.expiration_date);
  const storedVariantPayloads = Array.isArray(source.variants)
    ? source.variants.filter(plainObject).map(variant => ({ ...variant }))
    : [];
  const variants = storedVariantPayloads.map(normalizeVariant).filter(Boolean);
  let variantPayloads = storedVariantPayloads;

  if (!variants.length && (rootSku || rootPrice !== null || rootSize || rootExpiration)) {
    const base = {};
    if (rootSku) base.sku = rootSku;
    if (rootPrice !== null) base.price = rootPrice;
    if (rootSize) base.size = rootSize;
    if (rootExpiration) base.expirationDate = rootExpiration;
    const flavor = firstText(source.flavor, source.variant, attributes.flavor, attributes.variant);
    if (flavor) base.flavor = flavor;
    variants.push(base);
    if (!storedVariantPayloads.length) variantPayloads = [{ ...base }];
  }

  const baseVariant = lowestPricedVariant(variants);
  let visibility = evaluateProductVisibility(source);
  const category = normalizeCategory(firstText(
    source.category, source.productCategory, source.product_category, source.subcategory, source.sub_category,
  ));
  const segment = normalizeSegment(firstText(
    source.segment, source.businessSegment, source.business_segment, source.businessType,
  ));
  const specifications = clonePlainObject(source.specifications);
  if (source.color != null && specifications.color == null) specifications.color = source.color;
  if (source.weight != null && specifications.weight == null) specifications.weight = source.weight;
  if (source.uom != null && specifications.unit == null) specifications.unit = source.uom;

  const name = firstText(source.name, source.product, source.productName, source.product_name);
  if (visibility.visible && !name) visibility = { visible: false, reason: 'missing_name' };
  else if (visibility.visible && !category) visibility = { visible: false, reason: 'missing_category' };
  else if (visibility.visible && !segment) visibility = { visible: false, reason: 'unsupported_segment' };

  const canonical = {
    id: documentId || firstText(source.id),
    name,
    brand: firstText(source.brand, attributes.brand),
    // Preserve the display value in API projections; identity normalization is
    // applied separately by identityKeysFromCanonical().
    sku: firstText(rootSku, baseVariant?.sku),
    description: firstText(source.description) || '',
    category,
    categoryKey: comparisonText(category),
    segment,
    price: baseVariant && optionalNumber(baseVariant.price) !== null
      ? optionalNumber(baseVariant.price)
      : rootPrice,
    size: firstText(baseVariant?.size, rootSize),
    capacity: firstText(source.capacity, attributes.capacity),
    image_url: hasOwn(source, 'image_url')
      ? source.image_url || ''
      : (!storedVariantPayloads.length ? firstText(source.image) || '' : ''),
    metadata: source.metadata || {},
    specifications,
    tags: source.tags || [],
    variants,
    // Current stored variants are preserved separately for the public DaaS
    // payload. `variants` above remains the normalized internal projection.
    variantPayloads,
    variations: Array.isArray(source.variations)
      ? source.variations.filter(item => plainObject(item)).map(item => ({ ...item }))
      : [],
    expirationDate: firstText(baseVariant?.expirationDate, rootExpiration),
    visibility,
  };
  canonical.identityKeys = identityKeysFromCanonical(canonical);
  canonical.identity = canonical.identityKeys[0] || null;
  return canonical;
}

export function productIdentityKeys(product) {
  const canonical = projectProduct(product, product?.id);
  return canonical ? canonical.identityKeys : [];
}

export function productIdentity(product) {
  return productIdentityKeys(product)[0] || null;
}
