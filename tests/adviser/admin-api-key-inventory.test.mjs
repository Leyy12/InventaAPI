// Real display modules/effects with synthetic data; never initialize Firebase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { TRIAL_MAX_PRODUCTS } from '../../functions/entitlement-limits.mjs';
import { hooks, load, flush, browser, nodes } from './workspace-refresh/harness.mjs';

const require = createRequire(new URL('../../admin-panel/package.json', import.meta.url));
const ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
function displayModule(path, imports = {}) {
  const exports = {};
  const compiled = ts.transpileModule(source(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(compiled, { exports, require: id => {
    if (id === 'react/jsx-runtime') return require(id);
    if (Object.hasOwn(imports, id)) return imports[id];
    throw Error('Unexpected display dependency: ' + id);
  } });
  return exports;
}
const linked = displayModule('admin-panel/src/lib/linked-product-names.ts');
const inventory = displayModule('admin-panel/src/lib/api-key-inventory.ts', {
  './linked-product-names': linked, '../../../functions/entitlement-limits.mjs': { TRIAL_MAX_PRODUCTS },
});
const details = displayModule('admin-panel/src/components/admin/InventoryDetails.tsx', { '@/lib/api-key-inventory': inventory });
const trial = { plan: 'Free Trial', status: 'trial', active: true, limit: 500, used: 499, period: 'trial' };
const pro = { plan: 'Pro', status: 'active', active: true, limit: 500, used: 125, period: 'daily' };
const max = { ...pro, plan: 'Pro Max', limit: null };
const ids = n => Array.from({ length: n }, (_, i) => 'product-' + i);
const markup = (name, props) => renderToStaticMarkup(React.createElement(details[name], props));
const counts = inventory.activeAccountProductCounts;
const usage = inventory.inventoryUsage;
const stamp = '2026-10-12T06:30:00.000Z';
const lastUsed = '2026-10-12T07:42:00Z';

for (const n of [0, 10, 50, 53]) test(`Trial ${n}/50 uses persisted products, not legacy request counters`, () => {
  const persisted = counts([{ userId: 'trial', status: 'active', linkedProductIds: ids(n) }]);
  const result = usage(trial, persisted.trial);
  assert.equal(result.value, `${n} / 50 Products`);
  assert.equal(result.note, `${Math.max(0, 50 - n)} slots remaining`);
  assert.ok(result.percent <= 100);
});
test('canonical union deduplicates IDs and variants, isolates owners, excludes revoked and pending selections', () => {
  const records = [
    { userId: 'a', status: 'active', linkedProductIds: [' p1 ', 'p1', 'p2', '', '../bad'],
      linkedVariantSelections: { p2: ['v1', 'v2'], p3: ['v1', 'v2'] }, linkedProducts: [{ id: 'p3', name: 'legacy' }, { id: 'p4' }],
      pendingSelections: ['pending'] },
    { userId: 'a', status: 'active', linkedProductIds: ['p4', 'p5'] },
    { userId: 'a', status: 'revoked', linkedProductIds: ['historical'] },
    { userId: 'b', status: 'active', linkedProductIds: ['different'] },
    { userId: 'a', status: 'unknown', linkedProductIds: ['unknown'] },
  ];
  assert.equal(counts(records).a, 5); assert.equal(counts(records).b, 1);
  assert.equal(linked.canonicalLinkedProductIds(records[2])[0], 'historical', 'revoked history remains available');
  assert.equal(counts(records).a, counts([...records].reverse()).a);
});
test('Pro uses authoritative daily account usage and remaining allowance', () => {
  assert.equal(usage(pro, 99).value, '125 / 500 Requests');
  assert.equal(usage(pro, 99).note, '375 requests remaining');
  assert.equal(usage(pro, 99).label, 'Requests Today (UTC)');
});
test('Pro Max displays actual activity with no quota bar', () => {
  const result = usage(max, 0);
  assert.equal(result.value, '125 used · Unlimited'); assert.equal(result.percent, undefined);
  assert.doesNotMatch(markup('InventoryPlanUsage', { account: max, products: 0, state: 'ready' }), /style="width:/);
});
test('missing daily usage is unavailable, while known zero remains zero', () => {
  for (const used of [null, undefined, -1, NaN, '125']) {
    assert.equal(usage({ ...pro, used }, 0).value, 'Usage unavailable');
    assert.equal(usage({ ...max, used }, 0).value, 'Unlimited requests');
    assert.equal(usage({ ...max, used }, 0).note, 'Daily usage unavailable');
  }
  assert.equal(usage({ ...max, used: 0 }, 0).value, '0 used · Unlimited');
  assert.equal(usage({ ...pro, period: 'trial' }, 0).value, 'Usage unavailable');
  assert.equal(usage({ ...pro, limit: null }, 0).value, 'Usage unavailable');
  assert.equal(usage({ plan: 'Pro', used: 125, limit: 500, period: 'daily' }, 0).value, 'Unavailable');
  assert.equal(usage({ ...trial, status: 'expired' }, 10).value, 'Unavailable');
  assert.equal(usage(undefined, 0).value, 'Unavailable');
});
test('normal plan badges omit internal codes; exception states do not imply an active Trial', () => {
  for (const account of [trial, pro, max]) {
    const html = markup('InventoryPlanBadge', { account, state: 'ready' });
    assert.ok(html.includes('>' + account.plan + '</span>')); assert.doesNotMatch(html, /·|unverified/);
  }
  for (const [account, expected] of [
    [{ ...trial, status: 'upgrade_required' }, 'Upgrade Required'],
    [{ ...trial, plan: 'Disabled', active: false }, 'Disabled'],
    [{ ...trial, active: false }, 'Inactive'],
    [{ ...trial, status: 'unverified' }, 'Unavailable'],
    [undefined, 'Unavailable'],
  ]) { assert.equal(inventory.inventoryPlanLabel(account), expected); assert.equal(usage(account, 10).value, expected); }
});
test('loading skeletons, unavailable data and explicit refresh are visually distinct', () => {
  for (const name of ['InventoryPlanBadge', 'InventoryPlanUsage']) {
    const html = markup(name, { account: trial, products: 10, state: 'loading' });
    assert.match(html, /role="status"/); assert.match(html, /aria-label="Loading/);
    assert.doesNotMatch(html, /unverified|Verifying|10 \/ 50|Free Trial/);
  }
  const refreshing = markup('InventoryPlanUsage', { account: pro, products: 0, state: 'refreshing' });
  assert.match(refreshing, /125 \/ 500 Requests/); assert.match(refreshing, /Refreshing/); assert.match(refreshing, /aria-busy="true"/);
  const failed = markup('InventoryPlanUsage', { account: pro, products: 0, state: 'unavailable' });
  assert.match(failed, /Unavailable/); assert.doesNotMatch(failed, /125/);
});
test('Timestamp, Date, ISO and both serialized Firestore shapes format in PHT', () => {
  const seconds = Date.parse(stamp) / 1000;
  const values = [new Date(stamp), { toDate: () => new Date(stamp) }, stamp,
    { seconds, nanoseconds: 123000000 }, { _seconds: seconds, _nanoseconds: 0 }, '2026-10-12T14:30:00+08:00'];
  for (const value of values) assert.equal(inventory.formatKeyTimestamp(value, 'createdAt'), 'Oct 12, 2026, 2:30 PM PHT');
  assert.equal(inventory.formatKeyTimestamp(lastUsed, 'lastUsed'), 'Oct 12, 2026, 3:42 PM PHT');
});
test('null means never used; absent/malformed legacy history is not recorded, never guessed', () => {
  assert.equal(inventory.formatKeyTimestamp(null, 'lastUsed'), 'Never used');
  const malformed = [undefined, '', 'bad', '2026-10-12', '2026-10-12T14:30:00', '2026-02-30T00:00:00Z',
    1791786600000, new Date(NaN), { seconds: '123', nanoseconds: 0 }, { seconds: 0, nanoseconds: -1 },
    { seconds: 0 }, { _seconds: 0, _nanoseconds: 1e9 }, { toDate: () => { throw Error('bad stored timestamp'); } }];
  for (const value of malformed) {
    assert.equal(inventory.formatKeyTimestamp(value, 'createdAt'), 'Date unavailable');
    assert.equal(inventory.formatKeyTimestamp(value, 'lastUsed'), 'Not recorded');
  }
});

function hookFixture() {
  const h = hooks(), b = browser(), pending = [], calls = [];
  let user = { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' };
  const hook = load('admin-panel/src/lib/use-account-entitlements.ts', 'useAccountEntitlements', h,
    { './firebase/admin-auth-context': { useAdminAuth: () => ({ user }) } }, {
      ...b, setInterval: () => { throw Error('Polling prohibited'); },
      fetch: (url, init) => { calls.push({ url, init }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
    });
  const component = ({ revision = 'initial', refresh = 0, withState = true } = {}) => withState
    ? hook(['a', 'a'], revision, refresh, true) : hook(['a'], revision, refresh);
  return { h, b, pending, calls, component, setUser: next => { user = next; },
    complete: (index, accounts = { a: pro }) => pending[index].resolve({ ok: true, json: async () => ({ accounts }) }) };
}
test('hook loading, ready, refreshing, failed refresh and retry use one request per event', async () => {
  const f = hookFixture(); f.h.mount(f.component); assert.equal(f.h.output.status, 'loading'); await flush();
  assert.equal(f.calls.length, 1); assert.deepEqual(JSON.parse(f.calls[0].init.body).ids, ['a']);
  f.complete(0); await flush(); assert.equal(f.h.output.status, 'ready');
  for (let i = 0; i < 10; i++) f.b.cycle(); await flush(); assert.equal(f.calls.length, 1);
  f.h.render({ refresh: 1 }); assert.equal(f.h.output.status, 'refreshing'); assert.equal(f.h.output.accounts.a.used, 125); await flush();
  f.pending[1].reject(Error('synthetic unavailable')); await flush();
  assert.equal(f.h.output.status, 'unavailable'); assert.equal(Object.keys(f.h.output.accounts).length, 0);
  f.h.render({ refresh: 2 }); await flush(); f.complete(2); await flush(); assert.equal(f.h.output.status, 'ready');
  f.h.stop(); assert.ok(f.calls.at(-1).init.signal.aborted);
});
test('source/identity changes hide stale authority and ignore late responses', async () => {
  const f = hookFixture(); f.h.mount(f.component); await flush(); f.complete(0); await flush();
  f.h.render({ revision: 'changed-owner-record' }); assert.equal(f.h.output.status, 'loading'); assert.equal(Object.keys(f.h.output.accounts).length, 0); await flush();
  f.setUser({ uid: 'another-synthetic-admin', getIdToken: async () => 'synthetic-token' });
  f.h.render({ revision: 'changed-owner-record' }); await flush();
  f.complete(1, { a: max }); await flush(); assert.equal(f.h.output.status, 'loading');
  f.complete(2); await flush(); assert.equal(f.h.output.accounts.a.plan, 'Pro');
  f.setUser(null); f.h.render(); assert.equal(f.h.output.status, 'unavailable'); assert.equal(Object.keys(f.h.output.accounts).length, 0); f.h.stop();
});
test('legacy hook return remains an account map for Security Center', async () => {
  const f = hookFixture(); f.h.mount(f.component, { withState: false }); await flush(); f.complete(0); await flush();
  assert.equal(f.h.output.a.limit, 500); assert.equal(f.h.output.accounts, undefined); f.h.stop();
});

const stub = () => null;
function pageFixture(view) {
  const h = hooks(), subscriptions = [];
  const keyRows = [
    { id: 'active', userId: 'a', name: 'Current key', status: 'active', linkedProductIds: ['p1'], createdAt: { toDate: () => new Date(stamp) }, lastUsed },
    { id: 'revoked', userId: 'a', name: 'Historical key', status: 'revoked', linkedProductIds: ['old'], createdAt: stamp, lastUsed },
    { id: 'other', userId: 'a', name: 'Second active key', status: 'active', linkedVariantSelections: { p2: ['v1', 'v2'] }, lastUsed: null },
  ];
  const linkedProps = { names: { p1: 'Persisted Product', old: 'Historical Product' }, loading: false, error: false };
  const Component = load(`admin-panel/src/app/${view}/page.tsx`, view === 'consumers' ? 'ConsumersPage' : 'SecurityCenterPage', h, {
    'lucide-react': new Proxy({}, { get: () => stub }),
    'firebase/firestore': { collection: (_db, name) => name, query: value => value, orderBy: stub,
      onSnapshot: (name, publish) => { subscriptions.push(name); publish({ docs: (name === 'users'
        ? [{ id: 'a', data: () => ({ businessName: 'Synthetic Owner', email: 'synthetic@invalid.test' }) }]
        : keyRows.map(row => ({ id: row.id, data: () => row }))) }); return stub; } },
    '@/lib/firebase/config': { db: {} },
    '@/lib/use-account-entitlements': { useAccountEntitlements: (...args) => args[3] ? { accounts: { a: trial }, status: 'ready' } : { a: pro } },
    '@/lib/api-key-inventory': inventory, '@/components/admin/InventoryDetails': details,
    '@/components/admin/LinkedProducts': { LinkedProducts: stub, useLinkedProductNames: () => linkedProps },
  });
  return { h, Component, subscriptions, keyRows, linkedProps };
}
test('inventory owner joins/search/counts survive; revoked history and account scope are independent of filtering', async () => {
  const f = pageFixture('consumers'); f.h.mount(f.Component); await flush();
  assert.deepEqual(f.subscriptions, ['users', 'api_keys']);
  let cells = nodes(f.h.output, n => n.type === details.InventoryPlanUsage);
  assert.equal(cells.length, 3); assert.ok(cells.every(n => n.props.products === 2));
  const timelines = nodes(f.h.output, n => n.type === details.InventoryTimeline);
  assert.equal(timelines[1].props.lastUsed, lastUsed);
  const links = nodes(f.h.output, n => n.props.link);
  assert.equal(links.length, 3); assert.equal(links[1].props.link.linkedProductIds[0], 'old');
  assert.equal(links[0].props.names.p1, 'Persisted Product');
  nodes(f.h.output, n => n.type === 'input')[0].props.onChange({ target: { value: 'Historical' } }); await flush();
  cells = nodes(f.h.output, n => n.type === details.InventoryPlanUsage);
  assert.equal(cells.length, 1); assert.equal(cells[0].props.products, 2, 'search must not shrink account scope');
  assert.equal(markup('InventoryTimeline', timelines[1].props).includes('3:42 PM PHT'), true);
  f.h.stop();
});
test('Security Center renders its existing quota and historical Linked Products with the default account map', async () => {
  const f = pageFixture('security'); f.h.mount(f.Component); await flush();
  assert.equal(nodes(f.h.output, n => n.props.link).length, 3);
  const treeText = JSON.stringify(f.h.output);
  assert.match(treeText, /125/); assert.match(treeText, /500/); assert.match(treeText, /Synthetic Owner/);
  f.h.stop();
});
