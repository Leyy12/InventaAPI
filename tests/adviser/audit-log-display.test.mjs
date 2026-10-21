import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as display from '../../admin-panel/src/lib/audit-log-display.ts';
import { hooks, load, nodes, flush } from './workspace-refresh/harness.mjs';

const record = (data = {}) => ({ id: 'fixture', ...data });
for (const [field, value] of [['userEmail', 'login@example.test'], ['email', 'request@example.test'], ['userId', 'verified-uid']]) {
  test(`historical ${field} actor displays and remains searchable`, () => {
    const log = record({ [field]: value, action: 'Customer Login' });
    assert.equal(display.auditActor(log), value); assert.equal(display.auditMatches(log, value.toUpperCase()), true);
  });
}
test('UID search remains available when email is present; missing actor is not fabricated as System', () => {
  assert.equal(display.auditMatches(record({ userEmail: 'a@example.test', userId: 'uid-123' }), 'uid-123'), true);
  assert.equal(display.auditActor(record()), 'Unknown actor');
});
for (const action of ['Customer Login', 'Customer Logout', 'API Key Generated', 'API Key Revoked', 'API Key Renamed',
  'API Key Products Updated', 'API Request', 'Authentication Failure', 'Product Updated', 'Product Submission Approved']) {
  test(`existing/new action ${action} has readable non-empty details`, () => {
    const log = record({ action });
    assert.equal(display.auditAction(log), action); assert.match(display.auditDetails(log), /recorded/);
    assert.notEqual(display.auditDetails(log), '{}');
  });
}
test('legacy uppercase action and explicit details remain compatible', () => {
  assert.equal(display.auditAction(record({ action: 'PAYMENT_TRANSACTION' })), 'Payment Transaction');
  assert.equal(display.auditDetails(record({ details: 'Historical activity description' })), 'Historical activity description');
});
test('raw and formatted historical actions both match case-insensitively without altering labels', () => {
  const log = record({ action: 'PAYMENT_TRANSACTION', userEmail: 'historical@example.test', userId: 'historical-uid' });
  assert.equal(display.auditAction(log), 'Payment Transaction');
  for (const search of ['PAYMENT_TRANSACTION', 'payment_transaction', 'PaYmEnT_TrAnSaCtIoN',
    'Payment Transaction', 'payment transaction', 'PAYMENT TRANSACTION', 'HISTORICAL@EXAMPLE.TEST', 'HISTORICAL-UID']) {
    assert.equal(display.auditMatches(log, search), true, search);
  }
  assert.equal(display.auditMatches(log, 'unrelated_action'), false);
});
test('metadata rendering excludes raw credentials, tokens, passwords, bodies and unknown objects', () => {
  const log = record({ action: 'API Request', email: 'actor@example.test', endpoint: '/catalog?apiKey=secret-sentinel', status: 200,
    metadata: { keyId: 'key-123', productId: 'product-123', key: 'credential-sentinel', token: 'token-sentinel',
      password: 'password-sentinel', body: { privatePayment: 'payment-sentinel' }, arbitrary: { data: 'object-sentinel' } } });
  assert.match(display.auditDetails(log), /key-123|product-123|\/catalog|200/);
  assert.doesNotMatch(display.auditDetails(log), /sentinel|privatePayment|apiKey|\{\}/);
});
test('all historical timestamp representations are compatible, malformed values have a neutral fallback', () => {
  const date = new Date('2026-10-13T01:00:00Z'), expected = date.toLocaleString();
  for (const stamp of [date, date.toISOString(), date.getTime(), { toDate: () => date },
    { seconds: date.getTime() / 1000 }, { _seconds: date.getTime() / 1000 }]) assert.equal(display.auditTimestamp(stamp), expected);
  for (const value of [null, undefined, '', 'malformed', {}, { toDate() { throw Error('bad'); } }]) {
    assert.equal(display.auditTimestamp(value), 'Timestamp unavailable');
  }
});
test('malformed fields cannot crash display or search', () => {
  const log = record({ action: {}, userEmail: 99, details: [], metadata: null });
  assert.equal(display.auditAction(log), 'Unknown activity'); assert.equal(display.auditMatches(log, 'unavailable'), false);
  assert.equal(display.auditDetails(log).includes('{}'), false);
});

function pageFixture(records = [], failure = false) {
  const h = hooks(), calls = [];
  const page = load('admin-panel/src/app/audit/page.tsx', 'AuditLogsPage', h, {
    'lucide-react': new Proxy({}, { get: () => () => null }),
    '@/lib/firebase/config': { db: 'synthetic-database' }, '@/lib/audit-log-display': display,
    '@/lib/data/firestore-client': {
      collection: (_db, name) => { calls.push(['collection', name]); return name; },
      orderBy: (...args) => { calls.push(['orderBy', ...args]); return args; },
      limit: n => { calls.push(['limit', n]); return n; }, query: (...args) => args,
      getDocs: async query => {
        calls.push(['read', query[0]]);
        if (failure) throw Error('synthetic permission denied');
        const data = query[0] === 'audit_logs' ? records : [];
        return { empty: !data.length, docs: data.map((value, i) => ({ id: `row-${i}`, data: () => value })) };
      },
    },
  }, { console: { error() {} } });
  h.mount(page);
  return { h, calls };
}
test('real reader preserves newest-first latest-50 query, layout and search across event formats', async () => {
  const f = pageFixture([
    { action: 'Product Submission Approved', userEmail: 'admin@example.test', entityId: 'submission-123', timestamp: '2026-10-13', details: 'Approved submission' },
    { action: 'API Request', email: 'legacy@example.test', timestamp: { seconds: 1 }, endpoint: '/catalog' },
    { action: 'Customer Logout', userId: 'logout-uid', timestamp: '2026-10-12' },
  ]);
  assert.match(JSON.stringify(f.h.output), /Loading logs/); await flush();
  const text = JSON.stringify(f.h.output);
  assert.match(text, /Timestamp|Action|User|Details|admin@example.test|legacy@example.test|logout-uid/);
  assert.doesNotMatch(text, /Invalid Date|"\{\}"/);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'orderBy'), [['orderBy', 'timestamp', 'desc']]);
  assert.deepEqual(f.calls.filter(([kind]) => kind === 'limit'), [['limit', 50]]);
  const search = nodes(f.h.output, node => node.type === 'input')[0];
  search.props.onChange({ target: { value: 'legacy@example.test' } }); await flush();
  assert.match(JSON.stringify(f.h.output), /legacy@example.test/); assert.doesNotMatch(JSON.stringify(f.h.output), /admin@example.test|logout-uid/);
  assert.equal(f.calls.filter(([kind]) => kind === 'read').length, 1); f.h.stop();
});
test('empty/error reader paths remain read-only and preserve accepted empty handling', async () => {
  for (const failure of [false, true]) {
    const f = pageFixture([], failure); await flush();
    assert.match(JSON.stringify(f.h.output), /No audit logs found/);
    assert.deepEqual(f.calls.filter(([kind]) => kind === 'read').map(([, name]) => name), failure ? ['audit_logs'] : ['audit_logs', 'transactions']);
    f.h.stop();
  }
});
test('audit restrictions and existing login/logout/auth-failure/request writers are preserved', () => {
  const source = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  const rules = source('firestore.rules').split('match /audit_logs/{logId}')[1].split('\n    }')[0];
  assert.match(rules, /allow read: if isAdmin\(\)/); assert.match(rules, /allow update, delete: if false/);
  assert.match(rules, /request.resource.data.userId == request.auth.uid/);
  const auth = source('dashboard/src/lib/firebase/auth-context.tsx');
  assert.match(auth, /action: 'Customer Login'/); assert.match(auth, /action: 'Customer Logout'/);
  assert.match(source('services/daas-security.js'), /action: 'Authentication Failure'/);
  assert.match(source('routes/daas.js'), /action: 'API Request'/);
});
