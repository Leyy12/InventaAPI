import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createAuthSession, createLogoutAction, completeLanding, landingSeen, navigationDecision, profileRole, authScreen } from '../../../services/auth-navigation.ts';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
test('root always renders Landing and does not consult browser visit state', () => {
  const source = read('dashboard/src/app/page.tsx');
  assert.match(source, /<AuthEntry \/>/);
  assert.doesNotMatch(source, /landingSeen|useSyncExternalStore|completeLanding|setItem/);
});
test('Landing Login opens a dismissible modal while Signup remains a route', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  assert.match(source, /onClick=\{\(\) => setShowLoginModal\(true\)\}/);
  assert.ok(source.includes("proceed('/signup')"));
  assert.ok(source.includes('if (!loginOnly) { setPendingPlan(plan); setShowLoginModal(true); return; }'));
  assert.doesNotMatch(source, /completeLanding|browserStorage/);
});
test('explicit Login route exists; signup no longer redirects to Landing', () => {
  assert.match(read('dashboard/src/app/login/page.tsx'), /<AuthEntry loginOnly/);
  const source = read('dashboard/src/app/signup/page.tsx');
  assert.match(source, /\/login\?registered=true&choosePlan=true/); assert.match(source, /href="\/login"/);
  assert.doesNotMatch(source, /`\/\?registered|href="\/\?login/);
});
test('Customer guard hides protected children before auth/role verification', () => {
  const source = read('dashboard/src/components/layout/LayoutWrapper.tsx');
  assert.ok(source.indexOf("if (!isPublicRoute && (loading || role !== 'customer'))") < source.indexOf('<Sidebar'));
  assert.match(source, /navigationDecision/); assert.doesNotMatch(source, /landingSeen|completeLanding/);
});
test('Customer session never trusts browser profiles or auto-recreates missing accounts', () => {
  const source = read('dashboard/src/lib/firebase/auth-context.tsx');
  for (const token of ['createAuthSession', 'getDocFromServer', 'onIdTokenChanged', 'sessionGate.current?.failure', 'sessionGate.current?.invalidate']) assert.ok(source.includes(token));
  assert.doesNotMatch(source, /getItem\(|setItem\(|setDoc\(|readCache|hasActiveSubscription/);
  assert.ok(source.includes("const marked = markPostLogoutLogin();"));
  assert.ok(source.includes("router.replace(marked ? '/' : '/?login=true&from=logout')"));
  assert.doesNotMatch(source, /finally \{ router.replace/);
});
test('subscription verification retains one poller and only exposes HTTP status for auth rejection', () => {
  const source = read('dashboard/src/lib/firebase/auth-context.tsx');
  assert.equal((source.match(/const poller = createEntitlementPoller\(/g) || []).length, 1);
  assert.match(source, /session\.poller\.refresh\(\)/);
  assert.match(read('dashboard/src/lib/subscription.ts'), /status: response.status/);
});
test('all Customer logout callers delegate to the explicit Login provider', () => {
  const sidebar = read('dashboard/src/components/layout/Sidebar.tsx');
  const privacy = read('dashboard/src/app/dashboard/privacy/page.tsx');
  assert.match(sidebar, /logout\(\)/); assert.match(privacy, /await logout\(\)/);
  assert.match(read('dashboard/src/components/layout/LayoutWrapper.tsx'), /void logout\(\)/);
  for (const path of ['dashboard/src/components/layout/Navbar.tsx', 'dashboard/src/app/dashboard/settings/page.tsx']) {
    assert.doesNotMatch(read(path), /signOut|logout\(/); // No Navbar/Settings logout control exists to rewire.
  }
});
function sources(directory) {
  const result = [];
  for (const entry of readdirSync(new URL('../../../' + directory, import.meta.url), { withFileTypes: true })) {
    const path = directory + '/' + entry.name;
    if (entry.isDirectory()) result.push(...sources(path));
    else if (/\.[jt]sx?$/.test(entry.name)) result.push([path, read(path)]);
  }
  return result;
}
test('active Customer auth/logout sources have no logout-to-root destination', () => {
  for (const [path, source] of sources('dashboard/src')) {
    if (/logout\s*[=(]|signOut\(/.test(source)) assert.doesNotMatch(source, /(?:router\.(?:push|replace)\(|window.location.href\s*=\s*)["']\/["']/, path);
  }
});
test('Admin protected UI and Login use authoritative role gate with own logout', () => {
  const provider = read('admin-panel/src/lib/firebase/admin-auth-context.tsx');
  assert.match(provider, /getDocFromServer/); assert.match(provider, /profileRole\(profile\) !== 'admin'/);
  assert.match(provider, /completed: \(\) => \{ gate.invalidate\(\); router.replace\('\/login'\); \}/);
  const wrapper = read('admin-panel/src/components/layout/AdminLayoutWrapper.tsx');
  assert.match(wrapper, /app: 'admin'/); assert.ok(wrapper.indexOf('if (loading || destination') < wrapper.indexOf('<AdminSidebar'));
  assert.match(read('admin-panel/src/app/login/page.tsx'), /profileRole/);
});
test('Admin handoff is configured origin only; no token bridge or visitor return URL', () => {
  const modal = read('dashboard/src/components/auth/LoginModal.tsx');
  assert.match(modal, /adminLoginDestination\(process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN/);
  assert.doesNotMatch(modal, /authToken|[?&]next=|[?&]redirect=|[?&]returnUrl=/);
  assert.match(modal, /profileRole\(userData \?\? null\)/);
  assert.match(modal, /auth.currentUser !== user/);
});
test('standalone Login cannot dismiss pending segment onboarding into an authenticated redirect', () => {
  assert.match(read('dashboard/src/components/auth/AuthEntry.tsx'), /standalone=\{loginOnly && !!pendingPlan\}/);
  const modal = read('dashboard/src/components/auth/LoginModal.tsx');
  assert.match(modal, /onClick=\{standalone \? undefined : onClose\}/);
  assert.match(modal, /\{!standalone && <button/);
});
test('restored authenticated plan intent waits for existing authoritative verification', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  assert.match(source, /if \(!entitlement\) return;/);
  assert.match(source, /entryFlow: loginStarted \|\| !!pendingPlan/);
});

// Pre-commit review: execute the ACTUAL provider/form callback bodies with injected
// SDK/router/state fakes. No component imports, real SDK, credentials, or network.
// These tests deliberately assert the required failure contracts, not today's bugs.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const quietConsole = { error() {}, warn() {}, log() {} };
function bodyBetween(path, start, end) {
  const source = read(path).replace(/\r\n/g, '\n');
  assert.equal(source.split(start).length, 2, 'callback start must be unique');
  const tail = source.split(start)[1];
  assert.ok(tail.includes(end), 'callback end must exist');
  return tail.split(end)[0];
}
function providerLogout(app, fail = false, storage = null) {
  const identity = { uid: 'review-user' };
  const auth = { currentUser: identity };
  let localUser = identity, invalidated = false, calls = 0, busy = false, error = null;
  const routes = [];
  const signOut = async () => { calls++; if (fail) throw Error('signOut failed'); auth.currentUser = null; };
  auth.signOut = signOut;
  const router = { replace: path => routes.push(path) };
  // Bind the actual provider configuration to the production logout action.
  const path = app === 'customer' ? 'dashboard/src/lib/firebase/auth-context.tsx' : 'admin-panel/src/lib/firebase/admin-auth-context.tsx';
  const body = bodyBetween(path, 'logoutAction.current = createLogoutAction({', '\n    const unsubscribe');
  const clear = () => { localUser = null; invalidated = true; };
  const gate = { invalidate: clear }, sessionGate = { current: gate }, logoutAction = { current: null };
  new Function('logoutAction', 'createLogoutAction', 'auth', 'firebaseSignOut', 'sessionGate', 'gate',
    'setLogoutBusy', 'setLogoutError', 'clearSession', 'completeLanding', 'browserStorage', 'markPostLogoutLogin', 'router',
    'logoutAction.current = createLogoutAction({' + body)(logoutAction, createLogoutAction, auth, signOut,
      sessionGate, gate, value => { busy = value; }, value => { error = value; }, clear, completeLanding, () => storage, () => true, router);
  return { run: logoutAction.current, auth, routes, recover: () => { fail = false; },
    state: () => ({ localUser, invalidated, calls, busy, error }) };
}
for (const app of ['customer', 'admin']) {
  test(`review: ${app} successful signout clears SDK/UI and reaches own Login`, async () => {
    const h = providerLogout(app); await h.run();
    assert.equal(h.auth.currentUser, null); assert.equal(h.state().localUser, null);
    assert.deepEqual(h.routes, app === 'customer' ? ['/'] : ['/login']); assert.equal(h.state().calls, 1);
  });
  test(`review: ${app} failed signout must not masquerade as a completed logout`, async () => {
    const h = providerLogout(app, true); await h.run().catch(() => {});
    assert.ok(h.auth.currentUser, 'fake SDK intentionally retains the valid session');
    assert.equal(h.state().localUser === null && h.routes.includes('/login'), false,
      'Provider cleared identity and navigated to plain Login while SDK still has a valid session; failure is console-only');
    assert.equal(h.state().localUser, h.auth.currentUser);
    assert.deepEqual(h.routes, []); assert.match(h.state().error, /session may still be active/);
    assert.equal(h.state().busy, false);
    h.recover(); assert.deepEqual(await h.run(), { ok: true });
    assert.equal(h.auth.currentUser, null); assert.deepEqual(h.routes, app === 'customer' ? ['/'] : ['/login']);
  });
}
function verificationHarness(pathname = '/dashboard') {
  let logoutCalls = 0, state;
  const pending = [], timers = new Map(); let nextTimer = 0;
  const rejectedBody = bodyBetween('dashboard/src/lib/firebase/auth-context.tsx', 'rejected: () => {', '\n      },');
  const rejected = () => new Function('window', 'endSession', 'router', rejectedBody)(
    { location: { pathname } }, () => { logoutCalls++; return Promise.resolve(); }, { replace() {} });
  const gate = createAuthSession({
    readProfile: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    publish: value => { state = value; }, rejected,
    schedule: callback => { const id = ++nextTimer; timers.set(id, callback); return id; }, cancel: id => timers.delete(id),
  });
  return { gate, pending, state: () => state, logoutCalls: () => logoutCalls,
    timeout: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); } };
}
for (const scenario of ['initialization timeout', 'profile timeout', 'profile network failure']) {
  test(`review: ${scenario} must not be classified as confirmed signout`, async () => {
    const h = verificationHarness();
    if (scenario === 'initialization timeout') h.timeout();
    else {
      const work = h.gate.accept({ uid: 'slow-valid-user' });
      if (scenario === 'profile timeout') { h.timeout(); h.pending[0].resolve({ role: 'Developer' }); }
      else h.pending[0].reject(Object.assign(Error('offline'), { code: 'unavailable' }));
      await work;
    }
    assert.equal(h.state().profile, null, 'protected access must remain closed');
    assert.equal(h.logoutCalls(), 0, 'Uncertainty must remain distinct and recoverable, not invoke SDK signout');
    assert.equal(h.state().status, 'unverified');
  });
}
test('review: transient verification failure permits same-identity authoritative retry', async () => {
  const h = verificationHarness();
  const first = h.gate.accept({ uid: 'a' }); h.pending[0].reject(Error('offline')); await first;
  const retry = h.gate.accept({ uid: 'a' });
  h.pending[1]?.resolve({ role: 'Developer' }); await retry;
  assert.equal(h.state().user?.uid, 'a', 'blockedUid must not permanently latch a transient failure until a null SDK event');
  assert.equal(h.state().status, 'verified');
});
test('review: Admin visibility token-refresh network failure is not revocation', async () => {
  let logouts = 0;
  const identity = { uid: 'admin', getIdToken: async () => { throw Object.assign(Error('offline'), { code: 'auth/network-request-failed' }); } };
  let state, attempts = 0;
  const readBody = bodyBetween('admin-panel/src/lib/firebase/admin-auth-context.tsx', 'readProfile: async (currentUser, forceRefresh) => {', '\n      },');
  const gate = createAuthSession({
    readProfile: async (currentUser, forceRefresh) => { attempts++; return new AsyncFunction('currentUser', 'getDocFromServer', 'doc', 'db', 'profileRole', 'forceRefresh',
      readBody.replace(' as AdminUser', ''))(currentUser, async () => { throw Error('profile must not be read after failed refresh'); }, () => {}, {}, profileRole, forceRefresh); },
    publish: value => { state = value; }, rejected: () => { logouts++; }, schedule: () => 1, cancel: () => {} });
  const body = bodyBetween('admin-panel/src/lib/firebase/admin-auth-context.tsx', 'const visible = () => {', '\n    };');
  new Function('auth', 'document', 'sessionGate', 'gate', 'logout', body)(
    { currentUser: identity }, { visibilityState: 'visible' }, { current: gate }, gate, async () => { logouts++; });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(logouts, 0, 'A transient refresh error must not destroy a valid Admin session');
  assert.equal(attempts, 1); assert.equal(state.status, 'unverified'); assert.equal(state.user, identity);
  gate.stop();
});
test('review: denied first-visit persistence cannot prevent actual Customer signout', async () => {
  let h;
  const storage = { setItem() { assert.equal(h.auth.currentUser, null, 'flag written only after SDK success'); throw Error('storage denied'); } };
  h = providerLogout('customer', false, storage); await h.run();
  assert.equal(h.auth.currentUser, null); assert.deepEqual(h.routes, ['/']);
});
test('review: actual signup provisions profile before subsequent protected access without auto-heal', async () => {
  const values = new Map(), profiles = new Map(), routes = [], events = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const auth = { currentUser: null }, user = { uid: 'new-customer' };
  let current, unexpectedLogout = 0;
  const rejectedBody = bodyBetween('dashboard/src/lib/firebase/auth-context.tsx', 'rejected: () => {', '\n      },');
  const gate = createAuthSession({ readProfile: async identity => profiles.get(identity.uid) ?? null,
    publish: state => { current = state; },
    rejected: () => new Function('window', 'endSession', 'router', rejectedBody)({ location: { pathname: '/signup' } }, async () => { unexpectedLogout++; }, { replace() { unexpectedLogout++; } }),
    schedule: () => 1, cancel: () => {} });
  const body = bodyBetween('dashboard/src/app/signup/page.tsx', 'const handleSignup = async (e: React.FormEvent) => {', '\n  };')
    .replace('catch (err: any)', 'catch (err)'); // Remove the sole TypeScript annotation in this callback body.
  const form = { fullName: 'Synthetic User', email: 'demo@example.invalid', password: 'demo-password', confirmPassword: 'demo-password',
    businessName: 'Synthetic Store', businessSegment: 'Grocery', privacyConsent: true };
  const handler = new AsyncFunction('e', 'setLoading', 'setError', 'formData', 'completeLanding', 'browserStorage',
    'createUserWithEmailAndPassword', 'auth', 'setDoc', 'doc', 'db', 'serverTimestamp', 'signOut', 'pendingPlan', 'router', 'console', body);
  await handler({ preventDefault() {} }, () => {}, message => { if (message) throw Error(message); }, form,
    completeLanding, () => storage,
    async () => { events.push('create'); auth.currentUser = user; await gate.accept(user); assert.equal(current.profile, null); assert.equal(current.status, 'denied'); return { user }; },
    auth, async (uid, profile) => { profiles.set(uid, profile); events.push('profile'); }, (_db, _collection, uid) => uid, {}, () => 'server-time',
    async () => { events.push('signout'); auth.currentUser = null; await gate.accept(null); }, 'pro', { push: path => routes.push(path) }, quietConsole);
  assert.deepEqual(events, ['create', 'profile', 'signout']); assert.equal(unexpectedLogout, 0);
  assert.equal(profiles.get(user.uid).role, 'Developer'); assert.equal(profiles.get(user.uid).plan, 'Free');
  assert.equal(profiles.get(user.uid).apiRequestLimit, 50); assert.equal(profiles.get(user.uid).businessSegment, 'Grocery');
  assert.equal(landingSeen(storage), false); assert.deepEqual(routes, ['/login?registered=true&choosePlan=true']);
  auth.currentUser = user; await gate.accept(user);
  assert.equal(navigationDecision({ path: '/login', initializing: current.loading, role: profileRole(current.profile) }), '/dashboard');
  gate.stop();
});

for (const app of ['customer', 'admin']) {
  test(`${app} retry UI precedes protected children and calls verification retry, including root/Login`, () => {
    const path = app === 'customer' ? 'dashboard/src/components/layout/LayoutWrapper.tsx' : 'admin-panel/src/components/layout/AdminLayoutWrapper.tsx';
    const source = read(path);
    const retry = source.indexOf("if (screen === 'retry'");
    assert.ok(retry > 0 && retry < source.indexOf('{children}'));
    assert.match(source, /const screen = authScreen\(authStatus\)/);
    assert.match(source, /initializing: screen !== 'ready'/);
    assert.match(source, /onClick=\{retryVerification\}>Retry verification/);
    assert.match(source, /We couldn&apos;t verify your account right now/);
    assert.match(source, /role="alert"[\s\S]*Retry logout/);
    for (const path of ['/', '/login', '/dashboard']) {
      const screen = authScreen('unverified'); assert.equal(screen, 'retry');
      assert.equal(navigationDecision({ app, path, initializing: screen !== 'ready', role: null, seen: false }), null);
    }
  });
}
function actualProfileGate(app, initialError = null, initialProfile = { role: 'Admin' }) {
  let error = initialError, profile = initialProfile, state, denied = 0;
  const identity = { uid: 'a', getIdToken: async () => { if (error) throw error; return 'synthetic'; } };
  const path = app === 'admin' ? 'admin-panel/src/lib/firebase/admin-auth-context.tsx' : 'dashboard/src/lib/firebase/auth-context.tsx';
  const body = bodyBetween(path, app === 'admin' ? 'readProfile: async (currentUser, forceRefresh) => {' : 'readProfile: async currentUser => {', '\n      },').replace(/ as (?:AdminUser|AppUser)/g, '');
  const reader = new AsyncFunction('currentUser', 'getDocFromServer', 'doc', 'db', 'profileRole', 'readSubscription', 'forceRefresh', body);
  const gate = createAuthSession({ readProfile: (user, forceRefresh) => reader(user, async () => {
    if (error) throw error; return { exists: () => profile !== null, data: () => profile };
  }, () => ({}), {}, profileRole, async () => { if (error) throw error; return { plan: 'Free' }; }, forceRefresh),
  publish: value => { state = value; }, rejected: () => { denied++; }, schedule: () => 1, cancel: () => {} });
  return { gate, identity, state: () => state, denied: () => denied, recover: value => { error = null; profile = value; } };
}
for (const app of ['customer', 'admin']) {
  for (const error of [{ code: 'auth/network-request-failed' }, { status: 503 }]) {
    test(`actual ${app} verification source preserves SDK identity on ${JSON.stringify(error)} and retries`, async () => {
      const h = actualProfileGate(app, error); await h.gate.accept(h.identity);
      assert.equal(h.state().status, 'unverified'); assert.equal(h.state().user, h.identity); assert.equal(h.denied(), 0);
      h.recover({ role: app === 'admin' ? 'Admin' : 'Developer' }); await h.gate.retry();
      assert.equal(h.state().status, 'verified'); h.gate.stop();
    });
  }
  for (const profile of [null, { role: 'Admin', disabled: true }, { role: 'Developer', deleted: true }]) {
    test(`actual ${app} missing/disabled/deleted profile is denied: ${JSON.stringify(profile)}`, async () => {
      const h = actualProfileGate(app, null, profile); await h.gate.accept(h.identity);
      assert.equal(h.state().status, 'denied'); assert.equal(h.state().profile, null); assert.equal(h.denied(), 1);
    });
  }
}
test('actual Admin role reader rejects a valid ordinary Customer', async () => {
  const h = actualProfileGate('admin', null, { role: 'Developer' }); await h.gate.accept(h.identity);
  assert.equal(h.state().status, 'denied'); assert.equal(h.state().profile, null);
});
test('Privacy invalidates only after confirmed backend deletion and before local cleanup', () => {
  const source = read('dashboard/src/app/dashboard/privacy/page.tsx');
  assert.ok(source.indexOf('confirmAccountDeletion();') > source.indexOf('if (!result.deleted)'));
  assert.ok(source.indexOf('confirmAccountDeletion();') < source.indexOf('await logout();'));
  const body = bodyBetween('dashboard/src/lib/firebase/auth-context.tsx', 'const confirmAccountDeletion = () => {', '\n  };');
  const events = [];
  new Function('sessionGate', 'router', body)({ current: { deny() { events.push('deny'); } } }, { replace(path) { events.push(path); } });
  assert.deepEqual(events, ['deny', '/login']);
});
