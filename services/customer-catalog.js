import { normalizeSegment, projectProduct, comparisonText } from './product-contract.js';

const badQuery = message => Object.assign(new Error(message), { status: 400 });
function integer(value, fallback, maximum) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw badQuery('Invalid catalog pagination.');
  }
  return Number(value);
}

export function catalogQuery(query = {}) {
  const supplied = query.businessSegment ?? query.segment;
  const segment = supplied === undefined || supplied === 'All' ? null : normalizeSegment(supplied);
  if (supplied !== undefined && supplied !== 'All' && !segment) throw badQuery('Invalid business segment.');
  if (query.businessSegment !== undefined && query.segment !== undefined
    && normalizeSegment(query.segment) !== segment) throw badQuery('Conflicting business segments.');
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 200)) throw badQuery('Invalid catalog search.');
  const limit = integer(query.limit, null, 500);
  if (limit === 0) throw badQuery('Invalid catalog pagination.');
  return { segment, search: comparisonText(query.search), limit, offset: integer(query.offset, 0, Number.MAX_SAFE_INTEGER) };
}

// Public discovery, not entitlement authorization. Protected DaaS/key handlers
// continue to enforce authoritative account segment and plan independently.
export function catalogResult(documents, { segment, search = '', limit = null, offset = 0 }) {
  const unique = new Map();
  for (const document of documents) {
    const value = document.data();
    const canonical = projectProduct(value, document.id);
    if (!canonical?.visibility.visible || (segment && canonical.segment !== segment)) continue;
    // A stored `id` must never replace the actual Firestore document identity.
    unique.set(document.id, { ...value, id: document.id, segment: canonical.segment });
  }
  const available = [...unique.values()].sort((a, b) =>
    comparisonText(a.name).localeCompare(comparisonText(b.name), 'en') || a.id.localeCompare(b.id, 'en'));
  const matching = search ? available.filter(product => [product.name, product.description, product.sku]
    .some(value => comparisonText(value).includes(search))) : available;
  const products = matching.slice(offset, limit === null ? undefined : offset + limit);
  return { products, availability: { segment, total: available.length },
    pagination: { total: matching.length, offset, limit: limit ?? matching.length, returned: products.length } };
}

export function createCustomerCatalogHandler({ getDb }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const filter = catalogQuery(req.query);
      let query = getDb().collection('products');
      // Canonical `segment` is already persisted by the catalog writer and
      // submission approval. Single-field equality needs no composite index.
      if (filter.segment) query = query.where('segment', '==', filter.segment);
      const snapshot = await query.get();
      return res.json(catalogResult(snapshot.docs, filter));
    } catch (error) {
      return res.status(error.status === 400 ? 400 : 500).json({
        error: error.status === 400 ? error.message : 'Failed to fetch products',
      });
    }
  };
}
