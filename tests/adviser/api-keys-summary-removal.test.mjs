import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hooks, load, browser, flush, nodes } from './workspace-refresh/harness.mjs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const keysPath = 'dashboard/src/app/dashboard/api-keys/page.tsx';
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object'
  ? text(tree.props?.children) : String(tree ?? '');
const stub = () => null;
const key = { id: 'fixture-key', name: 'Synthetic integration', keyPrefix: 'fixture-prefix',
  plan: 'Pro', status: 'active', createdAt: '2026-10-01T00:00:00Z', lastUsed: null };
function fixture({ status = 'trial', response = { success: true, keys: [key] }, pending = false } = {}) {
  const h = hooks(), b = browser(), calls = [], confirmations = [];
  let resolveRead, result = response;
  const user = { uid: 'fixture-only' };
  const History = () => null, Examples = () => null;
  const Component = load(keysPath, 'AccountKeysSession', h, {
    'next/link': { __esModule: true, default: 'a' }, 'lucide-react': new Proxy({}, { get: () => stub }),
    '@/lib/firebase/auth-context': { useAuth: () => ({ user }) },
    '@/lib/api-key-generation': { REVOCATION_WARNING: 'Fixture revocation warning' },
    '@/components/api/RequestHistory': { __esModule: true, default: History },
    '@/components/shared/CodeSnippet': { __esModule: true, default: Examples },
    // Deliberately no CustomerUsageSummary dependency: importing it must fail.
    '@/lib/api-keys': { apiKeyRequest: async (...args) => {
      calls.push(args);
      if (pending) { pending = false; return new Promise(resolve => { resolveRead = resolve; }); }
      if (result instanceof Error) throw result;
      return result;
    } },
  }, { ...b, window: Object.assign(b.window, {
    confirm: message => { confirmations.push(message); return false; },
    alert: () => assert.fail('Unexpected alert'),
  }), setInterval: () => assert.fail('API Keys must not start polling') });
  h.mount(Component, { user, entitlementStatus: status });
  return { h, b, calls, confirmations, History, Examples,
    finish: value => resolveRead(value), respond: value => { result = value; },
    button: label => nodes(h.output, n => n.type === 'button' && text(n).trim().replace(/\s+/g, ' ') === label)[0] };
}

for (const status of ['trial', 'active', 'upgrade_required', null]) {
  test('API Keys omits duplicate account cards while preserving sections: ' + status, async () => {
    const f = fixture({ status }); await flush();
    try {
      const content = text(f.h.output);
      assert.doesNotMatch(content, /Remaining Slots|Trial expires|Free Trial · Active|Plan settings|Requests used today|Daily account limit/);
      assert.equal(nodes(f.h.output, n => n.type === 'h2' && text(n) === 'Active API Keys').length, 1);
      assert.match(content, /Keep Your Keys Secure/);
      assert.match(content, /Secrets are shown only once/);
      assert.match(content, /Manage or revoke existing API credentials/);
      assert.match(content, /New API keys are created from/);
      const top = f.h.output.props.children.filter(Boolean);
      assert.ok(top.findIndex(n => n.type === f.History) < top.findIndex(n => n.type === 'section'));
      assert.equal(nodes(f.h.output, n => n.type === f.History).length, 1);
      assert.ok(nodes(f.h.output, n => n.type === 'a' && n.props.href === '/dashboard/products').length);
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0].length, 1);
      for (let i = 0; i < 5; i++) f.b.cycle();
      await flush(); assert.equal(f.calls.length, 1);
      if (status === 'upgrade_required') {
        assert.match(content, /Free Trial Ended.*Existing keys remain visible and revocable/);
        assert.ok(nodes(f.h.output, n => n.props.href === '/dashboard/plan-billing#upgrade').length);
      }
      if (status === null) assert.match(content, /Verifying account entitlement/);
    } finally { f.h.stop(); }
  });
}

test('key metadata, masked prefix, examples and cancel-safe Revoke remain intact', async () => {
  const f = fixture(); await flush();
  try {
    const content = text(f.h.output);
    for (const expected of [/Synthetic integration/, /Active/, /Created\s+Oct 1, 2026/, /fixture-prefix••••••••/, /LAST USED/, /Never/, /PLAN/, /Pro/]) assert.match(content, expected);
    assert.doesNotMatch(content, /Replace API Key|Generate API Key|Trial expires/);
    f.button('Show Integration Code Examples').props.onClick(); await flush();
    assert.equal(nodes(f.h.output, n => n.type === f.Examples).length, 1);
    f.button('Hide Integration Code Examples').props.onClick(); await flush();
    assert.equal(nodes(f.h.output, n => n.type === f.Examples).length, 0);
    await f.button('Revoke').props.onClick(); await flush();
    assert.match(f.confirmations[0], /cannot be undone.*Fixture revocation warning/s);
    assert.equal(f.calls.length, 1, 'canceling must not send DELETE or refresh');
  } finally { f.h.stop(); }
});

test('loading, empty and list error/retry states remain usable without a summary lifecycle', async () => {
  const f = fixture({ pending: true }); await flush();
  try {
    assert.match(text(f.h.output), /Loading API keys/);
    f.finish({ success: true, keys: [] }); await flush();
    assert.match(text(f.h.output), /No API keys yet/);
    assert.ok(nodes(f.h.output, n => n.props.href === '/dashboard/products' && text(n) === 'Go to Products').length);
  } finally { f.h.stop(); }
  const failed = fixture({ response: new Error('synthetic offline') }); await flush();
  try {
    assert.match(text(failed.h.output), /Unable to load API keys/);
    failed.respond({ success: true, keys: [key] });
    failed.button('Retry key list').props.onClick(); await flush();
    assert.match(text(failed.h.output), /Synthetic integration/);
    assert.equal(failed.calls.length, 2);
  } finally { failed.h.stop(); }
});

test('Overview retains Trial and paid summaries; API Keys retains authenticated history and revocation', () => {
  const keys = read(keysPath), summary = read('dashboard/src/components/reports/CustomerUsageSummary.tsx');
  assert.doesNotMatch(keys, /CustomerUsageSummary|createQuotaRefresh|subscribeAccountUsage|setInterval|visibilitychange/);
  assert.match(read('dashboard/src/app/dashboard/page.tsx'), /<CustomerUsageSummary\s*\/>/);
  for (const label of ['Products', 'Remaining Slots', 'Active API Keys', 'Trial expires', 'Free Trial · Active', 'Plan settings',
    'Requests used today (UTC)', 'Daily account limit', 'Remaining today', 'Unlimited', 'Resets at', 'Unable to load account usage']) assert.ok(summary.includes(label), label);
  assert.match(keys, /apiKeyRequest\(user, `\/\$\{encodeURIComponent\(id\)\}`, \{ method: "DELETE" \}\)/);
  assert.match(keys, /\$\{REVOCATION_WARNING\}/);
  assert.match(read('dashboard/src/components/api/RequestHistory.tsx'), /apiKeyRequest\(user, '\/history'/);
  assert.doesNotMatch(keys, /Replace API Key|\/generate|generateNewKey|apiKey\.secret/);
});
