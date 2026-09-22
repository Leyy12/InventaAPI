import test from 'node:test';
import assert from 'node:assert/strict';
import { LANDING_SEEN_KEY, landingSeen, completeLanding, browserStorage, profileRole, navigationDecision,
  customerPublicPath, adminLoginDestination, loginEntryQuery, invalidSessionError } from '../../../services/auth-navigation.ts';
const decide = values => navigationDecision({ initializing: false, role: null, path: '/', ...values });
const memory = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
test('fresh browser root renders Landing without persisting on read', () => {
  const storage = memory();
  assert.equal(decide({ seen: landingSeen(storage) }), null);
  assert.equal(storage.values.size, 0);
});
test('legacy landing marker is inert and root remains Landing for returning browsers', () => {
  const storage = memory(); completeLanding(storage);
  assert.deepEqual([...storage.values], [[LANDING_SEEN_KEY, '1']]);
  assert.equal(decide({ seen: landingSeen(storage) }), null);
});
test('cleared storage permits Landing again', () => {
  const storage = memory(); completeLanding(storage); storage.values.clear();
  assert.equal(decide({ seen: landingSeen(storage) }), null);
});
test('separate device/profile has separate first-visit state', () => {
  const first = memory(), second = memory(); completeLanding(first);
  assert.equal(landingSeen(first), true); assert.equal(landingSeen(second), false);
});
test('shared tab storage observes both writes and clearing', () => {
  const storage = memory(); completeLanding(storage);
  assert.equal(landingSeen(storage), true); storage.values.clear(); assert.equal(landingSeen(storage), false);
});
test('unavailable storage cannot break Login or authorize a protected page', () => {
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.doesNotThrow(() => completeLanding(denied)); assert.equal(landingSeen(denied), false);
  assert.equal(landingSeen(null), false); assert.equal(browserStorage(), null);
  assert.equal(decide({ path: '/dashboard', seen: landingSeen(denied) }), '/login');
});
for (const value of ['true', 'admin', '{"role":"admin"}', '0', '']) test(`malformed flag ${value} grants nothing`, () => {
  const storage = memory(); storage.setItem(LANDING_SEEN_KEY, value);
  assert.equal(landingSeen(storage), false);
  assert.equal(decide({ path: '/dashboard', seen: true }), '/login');
});
for (const path of ['/', '/login']) for (const seen of [false, true]) test(`authenticated Customer ${path} seen=${seen} goes home`, () => {
  assert.equal(decide({ path, role: 'customer', seen }), '/dashboard');
});
for (const path of ['/', '/login', '/dashboard', '/dashboard/products', '/dashboard/analytics']) {
  test(`initializing ${path} does not redirect`, () => {
    for (const role of [null, 'customer', 'admin']) assert.equal(decide({ path, role, initializing: true, seen: true }), null);
  });
}
for (const path of ['/dashboard', '/dashboard/products', '/dashboard/analytics', '/docs']) {
  test(`unauthenticated ${path} goes directly to Login regardless of flag`, () => {
    for (const seen of [false, true]) assert.equal(decide({ path, seen }), '/login');
  });
}
test('Firebase session disappears on protected page: Login, then stays there', () => {
  assert.equal(decide({ path: '/dashboard', role: 'customer' }), null);
  assert.equal(decide({ path: '/dashboard', role: null }), '/login');
  assert.equal(decide({ path: '/login', role: null, seen: true }), null);
});
test('root remains a stable public Landing while protected routes still go Login', () => {
  assert.equal(decide({ path: '/', seen: true }), null);
  assert.equal(decide({ path: '/login', seen: true }), null);
  assert.equal(decide({ path: '/dashboard', seen: true }), '/login');
  assert.equal(decide({ path: '/dashboard', role: 'customer' }), null);
});
test('subscription polling is not an input to auth navigation', () => {
  for (const entitlement of [null, { plan: 'Free' }, { plan: 'Pro' }]) {
    assert.equal(decide({ path: '/dashboard', role: 'customer', entitlement }), null);
  }
});
test('explicit entry flow may finish login/onboarding/plan handoff but never bypasses protected guard', () => {
  assert.equal(decide({ path: '/login', role: 'customer', entryFlow: true }), '/dashboard');
  assert.equal(decide({ path: '/dashboard', entryFlow: true, seen: true }), '/login');
});
for (const path of ['/', '/products', '/settings']) test(`Customer cannot enter Admin ${path}`, () => {
  assert.equal(decide({ app: 'admin', path, role: 'customer', seen: true }), '/login');
});
test('Admin Login/home/logout remain in Admin app', () => {
  assert.equal(decide({ app: 'admin', path: '/login', role: 'admin' }), '/');
  assert.equal(decide({ app: 'admin', path: '/', role: 'admin' }), null);
  assert.equal(decide({ app: 'admin', path: '/', role: null }), '/login');
  assert.equal(decide({ app: 'admin', path: '/login', role: null }), null);
});
test('Admin on Customer root or Login is handed to the separate app', () => {
  for (const path of ['/', '/login', '/dashboard']) assert.equal(decide({ path, role: 'admin' }), 'admin-app');
});
for (const profile of [null, {}, { role: 'owner' }, { role: 'Developer', disabled: true }, { role: 'Developer', deleted: true },
  { role: 'Admin', deletedAt: '2026-01-01' }, { role: 'Admin', deletionRequested: true },
  ...['deleting', 'deleted', 'disabled', 'pending_deletion'].map(status => ({ role: 'Developer', status })),
  { role: 'Developer', plan: 'Deleted' }, { role: 'Developer', accountState: 'disabled' }, { role: 'Admin', accountState: 'unknown' }]) {
  test(`blocked/missing role cannot enter dashboard: ${JSON.stringify(profile)}`, () => {
    assert.equal(profileRole(profile), null);
    assert.equal(decide({ path: '/dashboard', role: profileRole(profile), seen: true }), '/login');
  });
}
for (const role of ['Developer', 'developer', 'Consumer', 'Business']) test(`existing Customer role ${role} retained`, () => {
  assert.equal(profileRole({ role, plan: 'Free', accountState: 'active' }), 'customer');
});
test('Admin role is case-insensitive but not inferred from UID/flag', () => {
  assert.equal(profileRole({ role: 'ADMIN' }), 'admin');
  assert.equal(profileRole({ uid: 'admin', landingSeen: true }), null);
});
test('public login/signup and legal pages do not require authentication', () => {
  for (const path of ['/', '/login', '/signup', '/privacy-policy', '/terms-of-service', '/contact']) assert.equal(customerPublicPath(path), true);
  assert.equal(customerPublicPath('/login/../../dashboard'), false);
});
test('only established allowlisted login intents survive legacy root links', () => {
  const query = loginEntryQuery(new URLSearchParams('registered=true&choosePlan=true&next=https://evil.example&pendingPlan=enterprise'));
  assert.equal(query, 'registered=true&choosePlan=true&pendingPlan=enterprise');
});
for (const target of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '%2F%2Fevil.example', '/dashboard']) {
  test(`return URL ${target} is not a supported navigation instruction`, () => {
    for (const key of ['next', 'redirect', 'returnUrl']) assert.equal(loginEntryQuery(new URLSearchParams({ [key]: target })), '');
  });
}
test('unknown intent/error values are discarded', () => {
  assert.equal(loginEntryQuery(new URLSearchParams('pendingPlan=admin&error=https://evil.example&login=1&view=landing')), '');
});
test('Admin origin is fixed operator config and carries no token', () => {
  assert.equal(adminLoginDestination('https://admin.example', 'customer.example'), 'https://admin.example/login');
  assert.equal(adminLoginDestination(undefined, 'localhost'), 'http://localhost:3001/login');
  assert.equal(adminLoginDestination(undefined, 'customer.example'), null);
});
for (const target of ['//evil.example', 'javascript:alert(1)', 'http://admin.example', 'https://user:password@admin.example',
  'https://admin.example?authToken=secret', 'https://admin.example/#hash', 'https://admin.example/redirect']) {
  test(`invalid operator Admin origin rejected: ${target}`, () => assert.equal(adminLoginDestination(target, 'customer.example'), null));
}
for (const error of [{ status: 401 }, { status: 403 }, ...['auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-not-found'].map(code => ({ code }))]) {
  test(`invalid session signal ${JSON.stringify(error)} ends session`, () => assert.equal(invalidSessionError(error), true));
}
test('network/500/429 errors are not misclassified as logout', () => {
  for (const error of [null, Error('offline'), { status: 500 }, { status: 429 }, { code: 'auth/network-request-failed' }]) assert.equal(invalidSessionError(error), false);
});
