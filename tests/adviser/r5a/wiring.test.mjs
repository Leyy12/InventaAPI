import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createAuthSession, createLogoutAction, completeLanding, landingSeen, navigationDecision, profileRole, authScreen,
  beginCustomerLogout, cancelCustomerLogout, customerLogoutDestination, markPostLogoutLogin, consumePostLogoutLogin,
  consumePostLogoutLoginEntry, rememberCustomerLoginEntry, CUSTOMER_LOGIN_ENTRY_KEY,
  POST_LOGOUT_LOGIN_KEY, customerPublicPath, customerLoginEntryDestination } from '../../../services/auth-navigation.ts';
const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
test('root always renders Landing and does not consult browser visit state', () => {
  const source = read('dashboard/src/app/page.tsx');
  assert.match(source, /<AuthEntry \/>/);
  assert.doesNotMatch(source, /landingSeen|useSyncExternalStore|completeLanding|setItem/);
});
test('Landing permanently embeds login while registration remains pricing-first', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  assert.match(source, /<LoginForm/);
  assert.doesNotMatch(source, /showLoginModal|<LoginModal/);
  const header = source.slice(source.indexOf('{/* Navigation */}'), source.indexOf('{/* Hero Section */}'));
  assert.doesNotMatch(header, />\s*Sign Up\s*</);
  assert.match(read('dashboard/src/components/auth/LoginForm.tsx'), /href="#pricing"[\s\S]*Register/);
  assert.match(read('dashboard/src/app/signup/page.tsx'), /Create Account/);
  assert.match(source, /router\.push\(customerSignupDestination\("free"\)\)/);
  assert.doesNotMatch(source, /completeLanding|browserStorage/);
});
test('legacy Login is redirect-only; signup and footer use the central landing entry', () => {
  assert.match(read('dashboard/src/app/login/page.tsx'), /redirect\(customerLoginEntryDestination\(params\)\)/);
  assert.doesNotMatch(read('dashboard/src/app/login/page.tsx'), /AuthEntry|loginOnly/);
  const source = read('dashboard/src/app/signup/page.tsx');
  assert.match(source, /customerLoginEntryDestination\(intent\)/);
  assert.match(source, /href=\{customerLoginEntryDestination\(new URLSearchParams/);
  assert.doesNotMatch(source, /\/login\?registered|href="\/login"/);
});
test('Customer guard hides protected children before auth/role verification', () => {
  const source = read('dashboard/src/components/layout/LayoutWrapper.tsx');
  assert.ok(source.indexOf('if (!isPublicRoute && !customerProtectedReady({ loading, authStatus, role, entitlement }))') < source.indexOf('<Sidebar'));
  assert.match(source, /navigationDecision/); assert.doesNotMatch(source, /landingSeen|completeLanding/);
});
test('Customer session never trusts browser profiles or auto-recreates missing accounts', () => {
  const source = read('dashboard/src/lib/firebase/auth-context.tsx');
  for (const token of ['createAuthSession', 'getDocFromServer', 'onIdTokenChanged', 'sessionGate.current?.failure', 'sessionGate.current?.invalidate']) assert.ok(source.includes(token));
  assert.doesNotMatch(source, /getItem\(|setItem\(|setDoc\(|readCache|hasActiveSubscription/);
  assert.ok(source.includes('if (busy) beginCustomerLogout();'));
  assert.ok(source.includes("clearSession(); router.replace('/')"));
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
test('Customer logout routing is owned only by the provider', () => {
  for (const [path, source] of sources('dashboard/src')) {
    if (path === 'dashboard/src/lib/firebase/auth-context.tsx') continue;
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
  const modal = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.match(modal, /adminLoginDestination\(process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN/);
  assert.doesNotMatch(modal, /authToken|[?&]next=|[?&]redirect=|[?&]returnUrl=/);
  assert.match(modal, /profileRole\(userData \?\? null\)/);
  assert.match(modal, /auth.currentUser !== user/);
});
test('landing Login is dismissible and still verifies the selected account segment', () => {
  assert.doesNotMatch(read('dashboard/src/components/auth/AuthEntry.tsx'), /loginOnly|standalone=|Continue to Login/);
  const modal = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.match(modal, /loginSegmentAllowed\(\{ \.\.\.userData, plan \}, chosenSegment\)/);
  assert.match(modal, /auth.currentUser !== user/);
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
    'setLogoutBusy', 'setLogoutError', 'clearSession', 'completeLanding', 'browserStorage', 'markPostLogoutLogin', 'router', 'beginCustomerLogout', 'cancelCustomerLogout',
    'logoutAction.current = createLogoutAction({' + body)(logoutAction, createLogoutAction, auth, signOut,
      sessionGate, gate, value => { busy = value; }, value => { error = value; }, clear, completeLanding, () => storage, () => true, router, () => {}, () => {});
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
  const rejected = () => new Function('window', 'endSession', 'router', 'customerLogoutDestination', 'customerLoginEntryDestination', rejectedBody)(
    { location: { pathname } }, () => { logoutCalls++; return Promise.resolve(); }, { replace() {} }, customerLogoutDestination, customerLoginEntryDestination);
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
test('review: Admin SDK token-refresh network failure is not revocation; visibility is not an auth trigger', async () => {
  let logouts = 0;
  const identity = { uid: 'admin', getIdToken: async () => { throw Object.assign(Error('offline'), { code: 'auth/network-request-failed' }); } };
  let state, attempts = 0;
  const readBody = bodyBetween('admin-panel/src/lib/firebase/admin-auth-context.tsx', 'readProfile: async (currentUser, forceRefresh) => {', '\n      },');
  const gate = createAuthSession({
    readProfile: async (currentUser, forceRefresh) => { attempts++; return new AsyncFunction('currentUser', 'getDocFromServer', 'doc', 'db', 'profileRole', 'forceRefresh',
      readBody.replace(' as AdminUser', ''))(currentUser, async () => { throw Error('profile must not be read after failed refresh'); }, () => {}, {}, profileRole, forceRefresh); },
    publish: value => { state = value; }, rejected: () => { logouts++; }, schedule: () => 1, cancel: () => {} });
  assert.doesNotMatch(read('admin-panel/src/lib/firebase/admin-auth-context.tsx'), /visibilitychange|visibilityState/);
  await gate.accept(identity);
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
    rejected: () => new Function('window', 'endSession', 'router', 'customerLogoutDestination', 'customerLoginEntryDestination', rejectedBody)({ location: { pathname: '/signup' } }, async () => { unexpectedLogout++; }, { replace() { unexpectedLogout++; } }, customerLogoutDestination, customerLoginEntryDestination),
    schedule: () => 1, cancel: () => {} });
  const body = bodyBetween('dashboard/src/app/signup/page.tsx', 'const handleSignup = async (e: React.FormEvent) => {', '\n  };')
    .replace('catch (err: any)', 'catch (err)'); // Remove the sole TypeScript annotation in this callback body.
  const form = { fullName: 'Synthetic User', email: 'demo@example.invalid', password: 'demo-password', confirmPassword: 'demo-password',
    businessName: 'Synthetic Store', businessSegment: 'Grocery', privacyConsent: true };
  const handler = new AsyncFunction('e', 'setLoading', 'setError', 'formData', 'completeLanding', 'browserStorage',
    'createUserWithEmailAndPassword', 'auth', 'setDoc', 'doc', 'db', 'serverTimestamp', 'signOut', 'pendingPlan', 'router', 'console', 'customerLoginEntryDestination', body);
  await handler({ preventDefault() {} }, () => {}, message => { if (message) throw Error(message); }, form,
    completeLanding, () => storage,
    async () => { events.push('create'); auth.currentUser = user; await gate.accept(user); assert.equal(current.profile, null); assert.equal(current.status, 'denied'); return { user }; },
    auth, async (uid, profile) => { profiles.set(uid, profile); events.push('profile'); }, (_db, _collection, uid) => uid, {}, () => 'server-time',
    async () => { events.push('signout'); auth.currentUser = null; await gate.accept(null); }, 'pro', { push: path => routes.push(path) }, quietConsole, customerLoginEntryDestination);
  assert.deepEqual(events, ['create', 'profile', 'signout']); assert.equal(unexpectedLogout, 0);
  assert.equal(profiles.get(user.uid).role, 'Developer'); assert.equal(profiles.get(user.uid).plan, 'Free');
  assert.equal(profiles.get(user.uid).apiRequestLimit, 50); assert.equal(profiles.get(user.uid).businessSegment, 'Grocery');
  assert.equal(landingSeen(storage), false); assert.deepEqual(routes, [customerLoginEntryDestination(new URLSearchParams({ registered: 'true', choosePlan: 'true', pendingPlan: 'pro' }))]);
  auth.currentUser = user; await gate.accept(user);
  assert.equal(navigationDecision({ path: '/', initializing: current.loading, role: profileRole(current.profile) }), '/dashboard');
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
    if (app === 'customer') {
      assert.match(source, /<SessionRecoveryState[\s\S]*onRetry=\{retryVerification\}/);
      assert.match(source, /onReturnToLogin=\{\(\) => \{ void logout\(\); \}\}/);
      const recovery = read('dashboard/src/components/auth/SessionLoadingScreen.tsx');
      assert.match(recovery, /We couldn&apos;t verify your account right now/);
      assert.match(recovery, /onClick=\{onRetry\}[\s\S]*Try Again/);
      assert.match(recovery, /onClick=\{onReturnToLogin\}[\s\S]*Return to Login/);
      assert.match(recovery, /role="alert"/);
    } else {
      assert.match(source, /onClick=\{retryVerification\}>Retry verification/);
      assert.match(source, /We couldn&apos;t verify your account right now/);
    }
    assert.match(source, /role="alert"[\s\S]*Retry logout/);
    for (const path of ['/', '/login', '/dashboard']) {
      const screen = authScreen('unverified'); assert.equal(screen, 'retry');
      assert.equal(navigationDecision({ app, path, initializing: screen !== 'ready', role: null, seen: false }), null);
    }
  });
}
function actualProfileGate(app, initialError = null, initialProfile = { role: 'Admin' }, initialTrialError = null) {
  let error = initialError, trialError = initialTrialError, profile = initialProfile, state, denied = 0, trialCalls = 0;
  const identity = { uid: 'a', getIdToken: async () => { if (error) throw error; return 'synthetic'; } };
  const path = app === 'admin' ? 'admin-panel/src/lib/firebase/admin-auth-context.tsx' : 'dashboard/src/lib/firebase/auth-context.tsx';
  const body = bodyBetween(path, app === 'admin' ? 'readProfile: async (currentUser, forceRefresh) => {' : 'readProfile: async currentUser => {', '\n      },').replace(/ as (?:AdminUser|AppUser)/g, '');
  const reader = new AsyncFunction('currentUser', 'getDocFromServer', 'doc', 'db', 'profileRole', 'readSubscription', 'forceRefresh', 'establishCustomerTrial', body);
  const gate = createAuthSession({ readProfile: (user, forceRefresh) => reader(user, async () => {
    if (error) throw error; return { exists: () => profile !== null, data: () => profile };
  }, () => ({}), {}, profileRole, async () => { if (error) throw error; return { plan: 'Free Trial' }; }, forceRefresh,
    async () => { trialCalls++; if (error || trialError) throw error || trialError; }),
  publish: value => { state = value; }, rejected: () => { denied++; }, schedule: () => 1, cancel: () => {} });
  return { gate, identity, state: () => state, denied: () => denied, trialCalls: () => trialCalls,
    recover: value => { error = null; trialError = null; profile = value; } };
}
test('automatic Trial session failure keeps protected Customer state unverified; retry establishes normally', async () => {
  const h = actualProfileGate('customer', null, { role: 'Developer' }, { status: 503 });
  await h.gate.accept(h.identity);
  assert.equal(h.state().status, 'unverified'); assert.equal(h.state().profile, null);
  assert.equal(h.state().user, h.identity); assert.equal(h.trialCalls(), 1); assert.equal(h.denied(), 0);
  h.recover({ role: 'Developer' }); await h.gate.retry();
  assert.equal(h.state().status, 'verified'); assert.equal(h.trialCalls(), 2); h.gate.stop();
});
test('non-Customer and missing/disabled profiles never call automatic Trial establishment', async () => {
  for (const profile of [null, { role: 'Admin' }, { role: 'Developer', disabled: true }, { role: 'Developer', deleted: true }]) {
    const h = actualProfileGate('customer', null, profile); await h.gate.accept(h.identity);
    assert.equal(h.trialCalls(), 0); h.gate.stop();
  }
});
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
  new Function('sessionGate', 'router', 'customerLoginEntryDestination', body)({ current: { deny() { events.push('deny'); } } }, { replace(path) { events.push(path); } }, customerLoginEntryDestination);
  assert.deepEqual(events, ['deny', customerLoginEntryDestination()]);
});

// Exercise actual provider, observer, layout-effect and root-effect bodies together.
// The fake SDK publishes null BEFORE its signOut promise resolves. Router requests
// are queued separately, so an old /login effect can execute after logout completes.
function logoutRaceHarness({ storageDenied = false, fail = false } = {}) {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { sessionStorage: {
    getItem(key) { if (storageDenied) throw Error('denied'); return values.get(key) ?? null; },
    setItem(key, value) { if (storageDenied) throw Error('denied'); values.set(key, value); },
    removeItem(key) { if (storageDenied) throw Error('denied'); values.delete(key); },
  } };
  cancelCustomerLogout();
  const identity = { uid: 'race-customer' }, auth = { currentUser: identity };
  let path = '/dashboard', state, modal = false, pendingPlan = null, busy = false, error, finishSignOut;
  const requests = [];
  const router = { replace(target) { requests.push(target); } };
  const provider = 'dashboard/src/lib/firebase/auth-context.tsx';
  const layout = 'dashboard/src/components/layout/LayoutWrapper.tsx';
  const entry = 'dashboard/src/components/auth/AuthEntry.tsx';
  const gate = createAuthSession({ readProfile: async () => ({ role: 'Developer' }),
    publish: value => { state = value; }, rejected() {}, schedule: () => 1, cancel() {} });
  const observerBody = bodyBetween(provider, 'onIdTokenChanged(auth, currentUser => {', ' },\n      error');
  const observe = currentUser => new Function('gate', 'currentUser', observerBody)(gate, currentUser);
  const guardBody = 'const role =' + bodyBetween(layout, '  const role =', '\n  useEffect');
  const effectBody = bodyBetween(layout, '  useEffect(() => {', '\n  }, [destination');
  const captureGuard = () => {
    const snapshotPath = path;
    const destination = new Function('user', 'appUser', 'authStatus', 'pathname', 'customerPublicPath',
      'profileRole', 'authScreen', 'navigationDecision', 'customerLoginEntryDestination', guardBody + '\nreturn destination;')(
      state?.user ?? null, state?.profile ?? null, state?.status ?? 'unauthenticated', path,
      customerPublicPath, profileRole, authScreen, navigationDecision, customerLoginEntryDestination);
    return () => new Function('destination', 'pathname', 'router', 'customerLogoutDestination', effectBody)(
      destination, snapshotPath, router, customerLogoutDestination);
  };
  const root = () => {
    modal = false; // No login popup can be opened by legacy state.
    new Function('loading', 'user', 'consumePostLogoutLoginEntry',
      'if (!loading' + bodyBetween(entry, '  useEffect(() => {\n    if (!loading', '\n  }, [loading, user]'))(
      state?.loading ?? false, state?.user ?? null, consumePostLogoutLoginEntry);
  };
  const clearSession = () => gate.invalidate();
  const logoutAction = { current: null }, sessionGate = { current: gate };
  const sdk = async () => {
    assert.equal(customerLogoutDestination('/login'), null, 'intent must exist before signOut');
    if (fail) throw Error('SDK rejected signOut');
    auth.currentUser = null;
    observe(null);
    captureGuard()(); // Reproduce React flushing the observer update during the await.
    await new Promise(resolve => { finishSignOut = resolve; });
  };
  const body = bodyBetween(provider, 'logoutAction.current = createLogoutAction({', '\n    const unsubscribe');
  const bindings = { logoutAction, createLogoutAction, auth, firebaseSignOut: sdk, sessionGate, gate,
    setLogoutBusy: value => { busy = value; }, setLogoutError: value => { error = value; },
    beginCustomerLogout, cancelCustomerLogout, markPostLogoutLogin, clearSession, router };
  new Function(...Object.keys(bindings), 'logoutAction.current = createLogoutAction({' + body)(...Object.values(bindings));
  return {
    async login(entry = 'generic') {
      auth.currentUser = identity; await gate.accept(identity);
      rememberCustomerLoginEntry(entry); path = '/dashboard';
    },
    run: () => logoutAction.current(), captureGuard, root,
    complete: () => finishSignOut(),
    settle() { if (requests.length) path = requests.at(-1); },
    direct(target) { path = target; },
    state: () => ({ path, modal, pendingPlan, busy, error, user: state?.user, profile: state?.profile }), requests, values,
    dispose() { gate.stop(); rememberCustomerLoginEntry('generic'); cancelCustomerLogout(); globalThis.window = previousWindow; },
  };
}

for (const storageDenied of [false, true]) {
  test(`race: observer and delayed protected guard cannot overwrite logout root (storage denied=${storageDenied})`, async () => {
    const h = logoutRaceHarness({ storageDenied });
    try {
      await h.login();
      const logout = h.run();
      await Promise.resolve(); await Promise.resolve();
      assert.equal(h.state().user, null); assert.equal(h.state().profile, null);
      assert.deepEqual(h.requests, [], 'pending logout must suppress /login');
      assert.equal(consumePostLogoutLogin(), false, 'root cannot consume unfinished signout');
      const delayedGuard = h.captureGuard();
      h.complete(); assert.deepEqual(await logout, { ok: true });
      delayedGuard(); // Flush stale /login closure AFTER provider requested root.
      assert.ok(h.requests.length > 0); assert.ok(h.requests.every(route => route === '/'));
      assert.equal(customerLogoutDestination('/login'), '/');
      h.settle(); h.root();
      assert.equal(h.state().path, '/'); assert.equal(h.state().modal, false);
      assert.equal(h.values.has(POST_LOGOUT_LOGIN_KEY), false);
      assert.equal(consumePostLogoutLogin(), false, 'intent consumed exactly once');
      h.settle(); assert.equal(h.state().path, '/'); assert.equal(h.state().modal, false);
      h.root(); assert.equal(h.state().modal, false, 'legacy markers never resurrect a popup');
      h.captureGuard()(); h.settle(); assert.equal(h.state().path, '/', 'no redirect loop');
      await h.login(); const second = h.run(); await Promise.resolve(); await Promise.resolve();
      h.complete(); await second; h.settle(); h.root(); assert.equal(h.state().modal, false);
    } finally { h.dispose(); }
  });
}
test('race: unauthenticated protected visit reaches inline landing login without a loop', () => {
  const h = logoutRaceHarness();
  try {
    h.captureGuard()(); h.settle(); assert.equal(h.state().path, customerLoginEntryDestination());
    h.root(); assert.equal(h.state().modal, false);
    h.direct('/'); // Landing consumes its entry query with replace, retaining the modal.
    h.requests.length = 0; h.captureGuard()(); assert.deepEqual(h.requests, []);
  } finally { h.dispose(); }
});
test('race: failed SDK signOut cancels intent and retains authenticated UI', async () => {
  const h = logoutRaceHarness({ fail: true });
  try {
    await h.login(); assert.deepEqual(await h.run(), { ok: false });
    h.captureGuard()(); assert.deepEqual(h.requests, []);
    assert.equal(h.state().path, '/dashboard'); assert.ok(h.state().user); assert.ok(h.state().profile);
    assert.match(h.state().error, /Logout failed/); assert.equal(h.state().busy, false);
    assert.equal(consumePostLogoutLogin(), false);
    assert.equal(customerLogoutDestination('/login'), '/login');
  } finally { h.dispose(); }
});
test('race: provider rejection cannot introduce a second /login redirect during logout', () => {
  const h = logoutRaceHarness();
  try {
    const rejectedBody = bodyBetween('dashboard/src/lib/firebase/auth-context.tsx', 'rejected: () => {', '\n      },');
    const rejected = () => new Function('window', 'router', 'customerLogoutDestination', 'customerLoginEntryDestination', rejectedBody)(
      { location: { pathname: '/dashboard' } }, { replace: path => h.requests.push(path) }, customerLogoutDestination, customerLoginEntryDestination);
    beginCustomerLogout(); rejected(); assert.deepEqual(h.requests, []);
    markPostLogoutLogin(); rejected(); assert.deepEqual(h.requests, ['/']);
    cancelCustomerLogout(true); // Successful provider cleanup must retain root intent.
    assert.equal(consumePostLogoutLogin(), true); assert.equal(consumePostLogoutLogin(), false);
    h.requests.length = 0; rejected(); assert.deepEqual(h.requests, [customerLoginEntryDestination()]);
  } finally { h.dispose(); }
});

for (const storageDenied of [false, true]) {
  test(`free entry: verified Free session returns to persistent inline login without popup (storage denied=${storageDenied})`, async () => {
    const h = logoutRaceHarness({ storageDenied });
    try {
      await h.login('free');
      const pending = h.run(); await Promise.resolve(); await Promise.resolve();
      assert.equal(consumePostLogoutLoginEntry(), null, 'unfinished signout cannot open a modal');
      h.complete(); assert.deepEqual(await pending, { ok: true });
      h.settle(); h.root();
      assert.equal(h.state().path, '/'); assert.equal(h.state().modal, false);
      assert.equal(h.state().pendingPlan, null);
      assert.equal(h.values.has(POST_LOGOUT_LOGIN_KEY), false);
      assert.equal(h.values.has(CUSTOMER_LOGIN_ENTRY_KEY), false);
      assert.equal(consumePostLogoutLoginEntry(), null);
      h.root(); assert.equal(h.state().modal, false);
      await h.login();
      const generic = h.run(); await Promise.resolve(); await Promise.resolve();
      h.complete(); await generic; h.settle(); h.root();
      assert.equal(h.state().modal, false); assert.equal(h.state().pendingPlan, null,
        'inline ordinary Free presentation requires no query or popup intent');
    } finally { h.dispose(); }
  });
}

test('free entry: failed logout retains Customer state and produces no Free post-logout modal', async () => {
  const h = logoutRaceHarness({ fail: true });
  try {
    await h.login('free'); assert.deepEqual(await h.run(), { ok: false });
    assert.ok(h.state().user); assert.equal(h.state().path, '/dashboard');
    assert.deepEqual(h.requests, []); assert.equal(consumePostLogoutLoginEntry(), null);
    assert.equal(h.values.get(CUSTOMER_LOGIN_ENTRY_KEY), 'free', 'failed signout retains the session intent');
    assert.equal(h.values.has(POST_LOGOUT_LOGIN_KEY), false);
  } finally { h.dispose(); }
});

// Execute the actual successful-login verification block with synthetic SDK/
// Firestore/subscription adapters. No password, token or external I/O is used.
async function exerciseLoginEntry({ pendingPlan = null, failure = null } = {}) {
  const previousWindow = globalThis.window, values = new Map();
  globalThis.window = { sessionStorage: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } };
  rememberCustomerLoginEntry('generic'); markPostLogoutLogin(); consumePostLogoutLoginEntry();
  const user = { uid: 'synthetic-customer' }, auth = { currentUser: null };
  const profile = { role: 'Developer', businessSegment: 'Grocery', selectedSegment: 'Grocery' };
  const effective = { plan: 'Free' };
  const events = [];
  const body = bodyBetween('dashboard/src/components/auth/LoginForm.tsx',
    '      // 1. Sign in with Firebase', '      // The inline form completes as part');
  const bindings = {
    signInWithEmailAndPassword: async () => {
      if (failure === 'firebase') throw Error('synthetic login failure');
      auth.currentUser = user; return { user };
    }, auth, email: 'synthetic', password: 'synthetic',
    getDocFromServer: async () => {
      if (failure === 'profile') throw Error('synthetic profile failure');
      return { data: () => failure === 'missing' ? undefined : profile };
    }, doc: () => ({}), db: {}, profileRole,
    signOut: async () => { auth.currentUser = null; },
    readSubscription: async () => {
      if (failure === 'subscription') throw Error('synthetic verification failure');
      return effective;
    }, requestedSegment: 'Grocery',
    normalizeSegment: value => value,
    loginSegmentAllowed: () => failure !== 'segment',
    updateDoc: async () => {
      if (failure === 'write') throw Error('synthetic write failure');
      if (failure === 'switch') auth.currentUser = { uid: 'another-customer' };
    }, refreshUserDoc: async () => profile,
    rememberCustomerLoginEntry: entry => { events.push(entry); rememberCustomerLoginEntry(entry); },
    pendingPlan, setError() {}, setLoading() {}, setSegmentBlocked() {}, setShowSegment() {},
    console: { log() {}, error() {} },
  };
  if (failure === 'write' || failure === 'switch') profile.selectedSegment = 'Hardware';
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction(...Object.keys(bindings), body)(...Object.values(bindings));
  } catch { /* Expected synthetic failure paths must leave entry uncommitted. */ }
  const stored = values.get(CUSTOMER_LOGIN_ENTRY_KEY);
  rememberCustomerLoginEntry('generic'); markPostLogoutLogin(); consumePostLogoutLoginEntry();
  globalThis.window = previousWindow;
  return { events, stored };
}

for (const [pendingPlan, expected] of [['free', 'free'], [null, 'free'], ['pro', 'free'], ['pro_max', 'free']]) {
  test(`free entry: actual successful Customer login records ${expected} for ${pendingPlan}`, async () => {
    const result = await exerciseLoginEntry({ pendingPlan });
    assert.deepEqual(result.events, [expected]); assert.equal(result.stored, expected);
  });
}
for (const failure of ['firebase', 'profile', 'missing', 'subscription', 'segment', 'write', 'switch']) {
  test(`free entry: actual ${failure} failure cannot commit Free login context`, async () => {
    const result = await exerciseLoginEntry({ pendingPlan: 'free', failure });
    assert.deepEqual(result.events, []); assert.equal(result.stored, undefined);
  });
}

test('free entry: registration CTA never commits an authenticated-session entry', () => {
  const entry = read('dashboard/src/components/auth/AuthEntry.tsx');
  assert.match(entry, /customerSignupDestination\("free"\)/);
  assert.doesNotMatch(entry, /rememberCustomerLoginEntry/);
  const modal = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.equal((modal.match(/rememberCustomerLoginEntry\(/g) ?? []).length, 1);
  assert.ok(modal.indexOf('rememberCustomerLoginEntry(') > modal.indexOf('loginSegmentAllowed('));
  assert.ok(modal.indexOf('rememberCustomerLoginEntry(') > modal.indexOf('await refreshUserDoc();'));
  assert.match(modal, /Login to continue to InventaAPI Free/);
  assert.match(modal, /Log in to access your Free plan dashboard\./);
  assert.doesNotMatch(modal, /Welcome to InventaAPI|Log in to manage your DaaS platform/);
});

test('free entry: denied writes/removals cannot make a stale Free intent sticky in this document', () => {
  const previousWindow = globalThis.window, values = new Map();
  let denied = false;
  globalThis.window = { sessionStorage: {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (denied) throw Error('denied'); values.set(key, value); },
    removeItem(key) { if (denied) throw Error('denied'); values.delete(key); },
  } };
  try {
    rememberCustomerLoginEntry('free'); markPostLogoutLogin();
    denied = true;
    assert.equal(consumePostLogoutLoginEntry(), 'free');
    assert.equal(consumePostLogoutLoginEntry(), null);
    rememberCustomerLoginEntry('generic'); markPostLogoutLogin();
    assert.equal(consumePostLogoutLoginEntry(), 'free');
    assert.equal(consumePostLogoutLoginEntry(), null);
  } finally {
    denied = false; rememberCustomerLoginEntry('generic'); markPostLogoutLogin();
    consumePostLogoutLoginEntry(); globalThis.window = previousWindow;
  }
});

test('free entry: only allowlisted presentation strings are persisted, without auth authority', () => {
  const previousWindow = globalThis.window, values = new Map();
  globalThis.window = { sessionStorage: { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  try {
    rememberCustomerLoginEntry('javascript:untrusted');
    assert.deepEqual([...values], [[CUSTOMER_LOGIN_ENTRY_KEY, 'free']]);
    markPostLogoutLogin(); assert.equal(consumePostLogoutLoginEntry(), 'free');
    assert.equal(navigationDecision({ path: '/dashboard', initializing: false, role: null }), customerLoginEntryDestination());
  } finally {
    rememberCustomerLoginEntry('generic'); markPostLogoutLogin(); consumePostLogoutLoginEntry();
    globalThis.window = previousWindow;
  }
});
