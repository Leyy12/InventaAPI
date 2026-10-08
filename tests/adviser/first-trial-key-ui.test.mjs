import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, clock, browser, flush, nodes } from './workspace-refresh/harness.mjs';
import * as catalog from '../../dashboard/src/lib/segment-catalog.ts';
import * as selection from '../../dashboard/src/lib/trial-catalog-selection.ts';
import * as linked from '../../dashboard/src/lib/linked-product-selection.ts';
import * as display from '../../dashboard/src/lib/trial-display.mjs';
import * as segment from '../../services/customer-segment.js';

const stub = () => null;
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object'
  ? text(tree.props?.children) : String(tree ?? '');
const measured = (count = 0, keys = 0) => ({ productsIncluded: count, productsAvailable: 50 - count, activeKeys: keys, expiresAt: '2026-10-12T00:00:00Z' });
const product = (segment, i) => ({ id: segment.toLowerCase() + '-' + i, name: segment + ' synthetic ' + i,
  segment, description: 'Fixture only', variants: [{ flavor: 'a', size: 'each' }, { flavor: 'b', size: 'each' }] });

function fixture(owned, { count = 55, evidence = { keys: [], trialCatalog: measured() }, upgradeRequired = false } = {}) {
  const h = hooks(), c = clock(), b = browser(), calls = [], keyCalls = [], invalidations = [], alerts = [];
  const user = { uid: 'synthetic-only', email: 'fixture@example.invalid', getIdToken: async () => 'synthetic-not-a-credential' };
  const state = { user, appUser: { plan: 'Free', businessSegment: owned }, entitlement: { activeTrial: true,
    subscription_status: upgradeRequired ? 'upgrade_required' : 'trial', plan: 'Free' } };
  const products = ['Hardware', 'Grocery', 'Pharmacy'].flatMap(s => Array.from({ length: count }, (_, i) => product(s, i)));
  let authoritative = evidence;
  const Component = load('dashboard/src/app/dashboard/products/page.tsx', 'CustomerCatalogSession', h, {
    'react-dom': { createPortal: stub },
    '@/components/layout/WorkspaceHeaderSlot': { useWorkspaceHeaderSlot: () => null },
    '../../../../../functions/entitlement-limits.mjs': { TRIAL_MAX_PRODUCTS: 50 },
    '@/lib/trial-display.mjs': display, '@/lib/trial-catalog-selection': selection,
    '@/lib/account-usage-events': { invalidateAccountUsage: uid => invalidations.push(uid) },
    '@/lib/api-key-generation': { GENERATION_POLICY: 'synthetic policy', generationErrorMessage: data => data.error },
    'lucide-react': new Proxy({}, { get: () => stub }), 'next/link': { default: stub },
    'next/navigation': { useRouter: () => ({ push: stub }) },
    '@/components/product-request/ProductNotFound': { default: stub },
    '../../../../../services/customer-segment.js': segment, '@/components/products/AddProductModal': { default: stub },
    '@/lib/product-image-url': { productImageSource: () => '', showProductImageFallback: stub },
    '@/lib/firebase/auth-context': { useAuth: () => state },
    '@/lib/firebase/config': { auth: { currentUser: user } },
    '@/lib/firebase/products-service': { getBasePrice: () => 1, getBaseSize: () => 'each', hasNearExpiry: () => false },
    '@/lib/linked-product-selection': linked,
    '@/lib/api-keys': { apiKeyRequest: async (_user, path = '', init) => {
      keyCalls.push({ path, init });
      if (init?.method === 'PATCH') {
        const body = JSON.parse(init.body);
        authoritative = { keys: [{ ...authoritative.keys[0], ...body, scopeVersion: body.expectedScopeVersion + 1 }],
          trialCatalog: measured(new Set([...body.linkedProductIds, ...Object.keys(body.linkedVariantSelections)]).size, 1) };
      }
      return authoritative;
    } },
    '@/lib/segment-catalog': { ...catalog, createCatalogRefresh: options => catalog.createCatalogRefresh({ ...options, schedule: c.schedule, cancel: c.cancel }) },
  }, { ...b, alert: message => alerts.push(message), fetch: async (url, init) => {
    calls.push({ url, init });
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body);
      authoritative = { keys: [{ id: 'synthetic-key', scopeVersion: 0, ...body }],
        trialCatalog: measured(new Set([...body.linkedProductIds, ...Object.keys(body.linkedVariantSelections)]).size, 1) };
      return { ok: true, json: async () => ({ name: body.keyName, key: 'synthetic-not-a-real-api-key' }) };
    }
    const chosen = new URL(url).searchParams.get('businessSegment');
    assert.equal(chosen, owned);
    const scoped = segment.scopeCustomerProducts(products, state.appUser);
    return { ok: true, json: async () => ({ products: scoped, availability: { segment: owned, total: scoped.length },
      pagination: { total: scoped.length, offset: 0, limit: 200, returned: scoped.length } }) };
  } });
  h.mount(Component);
  const cards = () => nodes(h.output, n => n.props.onClick && n.props.className?.includes('glass-card rounded-xl transition'));
  const button = label => nodes(h.output, n => n.type === 'button' && text(n).trim().startsWith(label))[0];
  const card = id => cards().find(n => n.key === id);
  const search = value => nodes(h.output, n => n.type === 'input' && n.props.placeholder?.includes('Search'))[0].props.onChange({ target: { value } });
  return { h, c, b, calls, keyCalls, invalidations, alerts, cards, card, button, search,
    catalogCalls: () => calls.filter(call => !call.init?.method), evidence: () => authoritative };
}

for (const owned of ['Hardware', 'Grocery', 'Pharmacy']) test(owned + ' fresh Trial: card highlight, summary, modal, full/partial payload and targeted success transition', async () => {
  const f = fixture(owned); await flush();
  try {
    const a = product(owned, 0), b = product(owned, 1);
    assert.equal(f.cards().length, 55);
    assert.ok(f.cards().every(n => n.key.startsWith(owned.toLowerCase())));
    assert.equal(f.card(a.id).props['aria-disabled'], undefined);
    f.card(a.id).props.onClick(); await flush();
    assert.match(f.card(a.id).props.className, /border-2 border-indigo-500/);
    assert.match(text(f.h.output), /1 selected to add/);
    f.card(a.id).props.onClick(); await flush(); // Local pending deselection.
    assert.doesNotMatch(f.card(a.id).props.className, /border-2/);
    f.card(a.id).props.onClick(); await flush();
    const chip = nodes(f.card(b.id), n => n.type === 'button')[0];
    assert.equal(chip.props.disabled, false);
    chip.props.onClick({ stopPropagation: stub }); await flush();
    assert.match(f.card(b.id).props.className, /border-2 border-indigo-500/);
    f.search(a.name); await flush(); f.search(''); await flush();
    assert.match(f.card(a.id).props.className, /border-2/);
    f.button('Generate API Key').props.onClick(); await flush();
    const list = nodes(f.h.output, n => n.props['aria-label'] === 'Selected linked products')[0];
    assert.match(text(list), new RegExp(a.name)); assert.match(text(list), new RegExp(b.name));
    nodes(f.h.output, n => n.type === 'input' && n.props.placeholder?.includes('Production POS'))[0].props.onChange({ target: { value: 'Synthetic first key' } });
    await flush(); await f.button('Generate Key').props.onClick(); await flush();
    const body = JSON.parse(f.calls.find(call => call.init?.method === 'POST').init.body);
    assert.deepEqual(Array.from(body.linkedProductIds), [a.id]);
    assert.deepEqual(body.linkedVariantSelections, { [b.id]: ['a|each'] });
    assert.deepEqual(body.linkedProducts.map(p => p.id), [a.id, b.id]);
    assert.equal(f.evidence().trialCatalog.activeKeys, 1); assert.equal(f.evidence().trialCatalog.productsIncluded, 2);
    assert.equal(f.card(a.id).props['aria-disabled'], true); assert.match(text(f.card(a.id)), /Included/);
    assert.equal(f.button('Add Selected Products').props.disabled, true);
    assert.doesNotMatch(text(f.h.output), /New Product Selections/);
    assert.equal(f.catalogCalls().length, 1); assert.equal(f.keyCalls.length, 2); assert.equal(f.invalidations.length, 1);
    assert.deepEqual(f.alerts, []);
  } finally { f.h.stop(); }
});

test('real first-key Select All caps at 50, rejects 51st, permits pending deselection/clear; idle/focus never refetch', async () => {
  const f = fixture('Hardware'); await flush();
  try {
    f.button('Select All').props.onClick(); await flush();
    assert.equal(f.cards().filter(n => n.props.className.includes('border-2')).length, 50);
    assert.equal(f.card('hardware-50').props['aria-disabled'], true);
    f.card('hardware-50').props.onClick(); await flush();
    assert.match(text(f.button('Generate API Key')), /50\s+products/);
    f.card('hardware-0').props.onClick(); await flush();
    assert.equal(f.card('hardware-50').props['aria-disabled'], undefined);
    f.card('hardware-50').props.onClick(); await flush();
    f.button('Clear New Selections').props.onClick(); await flush();
    assert.equal(f.cards().filter(n => n.props.className.includes('border-2')).length, 0);
    for (let i = 0; i < 10; i++) f.b.cycle();
    await f.c.advance(60000);
    assert.equal(f.catalogCalls().length, 1); assert.equal(f.keyCalls.length, 1);
  } finally { f.h.stop(); }
});

test('real first-key generation retains the canonical zero-product minimum', async () => {
  const f = fixture('Grocery'); await flush();
  try {
    assert.equal(f.button('Generate API Key').props.disabled, false);
    f.button('Generate API Key').props.onClick(); await flush();
    nodes(f.h.output, n => n.type === 'input' && n.props.placeholder?.includes('Production POS'))[0].props.onChange({ target: { value: 'Synthetic empty scope' } });
    await flush(); await f.button('Generate Key').props.onClick(); await flush();
    const body = JSON.parse(f.calls.find(call => call.init?.method === 'POST').init.body);
    assert.deepEqual(body.linkedProductIds, []); assert.deepEqual(body.linkedVariantSelections, {});
    assert.deepEqual(body.linkedProducts, []);
    assert.equal(f.evidence().trialCatalog.activeKeys, 1); assert.equal(f.evidence().trialCatalog.productsIncluded, 0);
    assert.equal(f.button('Add Selected Products').props.disabled, true);
    assert.deepEqual(f.alerts, []);
  } finally { f.h.stop(); }
});

test('real existing-key mode locks persisted products, toggles only pending additions, saves additive versioned scope', async () => {
  const evidence = { trialCatalog: measured(40, 1), keys: [{ id: 'existing', scopeVersion: 7,
    linkedProductIds: Array.from({ length: 40 }, (_, i) => 'hardware-' + i), linkedVariantSelections: {} }] };
  const f = fixture('Hardware', { evidence }); await flush();
  try {
    f.card('hardware-0').props.onClick(); await flush();
    assert.equal(f.card('hardware-0').props['aria-disabled'], true);
    assert.equal(f.button('Add Selected Products').props.disabled, true);
    f.card('hardware-40').props.onClick(); await flush();
    f.card('hardware-40').props.onClick(); await flush();
    assert.equal(f.button('Add Selected Products').props.disabled, true);
    f.button('Select All').props.onClick(); await flush();
    assert.equal(f.cards().filter(n => n.props.className.includes('border-2')).length, 50);
    await f.button('Add Selected Products').props.onClick(); await flush();
    const body = JSON.parse(f.keyCalls.find(call => call.init?.method === 'PATCH').init.body);
    assert.equal(body.expectedScopeVersion, 7); assert.equal(body.linkedProductIds.length, 50);
    assert.ok(evidence.keys[0].linkedProductIds.every(id => body.linkedProductIds.includes(id)));
    assert.equal(f.evidence().keys[0].scopeVersion, 8);
    assert.equal(f.evidence().trialCatalog.productsIncluded, 50);
    assert.equal(f.catalogCalls().length, 1);
  } finally { f.h.stop(); }
});

for (const [label, evidence] of [
  ['one key reported but absent', { trialCatalog: measured(0, 1), keys: [] }],
  ['zero keys reported but key present', { trialCatalog: measured(), keys: [{ linkedProductIds: [], linkedVariantSelections: {} }] }],
  ['multiple keys reported', { trialCatalog: measured(0, 2), keys: [] }],
  ['missing Trial verification', { keys: [] }],
]) test('real UI fails closed: ' + label, async () => {
  const f = fixture('Hardware', { evidence }); await flush();
  try {
    assert.equal(f.card('hardware-0').props['aria-disabled'], true);
    f.card('hardware-0').props.onClick(); await flush();
    assert.equal(f.button('Generate API Key').props.disabled, true);
    assert.equal(f.button('Select All').props.disabled, true);
    assert.equal(f.cards().filter(n => n.props.className.includes('border-2')).length, 0);
    assert.ok(nodes(f.h.output, n => n.props.role === 'alert').length);
  } finally { f.h.stop(); }
});

test('upgrade-required state cannot select cards or generate a first key', async () => {
  const f = fixture('Hardware', { upgradeRequired: true }); await flush();
  try {
    assert.equal(f.card('hardware-0').props['aria-disabled'], true);
    f.card('hardware-0').props.onClick(); await flush();
    assert.equal(f.button('Generate API Key'), undefined);
    assert.equal(f.button('Select All').props.disabled, true);
  } finally { f.h.stop(); }
});
