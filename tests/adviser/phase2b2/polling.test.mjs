import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntitlementPoller } from '../../../dashboard/src/lib/entitlement-poller.ts';

const free = { plan: 'Free', activePro: false, secondsRemaining: 0 };
const pro = { plan: 'Pro', activePro: true, secondsRemaining: 100 };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function harness() {
  let now = 0, id = 0, state;
  const timers = new Map(), pending = [], writes = [];
  const poller = createEntitlementPoller({
    read: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    onState: value => { state = value; writes.push(value); },
    schedule: (callback, delay) => { timers.set(++id, { callback, at: now + delay }); return id; },
    cancel: handle => timers.delete(handle), now: () => now,
  });
  return { poller, timers, pending, writes, get state() { return state; },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
        assert.ok(timers.size <= 1, 'only one timer can be owned');
      }
      now = target; await flush();
    },
  };
}

test('polling A: normal response leaves exactly one future refresh', async () => {
  const h = harness(); h.poller.start(); await h.advance(0);
  assert.equal(h.timers.size, 1); h.pending[0].resolve(pro); await flush();
  assert.equal(h.state, pro); assert.equal(h.timers.size, 1);
  await h.advance(30000); assert.equal(h.pending.length, 2); assert.equal(h.timers.size, 1);
});
for (const label of ['manual', 'payment-triggered']) test(`polling B/C: ${label} overlap discards stale poll without losing scheduling`, async () => {
  const h = harness(); h.poller.start(); await h.advance(0);
  const latest = h.poller.refresh(); h.pending[1].resolve(pro); assert.equal(await latest, pro);
  // Exact former failure: manual/payment result wins, old poll resolves last.
  h.pending[0].resolve(free); await flush();
  assert.equal(h.state, pro); assert.equal(h.timers.size, 1);
  await h.advance(30000); assert.equal(h.pending.length, 3);
});
test('polling D: two rapid manual refreshes retain only the newest state', async () => {
  const h = harness(); h.poller.start();
  const first = h.poller.refresh(), second = h.poller.refresh();
  h.pending[1].resolve(free); assert.equal(await second, free);
  h.pending[0].resolve(pro); assert.equal(await first, null);
  assert.equal(h.state, free); assert.equal(h.timers.size, 1);
});
test('polling E: generation change before poll resolves still has a timer while newest request is pending', async () => {
  const h = harness(); h.poller.start(); await h.advance(0);
  const latest = h.poller.refresh(); h.pending[0].resolve(pro); await flush();
  assert.equal(h.state, null); assert.equal(h.timers.size, 1);
  h.pending[1].resolve(free); await latest; assert.equal(h.state, free); assert.equal(h.timers.size, 1);
});
for (const reason of ['sign out', 'unmount']) test(`polling F/G: ${reason} cancels timer and suppresses in-flight writes`, async () => {
  const h = harness(); h.poller.start(); await h.advance(0); h.poller.stop();
  const writes = h.writes.length; h.pending[0].resolve(pro); await flush();
  assert.equal(h.timers.size, 0); assert.equal(h.writes.length, writes);
  assert.equal(await h.poller.refresh(), null); await h.advance(120000); assert.equal(h.pending.length, 1);
});
test('polling H: re-login/restart creates exactly one chain and rejects prior-session results', async () => {
  const h = harness(); h.poller.start(); await h.advance(0); h.poller.stop();
  h.poller.start(); h.poller.start(); assert.equal(h.timers.size, 1); await h.advance(0);
  h.pending[1].resolve(free); await flush(); h.pending[0].resolve(pro); await flush();
  assert.equal(h.state, free); assert.equal(h.timers.size, 1);
  await h.advance(30000); assert.equal(h.pending.length, 3); assert.equal(h.timers.size, 1);
});
test('polling I: server expiry boundary eventually displays authoritative Free without reload', async () => {
  const h = harness(); h.poller.start(); await h.advance(0); await h.advance(250);
  h.pending[0].resolve({ ...pro, secondsRemaining: 1 }); await flush();
  await h.advance(749); assert.equal(h.pending.length, 1);
  await h.advance(1); assert.equal(h.pending.length, 2); assert.equal(h.state, null);
  h.pending[1].resolve(free); await flush(); assert.equal(h.state, free); assert.equal(h.timers.size, 1);
});
test('polling: rejected verification remains unverified with one retry timer', async () => {
  const h = harness(); h.poller.start(); await h.advance(0); h.pending[0].reject(Error('offline')); await flush();
  assert.equal(h.state, null); assert.equal(h.timers.size, 1); await h.advance(30000); assert.equal(h.pending.length, 2);
});
test('polling: stale rejection cannot clear newer successful entitlement', async () => {
  const h = harness(); h.poller.start(); await h.advance(0); const latest = h.poller.refresh();
  h.pending[1].resolve(free); await latest; h.pending[0].reject(Error('stale failure')); await flush();
  assert.equal(h.state, free); assert.equal(h.timers.size, 1);
});
test('polling: unresolved I/O cannot remove the future retry', async () => {
  const h = harness(); h.poller.start(); await h.advance(0); await h.advance(30000);
  assert.equal(h.pending.length, 2); assert.equal(h.timers.size, 1); h.poller.stop();
});
