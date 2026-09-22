import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrafficRefresh, createTrafficRequest } from '../../../admin-panel/src/lib/admin-traffic.ts';
import { telemetryReport } from '../../../services/reporting.js';
const row = { timestamp: '2026-09-22T12:00:00.000Z', success: true, latencyMs: 20 };
const payload = (records = [row]) => ({ success: true, records, limit: 500 });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(read, current = () => true) {
  const states = []; let timeout; const cancelled = [];
  const gate = createTrafficRefresh(read, state => states.push(state), { current,
    schedule(fn, ms) { assert.equal(ms, 10000); timeout = fn; return 1; }, cancel(id) { cancelled.push(id); } });
  return { gate, states, cancelled, timeout: () => timeout() };
}
test('loading then data drives unchanged actual R4 report', async () => {
  const task = deferred(); const { gate, states } = setup(() => task.promise); const pending = gate.refresh();
  assert.deepEqual(states, [{ status: 'loading', records: [] }]);
  task.resolve(payload()); await pending;
  assert.equal(states.at(-1).status, 'ready'); assert.equal(telemetryReport(states.at(-1).records).recorded, 1);
  gate.stop();
});
test('empty ready state is distinct from failure', async () => {
  const { gate, states } = setup(async () => payload([])); await gate.refresh();
  assert.deepEqual(states.at(-1), { status: 'ready', records: [] }); gate.stop();
});
test('failure clears previous sample and never publishes ready zero', async () => {
  let fail = false; const { gate, states } = setup(async () => { if (fail) throw new Error('private server message'); return payload(); });
  await gate.refresh(); fail = true; await gate.refresh();
  assert.deepEqual(states.map(s => s.status), ['loading', 'ready', 'loading', 'error']);
  assert.deepEqual(states.at(-1).records, []); assert.doesNotMatch(JSON.stringify(states), /private/); gate.stop();
});
test('manual retry recovers from failure without auth changes', async () => {
  let count = 0; const { gate, states } = setup(async () => { if (++count === 1) throw new Error('network'); return payload(); });
  await gate.refresh(); await gate.refresh(); assert.equal(count, 2); assert.equal(states.at(-1).status, 'ready'); gate.stop();
});
test('overlapping refresh aborts older request and newest wins', async () => {
  const first = deferred(), second = deferred(); const signals = []; let n = 0;
  const { gate, states } = setup(signal => { signals.push(signal); return ++n === 1 ? first.promise : second.promise; });
  const a = gate.refresh(), b = gate.refresh(); assert.equal(signals[0].aborted, true);
  second.resolve(payload([{ ...row, latencyMs: 99 }])); await b; first.resolve(payload()); await a;
  assert.equal(states.at(-1).records[0].latencyMs, 99); assert.equal(states.filter(s => s.status === 'ready').length, 1); gate.stop();
});
for (const outcome of ['resolve', 'reject']) for (const reason of ['logout', 'account switch', 'unmount']) {
  test(`late ${outcome} ignored after ${reason}`, async () => {
    let current = true; const task = deferred();
    const { gate, states } = setup(() => task.promise, () => current); const pending = gate.refresh();
    if (reason === 'unmount') gate.stop(); else current = false;
    task[outcome](outcome === 'resolve' ? payload() : new Error('late error')); await pending;
    assert.deepEqual(states, [{ status: 'loading', records: [] }]); gate.stop();
  });
}
test('stopped controller cannot restart or publish on deferred mount task', async () => {
  let reads = 0; const { gate, states } = setup(async () => { reads++; return payload(); });
  gate.stop(); await gate.refresh(); assert.equal(reads, 0); assert.deepEqual(states, []);
});
test('timeout fails closed and ignores late success', async () => {
  const task = deferred(); let signal; const { gate, states, timeout } = setup(s => { signal = s; return task.promise; });
  const pending = gate.refresh(); timeout(); assert.equal(signal.aborted, true); assert.equal(states.at(-1).status, 'error');
  task.resolve(payload()); await pending; assert.equal(states.at(-1).status, 'error'); gate.stop();
});
test('retry after timeout cannot be overwritten by old success', async () => {
  const first = deferred(); let n = 0; const { gate, states, timeout } = setup(() => ++n === 1 ? first.promise : Promise.resolve(payload([])));
  const pending = gate.refresh(); timeout(); await gate.refresh(); first.resolve(payload()); await pending;
  assert.deepEqual(states.at(-1), { status: 'ready', records: [] }); gate.stop();
});
test('timer after session change cannot publish stale error', async () => {
  const task = deferred(); let current = true; const { gate, states, timeout } = setup(() => task.promise, () => current);
  const pending = gate.refresh(); current = false; timeout(); task.resolve(payload()); await pending;
  assert.equal(states.length, 1); gate.stop();
});
for (const bad of [null, {}, { ...payload(), success: false }, { ...payload(), limit: 50 }, payload(Array(501).fill(row)),
  payload([null]), payload([{ ...row, timestamp: 'bad' }]), payload([{ ...row, success: 'yes' }]),
  payload([{ ...row, latencyMs: Infinity }]), payload([{ ...row, latencyMs: -1 }])]) {
  test('invalid response fails closed: ' + JSON.stringify(bad)?.slice(0, 100), async () => {
    const { gate, states } = setup(async () => bad); await gate.refresh(); assert.equal(states.at(-1).status, 'error'); gate.stop();
  });
}
test('unknown measures remain null and extras never reach component state', async () => {
  const { gate, states } = setup(async () => payload([{ timestamp: null, success: null, latencyMs: null, secret: 'private' }]));
  await gate.refresh(); assert.deepEqual(states.at(-1).records, [{ timestamp: null, success: null, latencyMs: null }]); gate.stop();
});
test('request uses session Bearer header, fixed route, no credential URL and no cache', async () => {
  const signal = new AbortController().signal; let called = false;
  const read = createTrafficRequest({ base: 'https://api.example.invalid/', token: async () => 'synthetic-token', current: () => true,
    fetcher: async (url, init) => { called = true; assert.equal(url, 'https://api.example.invalid/api/v1/admin/traffic');
      assert.deepEqual(init.headers, { Authorization: 'Bearer synthetic-token' }); assert.equal(init.signal, signal); assert.equal(init.cache, 'no-store');
      return { ok: true, json: async () => payload() }; } });
  assert.deepEqual(await read(signal), payload()); assert.equal(called, true);
});
for (const status of [401, 403, 404, 500, 503]) test('HTTP ' + status + ' is a report error without auth side effects or raw error body', async () => {
  const read = createTrafficRequest({ base: 'https://api.example.invalid', token: async () => 'fake', current: () => true,
    fetcher: async () => ({ ok: false, status, json: async () => { throw new Error('raw response must not be consumed'); } }) });
  const { gate, states } = setup(read); await gate.refresh(); assert.equal(states.at(-1).status, 'error'); gate.stop();
});
test('session switch while awaiting token prevents old-token transmission', async () => {
  const token = deferred(); let current = true, calls = 0;
  const read = createTrafficRequest({ base: 'https://api.example.invalid', token: () => token.promise, current: () => current,
    fetcher: async () => { calls++; return { ok: true, json: async () => payload() }; } });
  const pending = read(new AbortController().signal); current = false; token.resolve('old-token');
  await assert.rejects(pending); assert.equal(calls, 0);
});
for (const mode of ['missing config', 'signed out', 'aborted']) test('no request for ' + mode, async () => {
  let tokens = 0; const controller = new AbortController(); if (mode === 'aborted') controller.abort();
  const read = createTrafficRequest({ base: mode === 'missing config' ? '' : 'https://api.example.invalid', current: () => mode !== 'signed out',
    token: async () => { tokens++; return 'fake'; }, fetcher: async () => { throw new Error('must not request'); } });
  await assert.rejects(read(controller.signal)); assert.equal(tokens, 0);
});
