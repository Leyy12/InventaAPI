import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createAuthSession } from '../../../services/auth-navigation.ts';
import * as catalog from '../../../dashboard/src/lib/segment-catalog.ts';
import * as selection from '../../../dashboard/src/lib/trial-catalog-selection.ts';
import * as linked from '../../../dashboard/src/lib/linked-product-selection.ts';
import * as segment from '../../../services/customer-segment.js';
import * as traffic from '../../../admin-panel/src/lib/admin-traffic.ts';
import * as reporting from '../../../services/reporting.js';
import { createEntitlementPoller } from '../../../dashboard/src/lib/entitlement-poller.ts';
import { createQuotaRefresh } from '../../../dashboard/src/lib/quota-refresh.ts';
import { invalidateAccountUsage, subscribeAccountUsage } from '../../../dashboard/src/lib/account-usage-events.ts';
import { hooks, load, clock, browser, flush, nodes } from './harness.mjs';
const stub = () => null;
const icons = new Proxy({}, { get: () => stub });
const source = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');

function customer() {
  const h = hooks(), c = clock(), b = browser(), calls = [];
  const user = { uid: 'synthetic', getIdToken: async () => 'synthetic-not-a-credential' };
  let fail = false;
  const state = { user, appUser: { plan: 'Pro', businessSegment: 'Grocery' }, entitlement: { activePro: true, plan: 'Pro' } };
  const Component = load('dashboard/src/app/dashboard/products/page.tsx', 'CustomerCatalogSession', h, {
    'react-dom': { createPortal: stub },
    '@/components/layout/WorkspaceHeaderSlot': { useWorkspaceHeaderSlot: () => null },
    '../../../../../functions/entitlement-limits.mjs': { TRIAL_MAX_PRODUCTS: 50 },
    '@/lib/trial-display.mjs': { trialCapacityMessage: () => '', trialRemainingSlots: () => 50 },
    '@/lib/trial-catalog-selection': selection, '@/lib/account-usage-events': { invalidateAccountUsage },
    '@/lib/api-key-generation': { GENERATION_POLICY: {}, generationErrorMessage: () => '' },
    'lucide-react': icons, 'next/link': { default: stub }, 'next/navigation': { useRouter: () => ({}) },
    '@/components/product-request/ProductNotFound': { default: stub },
    '../../../../../services/customer-segment.js': segment,
    '@/components/products/AddProductModal': { default: stub },
    '@/lib/product-image-url': { productImageSource: () => '', showProductImageFallback: stub },
    '@/lib/firebase/auth-context': { useAuth: () => state },
    '@/lib/firebase/products-service': { getBasePrice: () => 1, getBaseSize: () => 'each', hasNearExpiry: () => false },
    '@/lib/linked-product-selection': linked, '@/lib/api-keys': { apiKeyRequest: () => { throw Error('unexpected key read'); } },
    '@/lib/segment-catalog': { ...catalog, createCatalogRefresh: options => catalog.createCatalogRefresh({ ...options, schedule: c.schedule, cancel: c.cancel }) },
  }, { ...b, fetch: async url => {
    calls.push(url);
    if (fail) return { ok: false };
    const query = new URL(url).searchParams, chosen = query.get('businessSegment');
    const products = [{ id: chosen + '-1', name: 'Synthetic Rice', description: 'fixture', sku: 'fixture', segment: chosen === 'All' ? 'Grocery' : chosen }];
    return { ok: true, json: async () => ({ products, availability: { segment: chosen === 'All' ? null : chosen, total: 1 },
      pagination: { total: 1, offset: 0, limit: 200, returned: 1 } }) };
  } });
  h.mount(Component);
  return { h, c, b, calls, state, setFail(value) { fail = value; } };
}

test('Customer real Products effects: initial/segment/search/select state, 10 focus + visibility cycles and 5 min idle', async () => {
  const { h, c, b, calls } = customer(); await flush();
  assert.equal(calls.length, 1); assert.equal(c.timers.size, 0);
  const search = nodes(h.output, node => node.type === 'input' && node.props.placeholder?.includes('Search'))[0];
  search.props.onChange({ target: { value: 'Rice' } }); await flush();
  const selector = nodes(h.output, node => node.type === 'select')[0];
  selector.props.onChange({ target: { value: 'Grocery' } }); await flush();
  assert.equal(calls.length, 2); assert.match(calls[1], /businessSegment=Grocery/);
  nodes(h.output, node => node.props.onClick && node.props.className?.includes('glass-card rounded-xl transition'))[0].props.onClick(); await flush();
  const selectedBefore = nodes(h.output, node => node.props.className?.includes('border-2 border-indigo-500')).length;
  assert.ok(selectedBefore > 0);
  for (let i = 0; i < 10; i++) b.cycle(); await flush();
  await c.advance(60000); assert.equal(calls.length, 2);
  await c.advance(240000); assert.equal(calls.length, 2);
  assert.equal(nodes(h.output, node => node.type === 'input')[0].props.value, 'Rice');
  assert.equal(nodes(h.output, node => node.type === 'select')[0].props.value, 'Grocery');
  assert.equal(nodes(h.output, node => node.props.className?.includes('border-2 border-indigo-500')).length, selectedBefore);
  assert.equal(b.window.location.pathname, '/dashboard/products'); assert.equal(b.window.scrollY, 143);
  h.stop();
});

test('Customer real Retry control makes exactly one intentional catalog load; error never polls', async () => {
  const { h, c, calls, setFail } = customer(); setFail(true); await flush();
  assert.equal(calls.length, 1); await c.advance(300000); assert.equal(calls.length, 1);
  setFail(false);
  nodes(h.output, node => node.type === 'button' && node.props.children === 'Retry catalog')[0].props.onClick(); await flush();
  assert.equal(calls.length, 2); assert.equal(c.timers.size, 0); h.stop();
});

for (const role of ['Developer', 'Admin']) test(`${role}: same-user token recheck preserves protected boundary; authorization loss still fails closed`, async () => {
  const h = hooks(), c = clock(), user = { uid: role }, pending = [], states = [];
  const gate = createAuthSession({ readProfile: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    publish: value => states.push(value), rejected: stub, schedule: c.schedule, cancel: c.cancel });
  const initial = gate.accept(user); pending[0].resolve({ role }); await initial;
  const before = states.length, renewal = gate.accept(user);
  assert.equal(states.length, before, 'no loading frame/remount while same-session authority is checked');
  pending[1].resolve({ role }); await renewal; assert.equal(states.at(-1).status, 'verified');
  const denied = gate.accept(user); pending[2].resolve({ role: 'untrusted' }); await denied;
  assert.equal(states.at(-1).status, 'denied'); assert.equal(states.at(-1).profile, null);
  gate.stop(); h.stop();
});
for (const failure of ['offline', 'timeout', 'revoked']) test('same-session background verification ' + failure + ' is fail closed', async () => {
  const c = clock(), user = { uid: 'synthetic' }, pending = []; let state;
  const gate = createAuthSession({ readProfile: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    publish: value => { state = value; }, rejected: stub, schedule: c.schedule, cancel: c.cancel });
  const initial = gate.accept(user); pending[0].resolve({ role: 'Admin' }); await initial;
  const renewal = gate.accept(user);
  if (failure === 'timeout') await c.advance(10000);
  else pending[1].reject(failure === 'revoked' ? { status: 401 } : Error('offline'));
  await renewal;
  assert.equal(state.status, failure === 'revoked' ? 'invalid' : 'unverified'); assert.equal(state.profile, null);
  pending[1].resolve({ role: 'Admin' }); await flush(); assert.equal(state.profile, null); gate.stop();
});

test('Admin real entitlement hook: initial load, zero focus/visibility/idle reads, source mutation and explicit refresh', async () => {
  const h = hooks(), c = clock(), b = browser(), calls = [];
  const user = { uid: 'admin-synthetic', getIdToken: async () => 'synthetic-not-a-credential' };
  const hook = load('admin-panel/src/lib/use-account-entitlements.ts', 'useAccountEntitlements', h, {
    './firebase/admin-auth-context': { useAdminAuth: () => ({ user }) },
  }, { ...b, setInterval: () => { throw Error('generic Admin polling'); }, fetch: async (url, init) => {
    calls.push({ url, ids: JSON.parse(init.body).ids }); return { ok: true, json: async () => ({ accounts: { a: { plan: 'Pro', limit: 500 } } }) };
  } });
  const Component = ({ revision, refresh }) => hook(['a'], revision, refresh);
  h.mount(Component, { revision: 'initial', refresh: 0 }); await flush(); assert.equal(calls.length, 1);
  for (let i = 0; i < 10; i++) b.cycle(); await c.advance(300000); assert.equal(calls.length, 1);
  h.render({ revision: 'actual-user-document-update', refresh: 0 }); await flush(); assert.equal(calls.length, 2);
  h.render({ revision: 'actual-user-document-update', refresh: 1 }); await flush(); assert.equal(calls.length, 3);
  assert.equal(h.output.a.limit, 500); h.stop();
});

test('Admin real Reports effects retain 4 legitimate listeners, filter and manual traffic refresh', async () => {
  const h = hooks(), c = clock(), b = browser(), registrations = [], reads = [];
  let unsubscribes = 0;
  const user = { uid: 'admin-synthetic', getIdToken: async () => 'synthetic-not-a-credential' };
  const Component = load('admin-panel/src/components/admin/AdminDashboardClient.tsx', 'Reports', h, {
    'firebase/firestore': { collection: (_db, name) => name, query: value => value, orderBy: stub, limit: stub,
      onSnapshot: (query, publish) => { registrations.push({ query, publish }); publish({ docs: [] }); return () => { unsubscribes++; }; } },
    recharts: icons, '@/lib/firebase/config': { auth: { currentUser: user }, db: {} },
    '@/lib/admin-traffic': { ...traffic, createTrafficRefresh: (read, publish, options) => traffic.createTrafficRefresh(read, publish, { ...options, schedule: c.schedule, cancel: c.cancel }) },
    '@/lib/firebase/admin-auth-context': { useAdminAuth: () => ({ user }) }, '@/lib/reports': reporting,
    '@/components/reports/CatalogReportPanel': { default: stub },
  }, { ...b, fetch: async url => { reads.push(url); return { ok: true, json: async () => ({ success: true, limit: 500, records: [] }) }; } });
  h.mount(Component, { user }); await flush(); assert.equal(reads.length, 1); assert.equal(registrations.length, 4);
  nodes(h.output, node => node.props.onSelection)[0].props.onSelection('Hardware'); await flush();
  for (let i = 0; i < 10; i++) b.cycle(); await c.advance(300000);
  assert.equal(reads.length, 1); assert.equal(registrations.length, 4); assert.equal(unsubscribes, 0);
  assert.equal(nodes(h.output, node => node.props.onSelection)[0].props.selection, 'Hardware');
  registrations.find(row => row.query === 'users').publish({ docs: [{ id: 'new', data: () => ({ role: 'Developer' }) }] }); await flush();
  assert.equal(registrations.length, 4); assert.equal(unsubscribes, 0, 'real update uses the existing connection');
  nodes(h.output, node => node.type === 'button' && node.props.children === 'Refresh traffic')[0].props.onClick(); await flush();
  assert.equal(reads.length, 2); h.stop(); assert.equal(unsubscribes, 4);
});

test('entitlement deadline survives pending manual reads, without minute or five-minute polling', async () => {
  const c = clock(), pending = [], states = [];
  const poller = createEntitlementPoller({ read: () => new Promise(resolve => pending.push(resolve)), onState: value => states.push(value), schedule: c.schedule, cancel: c.cancel, now: c.now });
  poller.start(); await c.advance(0); pending[0]({ activePro: true, secondsRemaining: 3600 }); await flush();
  await c.advance(300000); assert.equal(pending.length, 1);
  void poller.refresh(); await c.advance(3300000);
  assert.equal(states.at(-1), null, 'pending I/O cannot extend verified authorization'); assert.equal(pending.length, 3);
  pending[1]({ activePro: true, secondsRemaining: 3600 }); await flush(); assert.equal(states.at(-1), null);
  pending[2]({ activePro: false, secondsRemaining: 0 }); await flush(); assert.equal(c.timers.size, 0); poller.stop();
});
test('long paid expiry clock checkpoints never call the API before the exact deadline', async () => {
  const c = clock(); let reads = 0;
  const poller = createEntitlementPoller({ read: async () => { reads++; return { activePro: true, secondsRemaining: 2592000 }; },
    onState: stub, schedule: c.schedule, cancel: c.cancel, now: c.now });
  poller.start(); await c.advance(0); await c.advance(2147483647); assert.equal(reads, 1); poller.stop();
});
test('quota errors stop retrying; actual account mutation invalidation and explicit retry still work', async () => {
  const c = clock(); let reads = 0, state;
  const reader = createQuotaRefresh({ read: async () => { reads++; if (reads === 1) throw Error('offline'); return { keys: [], usage: { used: 1 } }; },
    onState: value => { state = value; }, schedule: c.schedule, cancel: c.cancel });
  const unsubscribe = subscribeAccountUsage('synthetic', () => reader.refresh());
  reader.start(); await flush(); await c.advance(300000); assert.equal(reads, 1); assert.equal(state.status, 'error');
  reader.refresh(); await flush(); assert.equal(reads, 2); assert.equal(state.status, 'ready');
  invalidateAccountUsage('other'); assert.equal(reads, 2);
  invalidateAccountUsage('synthetic'); await flush(); assert.equal(reads, 3); unsubscribe(); reader.stop();
});
test('timestamp-only verification cannot remount the actual Customer Usage boundary', () => {
  const h = hooks(); let entitlement = { plan: 'Pro', subscription_status: 'active', apiRequestLimit: 500, serverTime: 'first' };
  const Component = load('dashboard/src/components/reports/CustomerUsageSummary.tsx', 'CustomerUsageSummary', h, {
    '../../../../functions/entitlement-limits.mjs': { TRIAL_MAX_PRODUCTS: 50 }, '@/lib/trial-display.mjs': {},
    'next/link': { default: stub }, '@/lib/api-keys': {}, '@/lib/firebase/auth-context': { useAuth: () => ({ user: { uid: 'synthetic' }, entitlement }) },
    '@/lib/reports': reporting, '@/lib/quota-refresh': {}, '@/lib/account-usage-events': {},
  });
  h.mount(Component); const first = nodes(h.output, node => typeof node.type === 'function' && node.key)[0].key;
  entitlement = { ...entitlement, serverTime: 'later' }; h.render();
  assert.equal(nodes(h.output, node => typeof node.type === 'function' && node.key)[0].key, first);
  entitlement = { ...entitlement, plan: 'Upgrade Required', subscription_status: 'upgrade_required' }; h.render();
  assert.notEqual(nodes(h.output, node => typeof node.type === 'function' && node.key)[0].key, first); h.stop();
});
test('Customer actual API Keys list preserves expanded integration examples across refocus and idle', async () => {
  const h = hooks(), c = clock(), b = browser(); let reads = 0;
  const user = { uid: 'synthetic' };
  const Component = load('dashboard/src/app/dashboard/api-keys/page.tsx', 'AccountKeysSession', h, {
    'next/link': { default: stub }, 'lucide-react': icons, '@/lib/firebase/auth-context': {},
    '@/lib/api-keys': { apiKeyRequest: async () => { reads++; return { success: true, keys: [{ id: 'key-fixture', keyPrefix: 'synthetic-prefix', status: 'active', name: 'Fixture' }] }; } },
    '@/lib/api-key-generation': { REVOCATION_WARNING: '' },
    '@/components/reports/CustomerUsageSummary': { default: stub }, '@/components/api/RequestHistory': { default: stub },
    '@/components/shared/CodeSnippet': { default: stub },
  }, b);
  h.mount(Component, { user, entitlementStatus: 'active' }); await flush(); assert.equal(reads, 1);
  nodes(h.output, node => node.type === 'button' && node.props.className?.includes('mt-4 w-full'))[0].props.onClick(); await flush();
  const expanded = nodes(h.output, node => node.props.className === 'mt-4').length; assert.ok(expanded > 0);
  for (let i = 0; i < 10; i++) b.cycle(); await c.advance(300000);
  assert.equal(reads, 1); assert.equal(nodes(h.output, node => node.props.className === 'mt-4').length, expanded); h.stop();
});
test('Customer actual Trial panel reads on entry/mutation/expiry, never every 30 seconds or on refocus', async () => {
  const h = hooks(), c = clock(), b = browser(); let reads = 0;
  const user = { uid: 'trial-synthetic', getIdToken: async () => 'synthetic-not-a-credential' };
  const Component = load('dashboard/src/app/dashboard/free-trial/page.tsx', 'TrialPanel', h, {
    'next/link': { default: stub }, 'lucide-react': icons, '@/lib/firebase/auth-context': {},
    '@/lib/account-usage-events': { subscribeAccountUsage },
    '@/lib/trial-display.mjs': { formatTrialExpiry: () => 'fixture-date', trialCapacityMessage: () => '', trialRemainingSlots: () => 50 },
    '../../../../../functions/entitlement-limits.mjs': { TRIAL_MAX_PRODUCTS: 50 },
  }, { ...b, performance: { now: c.now }, setInterval: () => 999, clearInterval: stub,
    setTimeout: c.schedule, clearTimeout: c.cancel,
    fetch: async () => { reads++; return { ok: true, json: async () => ({ active: reads < 3, secondsRemaining: 360, productsIncluded: 0, activeKeys: 0 }) }; },
  });
  h.mount(Component, { user, embedded: false }); await flush(); assert.equal(reads, 1);
  for (let i = 0; i < 10; i++) b.cycle(); await c.advance(300000); assert.equal(reads, 1);
  invalidateAccountUsage(user.uid); await flush(); assert.equal(reads, 2);
  await c.advance(360000); assert.equal(reads, 3, 'one expiry verification');
  await c.advance(300000); assert.equal(reads, 3, 'inactive Trial does not poll'); h.stop();
});
test('both active frontend trees contain no automatic focus/visibility/page-show refresh wiring', () => {
  const inspect = dir => readdirSync(new URL('../../../' + dir, import.meta.url), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? inspect(dir + '/' + entry.name) : /\.(?:tsx?|mjs)$/.test(entry.name) ? [dir + '/' + entry.name] : []);
  for (const file of [...inspect('dashboard/src'), ...inspect('admin-panel/src')]) {
    assert.doesNotMatch(source(file), /addEventListener\(\s*['"](?:focus|visibilitychange|pageshow|pagehide)['"]|window\.onfocus\s*=|refetchOnWindowFocus\s*:\s*true|revalidateOnFocus\s*:\s*true/, file);
  }
  assert.match(source('admin-panel/src/lib/firebase/admin-auth-context.tsx'), /onIdTokenChanged/);
  assert.match(source('dashboard/src/lib/firebase/auth-context.tsx'), /onIdTokenChanged/);
  assert.match(source('admin-panel/src/app/consumers/page.tsx'), /JSON.stringify\(\[usersMap, apiKeys\]\)/);
  assert.match(source('admin-panel/src/app/security/page.tsx'), /JSON.stringify\(\[usersMap, apiKeys\]\)/);
});
