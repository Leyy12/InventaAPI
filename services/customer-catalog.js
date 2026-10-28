import { normalizeSegment, projectProduct, comparisonText, withoutPrices } from './product-contract.js';

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
  const limit = integer(query.limit, null, 1000);
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
    // A stored `id` must never replace the actual stored document identity.
    unique.set(document.id, withoutPrices({ ...value, id: document.id, segment: canonical.segment }));
  }
  const available = [...unique.values()].sort((a, b) =>
    comparisonText(a.name).localeCompare(comparisonText(b.name), 'en') || a.id.localeCompare(b.id, 'en'));
  const matching = search ? available.filter(product => [product.name, product.description, product.sku]
    .some(value => comparisonText(value).includes(search))) : available;
  const products = matching.slice(offset, limit === null ? undefined : offset + limit);
  return { products, availability: { segment, total: available.length },
    pagination: { total: matching.length, offset, limit: limit ?? matching.length, returned: products.length } };
}

// `cacheMs` (off by default): a page request reuses the catalog read by the previous
// page of the same segment for that long, while the catalog writer's revision is
// unchanged. A client loads a segment in several pages; without this each page read
// every product again (5,000+), and the full load ran out of time.
export function createCustomerCatalogHandler({ getDb, cacheMs = 0, now = () => Date.now() }) {
  const cache = new Map();
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const filter = catalogQuery(req.query);
      const db = getDb();
      const key = filter.segment ?? '*';
      let revision = null, docs = null;
      if (cacheMs > 0) {
        revision = (await db.collection('catalog_control').doc('writer').get()).data()?.revision ?? 0;
        const hit = cache.get(key);
        if (hit && hit.revision === revision && now() - hit.at < cacheMs) docs = hit.docs;
      }
      if (!docs) {
        let query = db.collection('products');
        // Canonical `segment` is already persisted by the catalog writer and
        // submission approval. Single-field equality needs no composite index.
        if (filter.segment) query = query.where('segment', '==', filter.segment);
        docs = (await query.get()).docs;
        if (cacheMs > 0) cache.set(key, { revision, docs, at: now() });
      }
      return res.json(catalogResult(docs, filter));
    } catch (error) {
      return res.status(error.status === 400 ? 400 : 500).json({
        error: error.status === 400 ? error.message : 'Failed to fetch products',
      });
    }
  };
}
