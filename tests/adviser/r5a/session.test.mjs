import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthSession, createLogoutAction, authScreen, verifyWithin } from '../../../services/auth-navigation.ts';
function harness() {
  const pending = [], states = [], rejected = [], timers = new Map();
  let timerId = 0;
  const gate = createAuthSession({
    readProfile: user => new Promise((resolve, reject) => pending.push({ user, resolve, reject })),
    publish: state => states.push(state), rejected: user => rejected.push(user),
    schedule: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    cancel: id => timers.delete(id),
  });
  return { gate, pending, states, rejected, timers, latest: () => states.at(-1),
    timeout: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); } };
}
const profile = { role: 'Developer', plan: 'Free' };
test('restoration retains SDK identity but publishes no authorized profile before verification', async () => {
  const h = harness(), user = { uid: 'a' }, work = h.gate.accept(user);
  assert.deepEqual(h.latest(), { user, profile: null, loading: true, status: 'initializing' });
  h.pending[0].resolve(profile); await work;
  assert.deepEqual(h.latest(), { user, profile, loading: false, status: 'verified' }); assert.equal(h.timers.size, 0);
});
test('unauthenticated initialization settles immediately without profile reads', async () => {
  const h = harness(); await h.gate.accept(null);
  assert.deepEqual(h.latest(), { user: null, profile: null, loading: false, status: 'unauthenticated' }); assert.equal(h.pending.length, 0); assert.equal(h.timers.size, 0);
});
test('missing SDK callback times out closed, never spins forever', () => {
  const h = harness(); h.timeout(); assert.equal(h.latest().loading, false); assert.deepEqual(h.rejected, []); assert.equal(h.latest().status, 'unverified');
});
test('hung server profile read times out; late success cannot restore dashboard', async () => {
  const h = harness(), work = h.gate.accept({ uid: 'a' }); h.timeout();
  h.pending[0].resolve(profile); await work;
  assert.equal(h.latest().profile, null); assert.equal(h.latest().status, 'unverified'); assert.equal(h.latest().loading, false); assert.equal(h.rejected.length, 0);
});
for (const bad of [null, {}, { role: 'Developer', deleted: true }, { role: 'Admin', disabled: true }]) {
  test(`invalid profile fails closed: ${JSON.stringify(bad)}`, async () => {
    const h = harness(), work = h.gate.accept({ uid: 'a' }); h.pending[0].resolve(bad); await work;
    assert.equal(h.latest().profile, null); assert.equal(h.latest().status, 'denied'); assert.equal(h.latest().loading, false); assert.equal(h.rejected.length, 1);
  });
}
test('permission/network rejection cannot retain cached profile', async () => {
  const h = harness(), work = h.gate.accept({ uid: 'a' }); h.pending[0].reject(Error('denied')); await work;
  assert.equal(h.latest().profile, null); assert.equal(h.latest().user.uid, 'a'); assert.equal(h.latest().status, 'unverified'); assert.equal(h.latest().loading, false);
});
test('logout invalidates outstanding profile reads', async () => {
  const h = harness(), work = h.gate.accept({ uid: 'a' }); h.gate.invalidate('a');
  h.pending[0].resolve(profile); await work;
  assert.equal(h.latest().user, null); assert.equal(h.timers.size, 0);
});
test('explicit invalidation cannot reopen protected UI from a stale same-user token event', async () => {
  const h = harness(); h.gate.invalidate('a'); await h.gate.accept({ uid: 'a' });
  assert.equal(h.pending.length, 0); assert.equal(h.latest().profile, null); assert.equal(h.latest().status, 'denied');
});
test('new successful login after null event can establish a fresh session', async () => {
  const h = harness(); h.gate.invalidate('a'); await h.gate.accept(null);
  const work = h.gate.accept({ uid: 'a' }); h.pending[0].resolve(profile); await work;
  assert.equal(h.latest().user.uid, 'a');
});
test('older account read cannot overwrite a newer account', async () => {
  const h = harness(), a = h.gate.accept({ uid: 'a' }), b = h.gate.accept({ uid: 'b' });
  h.pending[1].resolve(profile); await b; h.pending[0].resolve(profile); await a;
  assert.equal(h.latest().user.uid, 'b');
});
test('older account error cannot sign out a newer account', async () => {
  const h = harness(), a = h.gate.accept({ uid: 'a' }), b = h.gate.accept({ uid: 'b' });
  h.pending[1].resolve(profile); await b; h.pending[0].reject(Error('expired')); await a;
  assert.equal(h.latest().user.uid, 'b'); assert.equal(h.rejected.length, 0);
});
test('cross-tab auth-null event invalidates outstanding restoration', async () => {
  const h = harness(), work = h.gate.accept({ uid: 'a' }); await h.gate.accept(null);
  h.pending[0].resolve(profile); await work; assert.equal(h.latest().user, null);
});
test('unmount cancels timers and ignores late result', async () => {
  const h = harness(), work = h.gate.accept({ uid: 'a' }); h.gate.stop();
  const count = h.states.length; h.pending[0].resolve(profile); await work;
  await h.gate.accept({ uid: 'b' }); assert.equal(h.states.length, count); assert.equal(h.timers.size, 0);
});

for (const error of [Error('offline'), { status: 500 }, { status: 503 }, { status: 404 }, { status: 429 }]) {
  test(`transient verification ${error.status || 'network'} preserves identity and retries same UID`, async () => {
    const h = harness(), user = { uid: 'same' }, first = h.gate.accept(user);
    h.pending[0].reject(error); await first;
    assert.equal(h.latest().user, user); assert.equal(h.latest().profile, null);
    assert.equal(h.latest().status, 'unverified'); assert.equal(h.rejected.length, 0);
    assert.equal(h.gate.isVerified(user), false); assert.equal(authScreen(h.latest().status), 'retry');
    const retry = h.gate.retry(); h.pending[1].resolve(profile); await retry;
    assert.equal(h.latest().status, 'verified'); assert.equal(h.gate.isVerified(user), true);
  });
}
for (const [error, status] of [[{ status: 401 }, 'invalid'], [{ status: 403 }, 'denied'],
  [{ code: 'auth/user-token-expired' }, 'invalid'], [{ code: 'auth/user-disabled' }, 'denied']]) {
  test(`confirmed rejection ${JSON.stringify(error)} is not a transient failure`, async () => {
    const h = harness(), work = h.gate.accept({ uid: 'a' }); h.pending[0].reject(error); await work;
    assert.equal(h.latest().status, status); assert.equal(h.latest().profile, null); assert.equal(h.rejected.length, 1);
  });
}
test('timeout A, retry B, and late A cannot authorize or overwrite B', async () => {
  const h = harness(), user = { uid: 'same' }, a = h.gate.accept(user); h.timeout(); await a;
  assert.equal(h.latest().user, user); assert.equal(h.latest().status, 'unverified');
  const b = h.gate.retry(); h.pending[0].resolve({ role: 'Admin' }); await Promise.resolve();
  assert.equal(h.latest().status, 'initializing'); assert.equal(h.latest().profile, null);
  h.pending[1].resolve(profile); await b; assert.deepEqual(h.latest().profile, profile);
});
test('concurrent verification and Retry share one active attempt', async () => {
  const h = harness(), user = { uid: 'a' }, a = h.gate.accept(user);
  assert.equal(h.gate.accept(user), a); assert.equal(h.gate.retry(), a); assert.equal(h.pending.length, 1);
  h.pending[0].resolve(profile); await a; assert.equal(h.timers.size, 0);
});
test('true observer logout supersedes temporary verification failure and stale retry', async () => {
  const h = harness(), a = h.gate.accept({ uid: 'a' }); h.timeout(); await a;
  const b = h.gate.retry(); await h.gate.accept(null); h.pending[1].resolve(profile); await b;
  assert.equal(h.latest().status, 'unauthenticated'); assert.equal(h.latest().user, null);
});
test('manual retry after SDK initialization timeout waits for authoritative readiness', async () => {
  const h = harness(); h.timeout();
  let ready; const work = h.gate.retry(() => new Promise(resolve => { ready = resolve; }));
  assert.equal(h.latest().status, 'initializing'); ready({ uid: 'restored' }); await work;
  assert.equal(h.latest().status, 'initializing'); h.pending[0].resolve(profile); await Promise.resolve();
  assert.equal(h.latest().status, 'verified'); assert.equal(h.latest().user.uid, 'restored');
});
test('unresolved initialization retry is bounded without fabricating logout', async () => {
  const h = harness(); h.timeout(); const retry = h.gate.retry(() => new Promise(() => {}));
  h.timeout(); await retry; assert.equal(h.latest().status, 'unverified'); assert.equal(h.rejected.length, 0);
});
test('verification timeout wrapper rejects a hung read without logout semantics', async () => {
  await assert.rejects(verifyWithin(() => new Promise(() => {}), 1), /Verification unavailable/);
});
test('logout duplicate click has one SDK request and one completion', async () => {
  let current = { uid: 'a' }, done, calls = 0, completed = 0;
  const action = createLogoutAction({ currentUser: () => current, active: () => true, changed() {},
    signOut: () => { calls++; return new Promise(resolve => { done = () => { current = null; resolve(); }; }); },
    completed: () => { completed++; } });
  const a = action(), b = action(); assert.equal(a, b); await Promise.resolve();
  assert.equal(calls, 1); done(); assert.deepEqual(await a, { ok: true }); await b; assert.equal(completed, 1);
});
test('logout completion cannot clear a newer account', async () => {
  let current = { uid: 'a' }, done, completed = 0;
  const action = createLogoutAction({ currentUser: () => current, active: () => true, changed() {},
    signOut: () => new Promise(resolve => { done = resolve; }), completed: () => { completed++; } });
  const work = action(); await Promise.resolve(); current = { uid: 'b' }; done();
  assert.deepEqual(await work, { ok: false }); assert.equal(completed, 0); assert.equal(current.uid, 'b');
});
test('logout cannot sign out an account switched before SDK invocation', async () => {
  let current = { uid: 'a' }, calls = 0;
  const action = createLogoutAction({ currentUser: () => current, active: () => true, changed() {},
    signOut: async () => { calls++; }, completed() { assert.fail('unexpected completion'); } });
  const work = action(); current = { uid: 'b' }; assert.deepEqual(await work, { ok: false }); assert.equal(calls, 0);
});
test('unmounted logout completion cannot publish or navigate', async () => {
  let mounted = true, done, current = { uid: 'a' }, completions = 0, changes = 0;
  const action = createLogoutAction({ currentUser: () => current, active: () => mounted, changed() { changes++; },
    signOut: () => new Promise(resolve => { done = resolve; }), completed() { completions++; } });
  const work = action(); await Promise.resolve(); mounted = false; current = null; done(); await work;
  assert.equal(completions, 0); assert.equal(changes, 1);
});
test('post-deletion cleanup failure never restores authorized profile', async () => {
  const h = harness(), user = { uid: 'deleted' }, first = h.gate.accept(user); h.pending[0].resolve(profile); await first;
  h.gate.deny(); let message;
  const action = createLogoutAction({ currentUser: () => user, active: () => true,
    changed: (_busy, error) => { message = error; }, signOut: async () => { throw Error('cleanup failed'); },
    completed() { assert.fail('cleanup did not succeed'); } });
  assert.deepEqual(await action(), { ok: false }); assert.equal(h.latest().status, 'denied');
  assert.equal(h.latest().profile, null); assert.match(message, /session may still be active/);
});
test('observer verification never requests recursive forced refresh; manual retry does', async () => {
  const forced = [], user = { uid: 'admin' };
  const gate = createAuthSession({ readProfile: async (_user, force) => { forced.push(force); return { role: 'Admin' }; },
    publish() {}, rejected() {}, schedule: () => 1, cancel() {} });
  await gate.accept(user); await gate.retry(); await gate.accept(user);
  assert.deepEqual(forced, [false, true, false]); gate.stop();
});
test('fresh same-UID login after confirmed invalidation must reverify rather than loop at Login', async () => {
  const h = harness(), user = { uid: 'a' }, first = h.gate.accept(user);
  h.pending[0].reject({ status: 401 }); await first; assert.equal(h.latest().status, 'invalid');
  const freshLogin = h.gate.accept({ uid: 'a' });
  assert.equal(h.latest().status, 'initializing'); assert.equal(h.latest().profile, null);
  h.pending[1].resolve(profile); await freshLogin; assert.equal(h.latest().status, 'verified');
});
