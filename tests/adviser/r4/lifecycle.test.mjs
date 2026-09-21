import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuotaRefresh } from '../../../dashboard/src/lib/quota-refresh.ts';
import { createEntitlementPoller } from '../../../dashboard/src/lib/entitlement-poller.ts';
import { quotaVerificationKey, quotaSummary, reconcileReportSession, activeKeyHolders } from '../../../services/reporting.js';

const NOW = new Date('2026-09-20T10:00:00Z');
const free = { plan: 'Free', apiRequestLimit: 50, activePro: false, secondsRemaining: 0, serverTime: NOW.toISOString() };
const pro = { ...free, plan: 'Pro', apiRequestLimit: 5000, activePro: true, secondsRemaining: 3600 };
const response = (limit, used = 10) => ({ keys: [], usage: { scope: 'account', used, limit, window: '2026-09-20', resetsAt: '2026-09-21T00:00:00.000Z' } });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function clock() {
  let now = 0, id = 0; const timers = new Map();
  return { timers, now: () => now, schedule: (callback, delay) => { timers.set(++id, { callback, at: now + delay }); return id; },
    cancel: id => timers.delete(id), async advance(ms) {
      const end = now + ms;
      for (;;) { const next = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0]; if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback(); await flush(); }
      now = end; await flush();
    } };
}
// Models the exact keyed Usage boundary with the production request controller.
function quotaHarness() {
  const c = clock(), reads = []; let key = null, controller, source = null;
  return { c, reads, get source() { return source; }, get summary() { return quotaSummary(source?.usage, NOW); },
    verify(uid, entitlement) {
      const next = quotaVerificationKey(uid, entitlement);
      if (next === key) return;
      controller?.stop(); source = null; key = next;
      if (!key) return;
      controller = createQuotaRefresh({ schedule: c.schedule, cancel: c.cancel,
        read: signal => new Promise((resolve, reject) => reads.push({ signal, resolve, reject })), onState: value => { source = value; } });
      controller.start();
    } };
}
for (const [name, state, limit] of [['Free', free, 50], ['Pro', pro, 5000]]) test('quota lifecycle uses authoritative '+name+' response', async () => {
  const h = quotaHarness(); h.verify('a', state); await flush(); h.reads[0].resolve(response(limit)); await flush();
  assert.equal(h.summary.limit, limit); assert.equal(h.summary.remaining, limit - 10); assert.equal(h.c.timers.size, 0);
});
for (const [before, after] of [[pro, free], [free, pro]]) test(`quota ${before.plan} -> ${after.plan} invalidates before fresh response`, async () => {
  const h = quotaHarness(); h.verify('a', before); await flush(); h.reads[0].resolve(response(before.apiRequestLimit)); await flush();
  assert.equal(h.summary.limit, before.apiRequestLimit);
  h.verify('a', after); assert.equal(h.summary, null); assert.equal(h.source.status, 'loading'); await flush();
  h.reads[1].resolve(response(after.apiRequestLimit)); await flush(); assert.equal(h.summary.limit, after.apiRequestLimit);
});
test('hanging entitlement verification hides old Pro quota indefinitely, without inventing Free', async () => {
  const h = quotaHarness(); h.verify('a', pro); await flush(); h.reads[0].resolve(response(5000)); await flush();
  h.verify('a', null); await h.c.advance(120000); assert.equal(h.summary, null); assert.equal(h.source, null); assert.equal(h.reads.length, 1);
});
test('hanging quota request times out; old response is discarded and only one bounded retry exists', async () => {
  const h = quotaHarness(); h.verify('a', pro); await flush(); await h.c.advance(10000);
  assert.equal(h.source.status, 'error'); assert.equal(h.summary, null); assert.equal(h.reads[0].signal.aborted, true);
  h.reads[0].resolve(response(5000)); await flush(); assert.equal(h.source.status, 'error');
  await h.c.advance(29999); assert.equal(h.reads.length, 1); await h.c.advance(1); assert.equal(h.reads.length, 2);
  h.reads[1].resolve(response(50)); await flush(); assert.equal(h.summary.limit, 50); assert.equal(h.c.timers.size, 0);
});
test('quota error is unavailable, not zero; retry clears error intentionally', async () => {
  const h = quotaHarness(); h.verify('a', free); await flush(); h.reads[0].reject(Error('offline')); await flush();
  assert.deepEqual(h.source, { status: 'error', count: null, usage: null }); assert.equal(h.summary, null);
  await h.c.advance(30000); assert.equal(h.source.status, 'loading'); h.reads[1].resolve(response(50, 0)); await flush(); assert.equal(h.summary.used, 0);
});
test('same UID fresh verification revision triggers one new quota read', async () => {
  const h = quotaHarness(); h.verify('a', free); await flush(); h.verify('a', { ...free, serverTime: '2026-09-20T10:00:30Z' }); await flush();
  assert.equal(h.reads.length, 2); assert.equal(h.reads[0].signal.aborted, true);
  h.reads[0].resolve(response(5000)); await flush(); assert.equal(h.summary, null);
});
test('same UID unrelated rerenders do not create requests or timer loops', async () => {
  const h = quotaHarness(); for (let i=0;i<10;i++) h.verify('a', { ...free }); await flush(); assert.equal(h.reads.length, 1);
  h.reads[0].resolve(response(50)); await flush(); await h.c.advance(90000); assert.equal(h.reads.length, 1);
});
test('quota logout/account switch cancels prior request and rejects late account data', async () => {
  const h = quotaHarness(); h.verify('a', pro); await flush(); h.verify(null, null); h.verify('b', free); await flush();
  h.reads[0].resolve(response(5000)); await flush(); assert.equal(h.summary, null);
  h.reads[1].resolve(response(50)); await flush(); assert.equal(h.summary.limit, 50);
});
for (const [limit, used, remaining] of [[50, 100, 0], [null, 100, null], [0, 0, 0]]) test('quota lifecycle numeric edge '+limit, async () => {
  const h = quotaHarness(); h.verify('a', free); await flush(); h.reads[0].resolve(response(limit, used)); await flush();
  assert.equal(h.summary.remaining, remaining); assert.ok(h.summary.percent === null || Number.isFinite(h.summary.percent));
});
test('actual entitlement poller drives one quota request per completed verification, no duplicate success loop', async () => {
  const c = clock(), h = quotaHarness(), verifications = [];
  const poller = createEntitlementPoller({ schedule: c.schedule, cancel: c.cancel, now: c.now,
    read: () => new Promise(resolve => verifications.push(resolve)), onState: state => h.verify('a', state) });
  poller.start(); await c.advance(0); verifications[0](pro); await flush(); h.reads[0].resolve(response(5000)); await flush();
  await c.advance(30000); assert.equal(h.summary, null); assert.equal(h.reads.length, 1);
  verifications[1]({ ...pro, serverTime: '2026-09-20T10:00:30Z' }); await flush(); assert.equal(h.reads.length, 2);
  poller.stop(); h.verify(null, null); assert.equal(c.timers.size, 0); assert.equal(h.c.timers.size, 0);
});
for (const selected of ['Grocery', 'Pharmacy', 'Hardware', 'All']) test('same Pro account retains '+selected+' and listener through verification', () => {
  let state = { ...reconcileReportSession(null, 'a', 'Pro', null), selection: selected };
  const pending = reconcileReportSession(state, 'a', undefined, null);
  assert.equal(pending.selection, selected); assert.equal(pending.loadCatalog, true); assert.equal(pending.scope.segment, null);
  state = reconcileReportSession(pending, 'a', 'Pro', null); assert.equal(state.selection, selected); assert.equal(state.loadCatalog, true);
  assert.equal(reconcileReportSession(state, 'a', 'Pro', null), state);
});
for (const preference of ['Grocery', 'Pharmacy', 'Hardware']) test('Pro All downgrade immediately constrains to '+preference, () => {
  const state = reconcileReportSession(reconcileReportSession(null, 'a', 'Pro', null), 'a', 'Free', preference);
  assert.equal(state.selection, preference); assert.equal(state.scope.restricted, true); assert.equal(state.loadCatalog, true);
});
for (const preference of [undefined, null, '', 'invalid']) test('downgrade missing/invalid preference never displays All: '+preference, () => {
  const state = reconcileReportSession(reconcileReportSession(null, 'a', 'Pro', null), 'a', 'Free', preference);
  assert.equal(state.scope.segment, null); assert.equal(state.scope.state, 'preference_required'); assert.equal(state.loadCatalog, false);
  assert.equal(reconcileReportSession(null, 'a', 'Free', preference).loadCatalog, false);
});
test('logout and UID switch reset selection and never inherit another account dataset', () => {
  const old = { ...reconcileReportSession(null, 'a', 'Pro', null), selection: 'Hardware' };
  const loggedOut = reconcileReportSession(old, null, undefined, null); assert.equal(loggedOut.loadCatalog, false);
  assert.equal(reconcileReportSession(loggedOut, 'a', 'Pro', null).selection, 'All');
  assert.equal(reconcileReportSession(old, 'b', 'Pro', null).selection, 'All');
  assert.equal(reconcileReportSession(old, 'b', undefined, null).loadCatalog, false);
});
const ready = records => ({ status: 'ready', records });
const owners = ready([{ id: 'a' }, { id: 'b' }, { id: 'unused-customer' }]);
const key = (userId, status = 'active', extra = {}) => ({ userId, status, ...extra });
for (const [name, keys, expected] of [
  ['empty', [], 0], ['one', [key('a')], 1], ['multiple keys one owner', [key('a'), key('a')], 1],
  ['two owners', [key('a'), key('b')], 2], ['inactive and revoked', [key('a','revoked'), key('b','inactive')], 0],
  ['legacy and v2 deduplicate', [key('a','active',{key:'synthetic'}), key('a','active',{credentialVersion:2})], 1],
  ['missing/malformed/orphan owner', [key(null), key(''), key({}), key(' a'), key('a/b'), key('missing')], 0],
  ['status metric does not invent expiry semantics', [key('a','active',{expiresAt:'2000-01-01'})], 1],
]) test('distinct active key holders: '+name, () => assert.equal(activeKeyHolders(ready(keys), owners), expected));
for (const field of [{ deleted:true }, { deletedAt:'2026-01-01' }, { disabled:true }, { accountState:'deleted' }, { deletionRequested:true }, { status:'pending_deletion' }, { plan:'Deleted' }]) {
  test('known blocked/deleted owner excluded '+JSON.stringify(field), () => assert.equal(activeKeyHolders(ready([key('a')]), ready([{id:'a',...field}])), 0));
}
for (const status of ['loading','error']) test('key/account '+status+' is unavailable, not measured zero', () => {
  assert.equal(activeKeyHolders({status,records:[]},owners), null);
  assert.equal(activeKeyHolders(ready([key('a')]),{status,records:[]}), null);
});
test('customer account count never substitutes for active-holder count', () => assert.equal(activeKeyHolders(ready([key('a')]), owners), 1));
