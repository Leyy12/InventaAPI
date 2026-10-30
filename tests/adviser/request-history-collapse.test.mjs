// Request history starts hidden, loads only when opened, and pages 10 rows at a time.
// The Pro Max usage cards no longer include an "API keys (active)" card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, flush, nodes } from './workspace-refresh/harness.mjs';

const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree && typeof tree === 'object'
  ? text(tree.props?.children) : String(tree ?? '');
const clean = node => text(node).trim().replace(/\s+/g, ' ');
const historyPath = 'dashboard/src/components/api/RequestHistory.tsx';

function historyFixture(count) {
  const h = hooks(), calls = [];
  const records = Array.from({ length: count }, (_, i) => ({ keyName: `Key ${i + 1}`, timestamp: '2026-10-30T05:00:00Z',
    endpoint: '/daas/v1/catalog', method: 'GET', statusCode: 200 }));
  const api = () => ({ success: true, limit: 50, records, hasMore: false });
  const History = load(historyPath, 'History', h, {
    '@/lib/supabase/auth-context': { useAuth: () => ({ user: { uid: 'u' } }) },
    '@/lib/api-keys': { apiKeyRequest: async (...args) => { calls.push(args); return api(); } },
    '@/lib/api-history': {
      createHistoryRefresh: (read, publish) => ({
        async refresh() { publish({ status: 'loading', records: [], hasMore: false });
          const p = await read(new AbortController().signal); publish({ status: 'ready', records: p.records, hasMore: p.hasMore }); },
        stop() {},
      }),
      historyDate: value => value, requestStatus: code => `${code}`,
    },
  });
  h.mount(History, { user: { uid: 'u' } });
  const button = label => nodes(h.output, n => n.type === 'button' && clean(n) === label)[0];
  const rows = () => nodes(h.output, n => n.type === 'tr' && n.props.className?.includes('border-t')).map(clean);
  return { h, calls, button, rows };
}

test('history is hidden and not loaded until the customer opens it', async () => {
  const f = historyFixture(5); await flush();
  assert.equal(f.calls.length, 0);
  assert.ok(f.button('Show history'));
  assert.equal(f.button('Refresh history'), undefined);
  assert.doesNotMatch(clean(f.h.output), /Key name \(at request\)|Up to 50 recorded requests/);
  f.button('Show history').props.onClick(); await flush();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].slice(1, 2), ['/history']);
  assert.ok(f.button('Hide history'));
  assert.ok(f.button('Refresh history'));
  assert.equal(f.rows().length, 5);
  f.button('Hide history').props.onClick(); await flush();
  assert.equal(f.rows().length, 0);
  f.h.stop();
});

test('history pages 10 rows at a time with Previous / Next', async () => {
  const f = historyFixture(23); await flush();
  f.button('Show history').props.onClick(); await flush();
  assert.equal(f.rows().length, 10);
  assert.match(f.rows()[0], /^Key 1 /);
  assert.match(clean(f.h.output), /Showing 1 ?– ?10 of 23/);
  assert.match(clean(f.h.output), /Page 1 of 3/);
  assert.equal(f.button('Previous').props.disabled, true);
  f.button('Next').props.onClick(); await flush();
  assert.match(f.rows()[0], /^Key 11 /);
  f.button('Next').props.onClick(); await flush();
  assert.equal(f.rows().length, 3);
  assert.match(clean(f.h.output), /Showing 21 ?– ?23 of 23/);
  assert.equal(f.button('Next').props.disabled, true);
  f.h.stop();
});

test('history with 10 or fewer rows shows no page buttons', async () => {
  const f = historyFixture(4); await flush();
  f.button('Show history').props.onClick(); await flush();
  assert.equal(f.button('Next'), undefined);
  assert.match(clean(f.h.output), /Showing 1 ?– ?4 of 4/);
  f.h.stop();
});

test('Pro Max usage shows only the segment request cards, no active-keys card', async () => {
  const h = hooks();
  const Cards = load('dashboard/src/components/reports/CustomerUsageSummary.tsx', 'MonthlyUsageCards', h, {
    '@/lib/trial-display.mjs': {}, 'next/link': { __esModule: true, default: 'a' }, '@/lib/api-keys': {},
    '@/lib/supabase/auth-context': {}, '@/lib/reports': {}, '@/lib/quota-refresh': {}, '@/lib/account-usage-events': {},
    '@/config/plans': {}, '@/lib/plan-request-policy': {},
  });
  h.mount(Cards, { monthly: { plan: 'pro max', limit: 15000, resetsAt: '2026-11-01T00:00:00Z', buckets: [
    { bucket: 'Grocery', used: 10, remaining: 14990 }, { bucket: 'Pharmacy', used: 36, remaining: 14964 },
    { bucket: 'Hardware', used: 11, remaining: 14989 }] } });
  const content = clean(h.output);
  assert.doesNotMatch(content, /API keys \(active\)/);
  for (const label of ['Grocery requests', 'Pharmacy requests', 'Hardware requests']) assert.match(content, new RegExp(label));
  const cards = nodes(h.output, n => n.type === 'div' && n.props.className?.includes('rounded-xl'));
  assert.equal(cards.length, 3);
});
