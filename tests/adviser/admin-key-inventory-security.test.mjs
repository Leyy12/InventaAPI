// Fixed synthetic data and injected readers; no Firebase SDK/network/real credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAdminKeyInventoryHandler } from '../../services/admin-key-inventory.js';
import { inventoryRecord, inventoryCounts, inventoryTimestamp, validateInventoryResponse, INVENTORY_PAGE_SIZE } from '../../services/admin-key-inventory-contract.mjs';
import { invoke } from './phase2b1/memory-store.mjs';
import { hooks, load, flush, browser } from './workspace-refresh/harness.mjs';

const date = '2026-10-12T06:30:00.000Z';
const legacy = { userId: 'customer', name: 'Historical integration', userEmail: 'synthetic@invalid.test', status: 'revoked',
  key: 'SYNTHETIC_PLAINTEXT_DO_NOT_LEAK', credentialHash: 'SYNTHETIC_HASH_DO_NOT_LEAK', salt: 'SYNTHETIC_SALT_DO_NOT_LEAK',
  secret: 'SYNTHETIC_SECRET_DO_NOT_LEAK', future: { internal: 'SYNTHETIC_FUTURE_DO_NOT_LEAK' },
  linkedProductIds: ['p1', ' p1 ', 'p2'], linkedVariantSelections: { p2: ['VARIANT_PAYLOAD_SECRET'], p3: ['v1', 'v2'] },
  linkedProducts: [{ id: 'p4', key: 'EMBEDDED_SECRET_DO_NOT_LEAK' }], createdAt: new Date(date), lastUsed: null };
const safe = () => inventoryRecord('key-00000', legacy);
const response = records => ({ success: true, complete: true, records, counts: inventoryCounts(records) });

function fixture({ profile = { role: 'Admin', accountState: 'active' }, count = 1, data = legacy, verify, failPage, sizeViolation } = {}) {
  const state = { profile, queries: [], verifications: [], transactions: 0, writes: 0 };
  const rows = Array.from({ length: count }, (_, i) => ({ id: 'key-' + String(i).padStart(5, '0'), raw: typeof data === 'function' ? data(i) : data }));
  const forbid = () => { state.writes++; throw Error('Database writes prohibited'); };
  const profileRef = { get: async () => ({ data: () => state.profile }), set: forbid, update: forbid, delete: forbid };
  function query(fields = null, cursor = null, maximum = null) {
    return { select: (...next) => query(next, cursor, maximum),
      orderBy: (field, direction) => { assert.equal(field, '__name__'); assert.equal(direction, 'asc'); return query(fields, cursor, maximum); },
      limit: n => { assert.equal(n, INVENTORY_PAGE_SIZE); return query(fields, cursor, n); },
      startAfter: value => query(fields, value, maximum),
      async get() {
        state.queries.push({ fields, cursor, maximum });
        assert.ok(fields && !fields.some(f => ['key', 'credentialHash', 'salt', 'secret', 'future'].includes(f)));
        if (state.queries.length === failPage) throw Error('Synthetic page failed');
        const selected = rows.filter(row => cursor === null || row.id > cursor).slice(0, maximum + (sizeViolation ? 1 : 0));
        return { docs: selected.map(row => ({ id: row.id, data: () => Object.fromEntries(fields.filter(f => Object.hasOwn(row.raw, f)).map(f => [f, row.raw[f]])) })) };
      }, set: forbid, update: forbid, delete: forbid, add: forbid };
  }
  const db = { collection(name) { if (name === 'users') return { doc(uid) { assert.equal(uid, 'admin'); return profileRef; }, add: forbid };
    assert.equal(name, 'api_keys'); return query(); },
    async runTransaction(callback, options) { state.transactions++; assert.deepEqual(options, { readOnly: true });
      return callback({ get: ref => ref.get(), set: forbid, update: forbid, delete: forbid, create: forbid }); }, batch: forbid };
  const handler = createAdminKeyInventoryHandler({ getDb: () => db, documentId: '__name__', verifyIdToken: async (token, revoked) => {
    state.verifications.push({ token, revoked }); assert.equal(revoked, true);
    if (verify) return verify(token, state);
    if (token !== 'admin-token') throw Error('Invalid synthetic token');
    return { uid: 'admin' };
  } });
  return { state, handler, run: args => invoke(handler, { token: 'admin-token', ...args }) };
}
for (const token of [null, 'invalid', 'revoked']) test(`${token || 'missing'} token is denied before inventory access; errors are no-store`, async () => {
  const f = fixture(), r = await f.run({ token }); assert.equal(r.statusCode, 401); assert.equal(f.state.queries.length, 0);
  assert.equal(r.headers['Cache-Control'], 'no-store'); assert.equal(r.body.records, undefined); assert.equal(f.state.writes, 0);
});
for (const profile of [null, { role: 'Developer' }, { role: 'admin', disabled: true }, { role: 'admin', deleted: true },
  { role: 'admin', deletionRequested: true }, { role: 'admin', accountState: 'blocked' }, { role: 'admin', blocked: true },
  { role: 'admin', status: 'inactive' }, { role: 'admin', status: 'blocked' }, { role: 'admin', active: false }]) {
  test(`non-eligible Admin profile ${JSON.stringify(profile)} is denied`, async () => {
    const f = fixture({ profile }), r = await f.run(); assert.equal(r.statusCode, 403); assert.equal(f.state.queries.length, 0);
    assert.equal(r.body.records, undefined); assert.equal(f.state.writes, 0);
  });
}
test('valid Admin receives only safe fields; plaintext, hash, salt, embedded/future and variant payloads never leak', async () => {
  const f = fixture(), r = await f.run(); assert.equal(r.statusCode, 200); assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Object.keys(r.body.records[0]).sort(), ['id', 'userId', 'name', 'userEmail', 'status', 'createdAt', 'lastUsed', 'keyLabel', 'linkedProductIds'].sort());
  const serialized = JSON.stringify(r.body); assert.doesNotMatch(serialized, /DO_NOT_LEAK|VARIANT_PAYLOAD_SECRET|linkedProducts|linkedVariantSelections|credentialHash|salt/);
  assert.deepEqual(r.body.records[0].linkedProductIds, ['p1', 'p2', 'p4', 'p3']);
  assert.equal(r.body.records[0].status, 'revoked'); assert.equal(r.body.records[0].keyLabel, 'Legacy key · Hidden');
  assert.equal(r.body.records[0].createdAt, date); assert.equal(r.body.records[0].lastUsed, null);
  assert.equal(r.body.counts.revoked, 1); assert.equal(f.state.verifications.length, 2); assert.equal(f.state.writes, 0);
});
test('v2 prefix is strictly constrained and never derived from a secret or legacy suffix', () => {
  assert.equal(inventoryRecord('a', { ...legacy, credentialVersion: 2, keyPrefix: 'daas_v2_1234abcd' }).keyLabel, 'daas_v2_1234abcd · Hidden');
  for (const keyPrefix of ['SYNTHETIC_PLAINTEXT_DO_NOT_LEAK', 'daas_v2_1234abcd.secret', null]) {
    assert.equal(inventoryRecord('a', { ...legacy, credentialVersion: 2, keyPrefix }).keyLabel, 'V2 key · Hidden');
  }
  assert.equal(inventoryRecord('a', { ...legacy, keyPrefix: 'daas_v2_1234abcd' }).keyLabel, 'Legacy key · Hidden');
});
test('timestamp formats normalize safely; absent/malformed last use differs from explicit null', () => {
  const seconds = Date.parse(date) / 1000;
  for (const value of [new Date(date), { toDate: () => new Date(date) }, date, { seconds, nanoseconds: 0 }, { _seconds: seconds, _nanoseconds: 0 }]) assert.equal(inventoryTimestamp(value), date);
  for (const value of [undefined, 'bad', '2026-02-30T00:00:00Z', '2026-10-12', '2026-10-12T06:30:00', 1234, { seconds }, { seconds, nanoseconds: -1 }]) {
    const row = inventoryRecord('a', { createdAt: value, lastUsed: value });
    assert.equal(row.createdAt, null); assert.equal(row.lastUsed, 'unavailable');
  }
  assert.equal(inventoryRecord('a', { lastUsed: null }).lastUsed, null);
  assert.equal(inventoryRecord('a', { lastUsed: '2026-10-12T14:30:00+08:00' }).lastUsed, date);
});
for (const count of [0, 200, 401]) test(`complete bounded snapshot contains every one of ${count} records and correct counts`, async () => {
  const f = fixture({ count, data: i => ({ ...legacy, status: i % 2 ? 'active' : 'revoked' }) }), r = await f.run();
  assert.equal(r.statusCode, 200); assert.equal(r.body.complete, true); assert.equal(r.body.records.length, count);
  assert.equal(r.body.counts.total, count); assert.equal(r.body.counts.active, Math.floor(count / 2));
  assert.equal(f.state.queries.length, Math.floor(count / 200) + 1); assert.equal(f.state.writes, 0);
});
test('later page failure, oversize page, record cap and byte cap return no partial data/counts', async () => {
  for (const options of [{ count: 401, failPage: 2 }, { count: 401, sizeViolation: true }, { count: 10001 }, { count: 20, data: { ...legacy, name: 'x'.repeat(300000) } }]) {
    const f = fixture(options), r = await f.run(); assert.equal(r.statusCode, 503);
    assert.equal(r.body.records, undefined); assert.equal(r.body.counts, undefined); assert.equal(f.state.writes, 0);
  }
});
test('role loss or token revocation during reads prevents releasing the snapshot', async () => {
  for (const revoked of [false, true]) {
    const f = fixture({ verify: (_token, state) => { if (state.verifications.length === 2) {
      if (revoked) throw Error('Synthetic revocation'); state.profile = { role: 'Developer' };
    } return { uid: 'admin' }; } });
    const r = await f.run(); assert.equal(r.statusCode, revoked ? 401 : 403); assert.equal(r.body.records, undefined); assert.equal(f.state.writes, 0);
  }
});
test('arbitrary paths, owner scopes and selectors are rejected; schema rejects partial/malformed responses', async () => {
  const f = fixture(); assert.equal((await f.run({ query: { collection: 'users', userId: 'other' } })).statusCode, 400);
  const valid = response([safe()]); assert.equal(validateInventoryResponse(valid), valid);
  for (const invalid of [{ ...valid, complete: false }, { ...valid, counts: { ...valid.counts, total: 9 } },
    { ...valid, records: [{ ...safe(), credentialHash: 'NEVER' }] }, { ...valid, records: [safe(), safe()] },
    { ...valid, records: [{ ...safe(), lastUsed: 'not-an-ISO-date' }] }, { ...valid, records: [{ ...safe(), keyLabel: 'raw-secret' }] },
    { ...valid, records: [{ ...safe(), keyLabel: ['daas_v2_1234abcd · Hidden'] }] }]) {
    assert.throws(() => validateInventoryResponse(invalid));
  }
});

function client() {
  const h = hooks(), b = browser(), pending = [], calls = [];
  let user = { uid: 'admin', getIdToken: async () => 'synthetic-token' };
  const hook = load('admin-panel/src/lib/use-admin-key-inventory.ts', 'useAdminKeyInventory', h, {
    './supabase/admin-auth-context': { useAdminAuth: () => ({ user }) },
    '../../../services/admin-key-inventory-contract.mjs': { validateInventoryResponse },
  }, { ...b, setInterval: () => { throw Error('Polling prohibited'); }, fetch: (url, init) => {
    calls.push({ url, init }); return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  } });
  return { h, b, pending, calls, component: ({ refresh = 0 } = {}) => hook(refresh), setUser: value => { user = value; },
    complete: (index, body = response([safe()])) => pending[index].resolve({ ok: true, json: async () => body }) };
}
test('shared reader: loading/ready/manual refresh/failure/retry; no focus/visibility polling and no stale counts', async () => {
  const f = client(); f.h.mount(f.component); assert.equal(f.h.output.status, 'loading'); await flush();
  assert.equal(f.calls[0].init.method, 'GET'); assert.equal(f.calls[0].init.cache, 'no-store'); assert.match(f.calls[0].url, /\/api\/v1\/admin\/api-keys\/inventory$/);
  f.complete(0); await flush(); assert.equal(f.h.output.status, 'ready'); assert.equal(f.h.output.records.length, 1);
  for (let i = 0; i < 10; i++) f.b.cycle(); await flush(); assert.equal(f.calls.length, 1);
  f.h.render({ refresh: 1 }); assert.equal(f.h.output.status, 'refreshing'); assert.equal(f.h.output.records.length, 1); await flush();
  f.pending[1].reject(Error('Unavailable')); await flush(); assert.equal(f.h.output.status, 'unavailable'); assert.equal(f.h.output.records.length, 0);
  f.h.render({ refresh: 2 }); await flush(); f.complete(2); await flush(); assert.equal(f.h.output.status, 'ready'); f.h.stop();
  assert.equal(f.calls.length, 3); assert.ok(f.calls.at(-1).init.signal.aborted);
});
test('refresh races, sign-out and same-UID new sessions clear old records and ignore late responses', async () => {
  const f = client(); f.h.mount(f.component); await flush(); f.complete(0); await flush();
  f.h.render({ refresh: 1 }); await flush(); f.h.render({ refresh: 2 }); await flush();
  f.complete(1); await flush(); assert.equal(f.h.output.status, 'refreshing'); f.complete(2); await flush();
  f.setUser(null); f.h.render(); assert.equal(f.h.output.records.length, 0); assert.equal(f.h.output.status, 'unavailable');
  f.setUser({ uid: 'admin', getIdToken: async () => 'different-session' }); f.h.render(); assert.equal(f.h.output.records.length, 0); assert.equal(f.h.output.status, 'loading');
  await flush(); f.complete(3); await flush(); assert.equal(f.h.output.status, 'ready'); f.h.stop();
});
test('reader fails closed on HTTP errors and incomplete payloads; pending token after unmount never makes a request', async () => {
  const f = client(); f.h.mount(f.component); await flush(); f.pending[0].resolve({ ok: false }); await flush(); assert.equal(f.h.output.status, 'unavailable');
  f.h.render({ refresh: 1 }); await flush(); f.complete(1, { ...response([safe()]), complete: false }); await flush(); assert.equal(f.h.output.status, 'unavailable'); f.h.stop();
  const delayed = client(); let finish; delayed.setUser({ uid: 'admin', getIdToken: () => new Promise(resolve => { finish = resolve; }) });
  delayed.h.mount(delayed.component); delayed.h.stop(); finish('synthetic'); await flush(); assert.equal(delayed.calls.length, 0);
});
test('inventory uses the safe reader and the removed Security Center redirects to it', () => {
  const source = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  for (const view of ['consumers']) {
    const page = source(`admin-panel/src/app/${view}/page.tsx`);
    assert.match(page, /useAdminKeyInventory/); assert.match(page, /useAccountEntitlements/);
    assert.doesNotMatch(page, /collection\(db, ["']api_keys["']\)|k\.key\b/);
  }
  assert.match(source('admin-panel/src/app/security/page.tsx'), /redirect\(['"]\/consumers['"]\)/u);
  assert.match(source('routes/admin.js'), /router\.get\('\/api-keys\/inventory'/);
  assert.match(source('services/api-key-management.js'), /where\('userId', '==', actor\.uid\)/);
});
