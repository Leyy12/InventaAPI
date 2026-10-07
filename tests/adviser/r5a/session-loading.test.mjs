import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAuthSession, authScreen, navigationDecision, profileRole, customerLoginEntryDestination } from '../../../services/auth-navigation.ts';
import { customerProtectedReady } from '../../../dashboard/src/lib/customer-readiness.ts';

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const entry = read('dashboard/src/components/auth/AuthEntry.tsx');
const root = read('dashboard/src/app/page.tsx');
const login = read('dashboard/src/app/login/page.tsx');
const layout = read('dashboard/src/components/layout/LayoutWrapper.tsx');
const loading = read('dashboard/src/components/auth/SessionLoadingScreen.tsx');
const admin = read('admin-panel/src/components/layout/AdminLayoutWrapper.tsx');

test('public root and Login restoration use the neutral branded state, never raw checking text', () => {
  for (const source of [entry, root, login, layout]) assert.doesNotMatch(source, /Checking session\.\.\.|Checking session…/);
  assert.match(entry, /if \(loading \|\| destination\) return <SessionLoadingScreen/);
  assert.match(entry, /authStatus === 'verified' && user && profileRole\(appUser\) === 'customer' \? 'workspace' : 'public'/);
  assert.match(root, /Suspense fallback=\{<SessionLoadingScreen variant="public"/);
  assert.match(login, /redirect\(customerLoginEntryDestination\(params\)\)/);
  assert.doesNotMatch(login, /AuthEntry|SessionLoadingScreen/);
  assert.match(loading, /Preparing InventaAPI…/);
  assert.match(loading, /src="\/inventa-logo\.png"/);
});

test('protected pending routes render only a data-free workspace shell before children', () => {
  const guard = layout.indexOf('if (!isPublicRoute && !customerProtectedReady({ loading, authStatus, role, entitlement }))');
  assert.ok(guard > 0 && guard < layout.indexOf('<Sidebar />') && guard < layout.indexOf('{children}'));
  assert.match(layout, /variant=\{authStatus === 'verified' && role === 'customer' \? 'workspace' : 'public'\}/);
  assert.match(loading, /variant === "public"/);
  assert.match(loading, /Preparing your workspace…/);
  assert.match(loading, /Your dashboard will appear when it is ready\./);
  assert.doesNotMatch(loading, /\b(useAuth|appUser|entitlement|apiKey|products|quota|email|children)\b/i);
  assert.doesNotMatch(loading, /\b(fetch|localStorage|sessionStorage)\s*\(/);
});

test('protected Customer content waits for authoritative entitlement, including on hard refresh', () => {
  const ready = entitlement => customerProtectedReady({ loading: false, authStatus: 'verified', role: 'customer', entitlement });
  assert.equal(ready(null), false);
  assert.equal(customerProtectedReady({ loading: true, authStatus: 'initializing', role: null, entitlement: null }), false);
  assert.equal(customerProtectedReady({ loading: false, authStatus: 'unverified', role: 'customer', entitlement: { plan: 'Pro' } }), false);
  for (const entitlement of [
    { plan: 'Free', subscription_status: 'free' },
    { plan: 'Trial', subscription_status: 'trialing' },
    { plan: 'Pro', subscription_status: 'active' },
    { plan: 'Free', subscription_status: 'upgrade_required' },
  ]) assert.equal(ready(entitlement), true, entitlement.subscription_status);
  assert.equal(customerProtectedReady({ loading: false, authStatus: 'unauthenticated', role: null, entitlement: { plan: 'Pro' } }), false);
  assert.equal(customerProtectedReady({ loading: false, authStatus: 'verified', role: 'admin', entitlement: { plan: 'Pro' } }), false);
  assert.ok(layout.indexOf('customerProtectedReady') < layout.indexOf('<Sidebar />'));
  assert.ok(layout.indexOf('customerProtectedReady') < layout.indexOf('{children}'));
  assert.match(layout, /entitlement \}\)\) return <SessionLoadingScreen/);
});

test('workspace details wait 240 ms; status, decorative and reduced-motion semantics remain accessible', () => {
  assert.match(loading, /useState\(false\)/);
  assert.match(loading, /variant !== "workspace"\) return/);
  assert.match(loading, /window\.setTimeout\(\(\) => setShowWorkspaceDetails\(true\), 240\)/);
  assert.match(loading, /window\.clearTimeout\(timer\)/);
  assert.match(loading, /showWorkspaceDetails &&/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.match(loading, /motion-reduce:animate-none/);
});

test('unverified state remains fail-closed with existing retry and safe logout/login actions', () => {
  assert.equal(authScreen('unverified'), 'retry');
  assert.match(layout, /if \(screen === 'retry'[\s\S]*<SessionRecoveryState/);
  assert.match(layout, /onRetry=\{retryVerification\}/);
  assert.match(layout, /onReturnToLogin=\{\(\) => \{ void logout\(\); \}\}/);
  assert.match(loading, /role="alert"/);
  assert.match(loading, /onClick=\{onRetry\}[\s\S]*Try Again/);
  assert.match(loading, /onClick=\{onReturnToLogin\}[\s\S]*Return to Login/);
  assert.match(layout, /Retry logout/);
  for (const path of ['/', '/login', '/dashboard']) {
    assert.equal(navigationDecision({ path, initializing: true, role: null }), null);
  }
});

test('verified Customer reaches protected route; unauthenticated and Admin identities do not', async () => {
  const pending = [];
  let current;
  const gate = createAuthSession({
    readProfile: user => new Promise(resolve => pending.push({ user, resolve })),
    publish: state => { current = state; },
    rejected: () => {}, schedule: () => 1, cancel: () => {},
  });
  const user = { uid: 'synthetic' };
  const work = gate.accept(user);
  assert.equal(current.status, 'initializing');
  assert.equal(current.profile, null);
  assert.equal(navigationDecision({ path: '/dashboard', initializing: true, role: null }), null);
  pending[0].resolve({ role: 'Developer' });
  await work;
  assert.equal(current.status, 'verified');
  assert.equal(profileRole(current.profile), 'customer');
  assert.equal(navigationDecision({ path: '/dashboard', initializing: false, role: 'customer' }), null);
  await gate.accept(null);
  assert.equal(current.status, 'unauthenticated');
  assert.equal(navigationDecision({ path: '/dashboard', initializing: false, role: null }), customerLoginEntryDestination());
  assert.equal(navigationDecision({ path: '/dashboard', initializing: false, role: 'admin' }), 'admin-app');
  gate.stop();
});

test('Admin protected boundary retains its own verification gate and retry flow', () => {
  assert.match(admin, /const screen = authScreen\(authStatus\)/);
  assert.match(admin, /if \(screen === 'retry'/);
  assert.match(admin, /onClick=\{retryVerification\}>Retry verification/);
  assert.ok(admin.indexOf("if (screen === 'retry'") < admin.indexOf('{children}'));
  assert.equal(navigationDecision({ app: 'admin', path: '/', initializing: false, role: 'customer' }), '/login');
});
