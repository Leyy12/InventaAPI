import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminTrafficHandler, trafficRecord } from '../../../services/admin-traffic.js';
import { telemetryReport } from '../../../services/reporting.js';
import { invoke } from '../phase2a/memory-firestore.mjs';

const row = (id, extra = {}) => ({ id, timestamp: new Date('2026-09-22T12:00:00Z'), success: true, latencyMs: 10, ...extra });
function setup(records = [], account = { role: 'Admin' }, options = {}) {
  const calls = []; let reads = 0;
  const db = { collection(name) {
    if (name === 'users') return { doc(uid) { assert.equal(uid, 'admin-a'); return { async get() {
      if (options.profileError) throw new Error('private project path');
      reads++; return { data: () => reads > 1 && 'after' in options ? options.after : account };
    } }; } };
    assert.equal(name, 'api_telemetry'); let bound;
    const q = {
      orderBy(field, direction) { calls.push(['orderBy', field, direction]); return q; },
      limit(value) { calls.push(['limit', value]); bound = value; return q; },
      async get() {
        if (options.queryError) throw new Error('https://console.firebase.google.com/project/private/index secret-stack');
        assert.equal(bound, 500, 'database bound before read');
        const sorted = records.filter(r => r.timestamp !== undefined).toSorted((a, b) => Number(b.timestamp) - Number(a.timestamp) || b.id.localeCompare(a.id));
        return { docs: (options.overflow ? sorted : sorted.slice(0, bound)).map(r => ({ id: r.id, data: () => r })) };
      },
    }; return q;
  } };
  return { calls, handler: createAdminTrafficHandler({ getDb: () => db, documentId: '__name__', verifyIdToken: async (token, revoked) => {
    assert.equal(revoked, true);
    if (token !== 'owner-token') throw new Error('invalid/revoked/disabled token');
    // Client/token role does not grant or deny the authoritative profile role.
    return { uid: 'admin-a', role: 'Customer', admin: false };
  } }) };
}
for (const token of [null, 'invalid', 'revoked', 'disabled']) test('auth denied: ' + token, async () => {
  const { handler, calls } = setup();
  assert.equal((await invoke(handler, { token })).statusCode, 401); assert.deepEqual(calls, []);
});
for (const authorization of ['Basic abc', 'Bearer ', 'Bearer one two']) test('malformed bearer: ' + authorization, async () => {
  assert.equal((await invoke(setup().handler, { headers: { authorization } })).statusCode, 401);
});
for (const uid of [undefined, '', '../admin', 'a/b', '__bad__']) test('invalid verified UID: ' + uid, async () => {
  const handler = createAdminTrafficHandler({ getDb: () => { throw new Error('must not read'); }, verifyIdToken: async () => ({ uid }), documentId: '__name__' });
  assert.equal((await invoke(handler)).statusCode, 401);
});
for (const account of [null, {}, { role: 'Developer' }, { role: 'Consumer' }, { role: 'Business' }, { role: 123 },
  ...[{ disabled: true }, { deleted: true }, { deletedAt: 'yesterday' }, { deletionRequested: true },
    { status: 'deleting' }, { status: 'deleted' }, { status: 'disabled' }, { status: 'pending_deletion' },
    { accountState: 'blocked' }, { plan: 'Deleted' }].map(barrier => ({ role: 'Admin', ...barrier }))]) {
  test('server account denies ' + JSON.stringify(account), async () => {
    const { handler, calls } = setup([], account);
    const result = await invoke(handler); assert.equal(result.statusCode, 403); assert.deepEqual(calls, []);
    assert.equal(result.body.records, undefined);
  });
}
for (const role of ['Admin', 'admin', 'ADMIN']) test('authoritative Admin accepted: ' + role, async () => {
  const { handler, calls } = setup([row('a')], { role }); const result = await invoke(handler);
  assert.equal(result.statusCode, 200); assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(calls, [['orderBy', 'timestamp', 'desc'], ['orderBy', '__name__', 'desc'], ['limit', 500]]);
  assert.deepEqual(result.body, { success: true, records: [{ timestamp: '2026-09-22T12:00:00.000Z', success: true, latencyMs: 10 }], limit: 500 });
});
for (const location of ['query', 'body']) for (const field of ['uid', 'role', 'admin', 'limit', 'cursor', 'accountId', 'keyId']) {
  test('reject caller authority/filter: ' + location + '.' + field, async () => {
    const { handler, calls } = setup(); assert.equal((await invoke(handler, { [location]: { [field]: 'forged' } })).statusCode, 400);
    assert.deepEqual(calls, []);
  });
}
for (const after of [null, { role: 'Customer' }, { role: 'Admin', disabled: true }, { role: 'Admin', deletionRequested: true }]) {
  test('role/barrier rechecked after sample: ' + JSON.stringify(after), async () => {
    const result = await invoke(setup([row('a')], undefined, { after }).handler);
    assert.equal(result.statusCode, 403); assert.equal(result.body.records, undefined);
  });
}
test('empty telemetry is genuine empty success', async () => {
  assert.deepEqual((await invoke(setup().handler)).body, { success: true, records: [], limit: 500 });
});
test('actual database limit caps 700 records at latest 500', async () => {
  const rows = Array.from({ length: 700 }, (_, i) => row(String(i), { timestamp: new Date(1000 * i), latencyMs: i }));
  const result = await invoke(setup(rows).handler);
  assert.equal(result.body.records.length, 500);
  assert.equal(result.body.records[0].latencyMs, 699); assert.equal(result.body.records.at(-1).latencyMs, 200);
});
test('newest first, descending ID ties and no IDs exposed', async () => {
  const records = (await invoke(setup([row('a', { latencyMs: 1 }), row('z', { latencyMs: 2 }),
    row('old', { timestamp: new Date('2025-01-01'), latencyMs: 3 })]).handler)).body.records;
  assert.deepEqual(records.map(r => r.latencyMs), [2, 1, 3]); assert.ok(records.every(r => !('id' in r)));
});
test('database invariant failure is not silently truncated', async () => {
  assert.equal((await invoke(setup(Array.from({ length: 501 }, (_, i) => row(String(i))), undefined, { overflow: true }).handler)).statusCode, 503);
});
for (const extra of [{}, { timestamp: null }, { timestamp: 'bad' }, { timestamp: 123 }, { timestamp: {} },
  { timestamp: new Date(NaN) }, { timestamp: { toDate() { throw new Error('bad timestamp'); } } }]) {
  test('malformed/missing timestamp safe: ' + JSON.stringify(extra), () => {
    assert.equal(trafficRecord(extra).timestamp, null);
  });
}
test('R4 Date, Timestamp and legacy recorded string support retained', () => {
  const date = new Date('2026-09-22T01:00:00Z');
  for (const timestamp of [date, { toDate: () => date }, date.toISOString()]) assert.equal(trafficRecord({ timestamp }).timestamp, date.toISOString());
});
for (const latencyMs of [NaN, Infinity, -1, '10', {}, undefined]) test('malformed latency remains unknown: ' + latencyMs, () => {
  assert.equal(trafficRecord({ latencyMs }).latencyMs, null);
});
test('minimal projection withholds every arbitrary/sensitive field', () => {
  const record = trafficRecord(row('credential-as-id', { apiKeyId: 'secret', userId: 'private', ip: 'private', userAgent: 'private',
    key: 'secret', credentialHash: 'secret', selector: 'secret', secret: 'secret', idToken: 'secret', refreshToken: 'secret',
    Authorization: 'secret', headers: { authorization: 'secret' }, request: 'private', payment: 'private', stack: 'private', env: 'private',
    endpoint: '/catalog', method: 'GET', statusCode: 200 }));
  assert.deepEqual(Object.keys(record), ['timestamp', 'success', 'latencyMs']); assert.doesNotMatch(JSON.stringify(record), /secret|private/);
});
test('projection retains R4 calculations, invalid exclusions and unknown values', () => {
  const raw = [row('a'), row('b', { success: false, latencyMs: 30 }), row('c', { timestamp: 'bad' }), row('d', { success: 'true', latencyMs: Infinity })];
  assert.deepEqual(telemetryReport(raw.map(trafficRecord)), telemetryReport(raw));
  assert.equal(telemetryReport(raw.map(trafficRecord)).averageLatency, 20);
});
for (const options of [{ queryError: true }, { profileError: true }]) test('sanitized unavailable errors: ' + JSON.stringify(options), async () => {
  const result = await invoke(setup([], undefined, options).handler);
  assert.equal(result.statusCode, 503); assert.equal(result.body.code, 'ADMIN_TRAFFIC_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result.body), /firebase|project|stack|secret|https:|index/); assert.equal(result.body.records, undefined);
});
