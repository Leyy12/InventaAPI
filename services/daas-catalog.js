import {
  comparisonText,
  normalizeSegment,
  projectProduct,
} from './product-contract.js';

const FREE_PLANS = new Set(['free', 'starter']);

function legacyProductDocumentId(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.id !== 'string') return null;
  const id = value.id.trim();
  if (!id || id === '.' || id === '..' || id.includes('/') || /[\u0000-\u001f\u007f]/u.test(id)) return null;
  return id;
}

export function authorizedProductIds(apiKeyData = {}) {
  const fullProducts = Array.isArray(apiKeyData.linkedProductIds) ? apiKeyData.linkedProductIds : [];
  const legacyProducts = Array.isArray(apiKeyData.linkedProducts)
    ? apiKeyData.linkedProducts.map(legacyProductDocumentId).filter(Boolean)
    : [];
  const partialProducts = apiKeyData.linkedVariantSelections && typeof apiKeyData.linkedVariantSelections === 'object'
    ? Object.keys(apiKeyData.linkedVariantSelections)
    : [];
  return [...new Set([...fullProducts, ...legacyProducts, ...partialProducts]
    .filter(id => typeof id === 'string' && id.trim())
    .map(id => id.trim()))];
}

function matchesSearch(product, searchQuery) {
  const query = comparisonText(searchQuery);
  if (!query) return true;
  return [
    product.name,
    product.description,
    product.category,
    product.brand,
    product.sku,
    ...(product.identityKeys || []).filter(key => key.startsWith('sku:')).map(key => key.slice(4)),
  ].some(value => comparisonText(value).includes(query));
}

/**
 * Resolves product IDs from the API-key relationship on every call. A legacy
 * linkedProducts entry may contribute only its stored Firestore document ID;
 * all embedded product fields are ignored so an existing key always sees the
 * current eligible product document.
 */
export async function resolveCurrentCatalogProducts({
  apiKeyData,
  loadProductById,
  userData = null,
  searchQuery = '',
}) {
  if (typeof loadProductById !== 'function') {
    throw new TypeError('loadProductById must be a function.');
  }

  const productIds = authorizedProductIds(apiKeyData);
  const loaded = await Promise.all(productIds.map(async id => ({ id, value: await loadProductById(id) })));
  let products = loaded
    .filter(({ value }) => value && typeof value === 'object')
    .map(({ id, value }) => projectProduct(value, id))
    .filter(product => product?.visibility.visible === true);

  const plan = comparisonText(userData?.plan);
  if (FREE_PLANS.has(plan) && userData?.selectedSegment) {
    const selectedSegment = normalizeSegment(userData.selectedSegment);
    products = selectedSegment
      ? products.filter(product => product.segment === selectedSegment)
      : [];
  }

  return {
    productIds,
    products: products.filter(product => matchesSearch(product, searchQuery)),
  };
}

function variantIdentifier(variant) {
  return `${variant.flavor || ''}|${variant.size || ''}`;
}

function lowestPricedVariant(variants) {
  if (!variants.length) return null;
  return variants.reduce((best, candidate) => {
    if (!best) return candidate;
    const bestPrice = typeof best.price === 'number' ? best.price : parseFloat(best.price) || Number.POSITIVE_INFINITY;
    const candidatePrice = typeof candidate.price === 'number'
      ? candidate.price
      : parseFloat(candidate.price) || Number.POSITIVE_INFINITY;
    return candidatePrice < bestPrice ? candidate : best;
  }, null);
}

function basePrice(value) {
  return typeof value === 'number' ? value : parseFloat(value) || null;
}

function availabilityIso(value) {
  if (!value) return null;
  try {
    const resolved = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(resolved.getTime()) ? null : resolved.toISOString();
  } catch {
    return null;
  }
}

export function formatDaaSProduct(product, {
  selectedVariants = null,
  availability = null,
} = {}) {
  const hasPartialSelection = Array.isArray(selectedVariants) && selectedVariants.length > 0;
  const variantPayloads = Array.isArray(product.variantPayloads)
    ? product.variantPayloads
    : product.variants;
  const variants = hasPartialSelection
    ? variantPayloads.filter(variant => selectedVariants.includes(variantIdentifier(variant)))
    : [...variantPayloads];
  const baseVariant = lowestPricedVariant(variants);

  return {
    id: product.id,
    sku: baseVariant?.sku || null,
    name: product.name,
    description: product.description || '',
    category: product.category,
    segment: product.segment,
    price: basePrice(baseVariant?.price),
    size: baseVariant?.size || null,
    image_url: product.image_url || '',
    metadata: product.metadata || {},
    tags: product.tags || [],
    variants,
    expirationDate: baseVariant?.expirationDate || null,
    availableToConsumerSince: availabilityIso(availability?.availableSince),
  };
}
