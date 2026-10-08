// Real Products component, synthetic account/catalog only; never external I/O.
import { hooks, load, clock, browser, flush, nodes } from './workspace-refresh/harness.mjs';
import * as catalog from '../../dashboard/src/lib/segment-catalog.ts';
import * as selection from '../../dashboard/src/lib/trial-catalog-selection.ts';
import * as linked from '../../dashboard/src/lib/linked-product-selection.ts';
import * as display from '../../dashboard/src/lib/trial-display.mjs';
import * as segment from '../../services/customer-segment.js';

const stub = () => null;
export const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object'
  ? text(tree.props?.children) : String(tree ?? '');
export async function productsFixture({ trial = true, included = 0, count = 60 } = {}) {
  const h = hooks(), c = clock(), b = browser(), calls = [], keyCalls = [];
  const user = { uid: 'synthetic-products-only' };
  const state = { user, appUser: { plan: trial ? 'Free' : 'Pro', businessSegment: 'Grocery' },
    entitlement: { activeTrial: trial, activePro: !trial, plan: trial ? 'Free' : 'Pro', subscription_status: trial ? 'trial' : 'active' } };
  const products = ['Grocery', 'Hardware', 'Pharmacy'].flatMap(s => Array.from({ length: count }, (_, i) => ({
    id: s.toLowerCase() + '-' + i, name: `${s} ${i % 2 ? 'Rice' : 'Milk'} ${i}`,
    sku: `${s}-SKU-${i}`, description: 'Synthetic catalog fixture only', segment: s,
    variants: [{ flavor: 'a', size: 'each' }, { flavor: 'b', size: 'each' }],
  })));
  const includedIds = Array.from({ length: included }, (_, i) => 'grocery-' + i);
  const evidence = { keys: included ? [{ id: 'fixture-key', scopeVersion: 3, linkedProductIds: includedIds,
    linkedVariantSelections: {}, productIds: includedIds }] : [],
    trialCatalog: { productsIncluded: included, productsAvailable: 50 - included, activeKeys: included ? 1 : 0, expiresAt: null } };
  const Component = load('dashboard/src/app/dashboard/products/page.tsx', 'CustomerCatalogSession', h, {
    '../../../../../functions/entitlement-limits.mjs': { TRIAL_MAX_PRODUCTS: 50 },
    '@/lib/trial-display.mjs': display, '@/lib/trial-catalog-selection': selection,
    '@/lib/account-usage-events': { invalidateAccountUsage: stub },
    '@/lib/api-key-generation': { GENERATION_POLICY: 'fixture policy', generationErrorMessage: stub },
    'lucide-react': new Proxy({}, { get: () => stub }), 'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { useRouter: () => ({ push: stub }) },
    '@/components/product-request/ProductNotFound': { __esModule: true, default: 'fixture-empty-catalog' },
    '../../../../../services/customer-segment.js': segment,
    '@/components/products/AddProductModal': { __esModule: true, default: stub },
    '@/lib/product-image-url': { productImageSource: () => '', showProductImageFallback: stub },
    '@/lib/firebase/auth-context': { useAuth: () => state },
    '@/lib/firebase/products-service': { getBasePrice: () => 1, getBaseSize: () => 'each', hasNearExpiry: () => false },
    '@/lib/linked-product-selection': linked,
    '@/lib/api-keys': { apiKeyRequest: async (_user, path = '', init) => {
      if (init?.method) throw Error('Persisted mutations prohibited in selection fixture');
      keyCalls.push(path); return evidence;
    } },
    '@/lib/segment-catalog': { ...catalog, createCatalogRefresh: options => catalog.createCatalogRefresh({ ...options, schedule: c.schedule, cancel: c.cancel }) },
  }, { ...b, fetch: async (url, init) => {
    if (init?.method) throw Error('Persisted mutations prohibited in selection fixture');
    calls.push(url);
    const chosen = new URL(url).searchParams.get('businessSegment');
    const scoped = products.filter(p => chosen === 'All' || p.segment === chosen);
    return { ok: true, json: async () => ({ products: scoped, availability: { segment: chosen === 'All' ? null : chosen, total: scoped.length },
      pagination: { total: scoped.length, offset: 0, limit: 200, returned: scoped.length } }) };
  } });
  h.mount(Component); await flush();
  const find = predicate => nodes(h.output, predicate)[0];
  const cards = () => nodes(h.output, n => n.props.onClick && n.props.className?.includes('glass-card rounded-xl transition'));
  const button = label => find(n => n.type === 'button' && text(n).trim().startsWith(label));
  const change = async (id, value) => { find(n => n.props.id === id).props.onChange({ target: { value } }); await flush(); };
  const click = async node => { node.props.onClick({ stopPropagation: stub }); await flush(); };
  return { h, calls, keyCalls, state, evidence, cards, button, find, click,
    card: id => cards().find(n => n.key === id),
    filter: value => change('selection-filter', value), search: value => change('product-search', value),
    segment: value => change('category-filter', value), stop: () => h.stop() };
}
