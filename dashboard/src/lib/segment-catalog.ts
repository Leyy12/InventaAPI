import { normalizeSegment } from '../../../services/product-contract.js';
import type { Product } from './firebase/products-service';

export type CatalogResult = { products: Product[]; total: number };
export type CatalogSource = CatalogResult & { segment: string; status: 'loading' | 'ready' | 'error' };
export type CatalogPage = { products: Product[]; availability: { segment: string | null; total: number };
  pagination: { total: number; offset: number; limit: number; returned: number } };
export type CatalogPresentation = 'loading' | 'error' | 'empty-segment' | 'empty-search' | 'products';

// Keep transport/schema failures distinct from verified empty results.
export function catalogPresentationState(source: CatalogSource | null, filteredCount: number,
  searchQuery: string): CatalogPresentation {
  if (!source || source.status === 'loading') return 'loading';
  if (source.status === 'error') return 'error';
  if (source.total === 0) return 'empty-segment';
  if (searchQuery.trim() && filteredCount === 0) return 'empty-search';
  return 'products';
}

// Assemble every page of this segment, not the full database. Reject mixed
// pages/counts (e.g. an approval during pagination); the refresh retries safely.
export async function loadSegmentCatalog(read: (offset: number, signal: AbortSignal) => Promise<CatalogPage>,
  segment: string, signal: AbortSignal): Promise<CatalogResult> {
  if (segment !== 'All' && normalizeSegment(segment) !== segment) throw new Error('Invalid business segment.');
  const products = new Map<string, Product>();
  let offset = 0, total: number | undefined;
  do {
    signal.throwIfAborted();
    const page = await read(offset, signal);
    signal.throwIfAborted();
    const expectedSegment = segment === 'All' ? null : segment;
    if (!page || !Array.isArray(page.products) || page.availability?.segment !== expectedSegment
      || !Number.isSafeInteger(page.availability.total) || page.availability.total < 0
      || page.pagination?.total !== page.availability.total || page.pagination.offset !== offset
      || !Number.isSafeInteger(page.pagination.limit) || page.pagination.limit < 1 || page.pagination.limit > 500
      || page.pagination.returned !== page.products.length || page.products.length > page.pagination.limit
      || (total !== undefined && total !== page.availability.total)) throw new Error('Catalog totals could not be verified.');
    total = page.availability.total;
    for (const product of page.products) {
      if (!product || typeof product.id !== 'string' || !product.id || products.has(product.id)
        || normalizeSegment(product.segment) !== product.segment || (expectedSegment && product.segment !== expectedSegment)) {
        throw new Error('Catalog scope could not be verified.');
      }
      products.set(product.id, product);
    }
    offset += page.products.length;
    if (offset > total || (offset < total && page.products.length === 0)) throw new Error('Incomplete catalog.');
  } while (offset < total);
  return { products: [...products.values()], total };
}

export function searchCatalog(products: Product[], search: string) {
  const query = search.trim().toLowerCase();
  return query ? products.filter(product => [product.name, product.description, product.sku]
    .some(value => value?.toLowerCase().includes(query))) : products;
}

// Label/count reflects what Select All actually adds, including the Trial cap.
export function catalogSelectableIds(products: Product[], selected: Set<string>,
  trial: { included: Set<string>; remaining: number; allowed: boolean } | null) {
  if (trial && !trial.allowed) return [];
  const candidates = products.map(product => product.id!).filter(id => !selected.has(id) && !trial?.included.has(id));
  return trial ? candidates.slice(0, Math.max(0, trial.remaining - selected.size)) : candidates;
}

// Existing generation + AbortController pattern: publish grid/count atomically,
// never let an obsolete segment/refresh/unmounted request publish state.
export function createCatalogRefresh({ segment, read, onState, schedule = setTimeout, cancel = clearTimeout }: {
  segment: string; read: (signal: AbortSignal) => Promise<CatalogResult>; onState: (source: CatalogSource) => void;
  schedule?: typeof setTimeout; cancel?: typeof clearTimeout;
}) {
  let stopped = false, generation = 0;
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  function refresh() {
    if (stopped) return;
    const request = ++generation;
    controller?.abort();
    if (timer !== undefined) cancel(timer);
    const active = new AbortController(); controller = active;
    onState({ segment, status: 'loading', products: [], total: 0 });
    const fail = () => {
      if (stopped || generation !== request) return;
      generation++; active.abort();
      if (timer !== undefined) cancel(timer);
      onState({ segment, status: 'error', products: [], total: 0 });
      timer = schedule(refresh, 60000);
    };
    timer = schedule(fail, 15000);
    void Promise.resolve().then(() => { if (!stopped && generation === request) return read(active.signal); }).then(result => {
      if (stopped || generation !== request || !result) return;
      if (timer !== undefined) cancel(timer);
      onState({ ...result, segment, status: 'ready' });
      timer = schedule(refresh, 60000);
    }, fail);
  }
  return { refresh, stop() { stopped = true; generation++; controller?.abort(); if (timer !== undefined) cancel(timer); } };
}
