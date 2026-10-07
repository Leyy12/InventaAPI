import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../../services/auth-navigation.ts';
import { hooks, load, nodes, clock, browser, flush } from './workspace-refresh/harness.mjs';
import { PRODUCT_SEGMENTS, normalizeSegment } from '../../services/product-contract.js';
import { loginSegmentAllowed } from '../../services/customer-segment.js';

// Real components/handlers, synthetic SDK only. The loader forbids external I/O.
const icons = new Proxy({}, { get: (_, name) => String(name) });
const text = value => Array.isArray(value) ? value.map(text).join(' ') :
  value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
const find = (h, predicate) => {
  const matches = nodes(h.output, predicate);
  assert.equal(matches.length, 1);
  return matches[0];
};
const silent = { log() {}, error() {}, warn() {} };
const freeTitle = 'Login to continue to InventaAPI Free';
const freeSubtitle = 'Log in to access your Free plan dashboard.';

function signup(query = '', failure = '') {
  const h = hooks(), events = [], routes = [], profiles = [];
  const component = load('dashboard/src/app/signup/page.tsx', 'SignupPageInner', h, {
    'firebase/auth': {
      createUserWithEmailAndPassword: async () => { events.push('account'); return { user: { uid: 'synthetic' } }; },
      signOut: async () => { events.push('signout'); if (failure === 'signout') throw Error('synthetic signout failure'); },
    },
    'firebase/firestore': {
      doc: (...args) => args, serverTimestamp: () => 'server-time',
      setDoc: async (_, profile) => { events.push('profile'); profiles.push(profile); if (failure === 'profile') throw Error('synthetic profile failure'); },
    },
    '@/lib/firebase/config': { auth: {}, db: {} },
    'next/navigation': { useRouter: () => ({ push: route => { events.push('navigation'); routes.push(route); } }),
      useSearchParams: () => new URLSearchParams(query) },
    'lucide-react': icons, 'next/link': 'Link', 'next/image': 'Image',
    '../../../../services/auth-navigation': navigation,
  }, { console: silent });
  h.mount(component);
  return { h, events, routes, profiles, async submit() {
    const data = { fullName: 'Synthetic Fixture', email: 'fixture@example.invalid',
      password: 'synthetic-password', confirmPassword: 'synthetic-password',
      businessName: 'Synthetic', businessSegment: 'Grocery', privacyConsent: true };
    for (const [name, value] of Object.entries(data)) {
      find(h, node => node.props?.name === name).props.onChange({ target: {
        name, value, type: name === 'privacyConsent' ? 'checkbox' : 'text', checked: value,
      } });
      await flush();
    }
    await find(h, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    await flush();
  } };
}

function landing(query = '') {
  const h = hooks(), time = clock(), b = browser(), routes = [];
  let params = new URLSearchParams(query);
  const authState = { user: null, appUser: null, loading: false, authStatus: 'unauthenticated', entitlement: null };
  const router = { replace: route => routes.push(route), push: route => routes.push(route) };
  // Marketing objects do not participate in authorization; load the real config.
  const plans = load('dashboard/src/config/plans.ts', 'exports.SUBSCRIPTION_PLANS', h, {
    '../../../functions/entitlement-limits.mjs': { PRO_DAILY_REQUEST_LIMIT: 500, TRIAL_MAX_PRODUCTS: 50 },
    'lucide-react': icons,
  });
  const component = load('dashboard/src/components/auth/AuthEntry.tsx', 'AuthEntry', h, {
    'next/image': 'Image', 'lucide-react': icons,
    'next/navigation': { useRouter: () => router, useSearchParams: () => params },
    '@/components/auth/LoginForm': 'LoginForm', '@/components/auth/SessionLoadingScreen': 'Loading',
    '@/components/subscription/SubscriptionModal': 'SubscriptionModal',
    '@/lib/firebase/auth-context': { useAuth: () => authState }, '@/config/plans': { SUBSCRIPTION_PLANS: plans },
    '../../../../services/auth-navigation': navigation,
  }, { window: b.window, setTimeout: time.schedule, clearTimeout: time.cancel, console: silent });
  h.mount(component);
  return { h, routes, authState, modal: () => find(h, node => node.type === 'LoginForm').props,
    consumeQuery() { params = new URLSearchParams(); h.render(); }, stop() { h.stop(); } };
}

function modal(pendingPlan = null, plan = 'Free', blocked = false, resetFailure = false) {
  const h = hooks(), time = clock(), b = browser(), routes = [], upgrades = [], writes = [], resets = [];
  let signins = 0, signouts = 0;
  const user = { uid: 'synthetic', email: 'fixture@example.invalid' }, auth = { currentUser: null };
  const profile = { role: 'Developer', businessSegment: 'Grocery', selectedSegment: 'Grocery', plan, disabled: blocked };
  const component = load('dashboard/src/components/auth/LoginForm.tsx', 'LoginForm', h, {
    'next/image': 'Image', 'lucide-react': icons,
    'firebase/auth': {
      signInWithEmailAndPassword: async () => { signins++; auth.currentUser = user; return { user }; },
      signOut: async () => { signouts++; auth.currentUser = null; },
      sendPasswordResetEmail: async (_, email) => { resets.push(email); if (resetFailure) throw Error('synthetic reset failure'); },
    },
    'firebase/firestore': { doc: (...args) => args, getDocFromServer: async () => ({ data: () => profile }),
      updateDoc: async (_, fields) => writes.push(fields) },
    '@/lib/firebase/config': { auth, db: {} },
    'next/navigation': { useRouter: () => ({ push: route => routes.push(route) }) },
    '@/lib/firebase/auth-context': { useAuth: () => ({ refreshUserDoc: async () => {} }) },
    '../../../../services/auth-navigation': navigation,
    '../../../../services/product-contract.js': { PRODUCT_SEGMENTS, normalizeSegment },
    '../../../../services/customer-segment.js': { loginSegmentAllowed },
    '@/lib/subscription': { readSubscription: async () => ({ plan, canPurchaseProMax: plan === 'Pro' }) },
  }, { window: b.window, setTimeout: time.schedule, clearTimeout: time.cancel, console: silent });
  h.mount(component, { pendingPlan, onComplete() {}, onOpenSubscription: value => upgrades.push(value) });
  return { h, time, routes, upgrades, writes, resets, profile,
    get signins() { return signins; }, get signouts() { return signouts; },
    async login(segment = 'Grocery') {
      await flush();
      for (const [id, value] of [['email', user.email], ['password', 'synthetic-password'], ['segment', segment]]) {
        find(h, node => node.props?.id === id).props.onChange({ target: { value } }); await flush();
      }
      await find(h, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
      await time.advance(800);
    }, stop() { h.stop(); } };
}

for (const intent of ['', 'free', 'pro', 'pro_max', 'https://evil.example']) {
  test(`real signup creates profile then signs out before landing handoff: ${intent || 'default'}`, async () => {
    const fixture = signup(new URLSearchParams({ pendingPlan: intent }).toString());
    await fixture.submit();
    assert.deepEqual(fixture.events, ['account', 'profile', 'signout', 'navigation']);
    assert.equal(fixture.profiles[0].role, 'Developer');
    assert.equal(fixture.profiles[0].businessSegment, 'Grocery');
    const route = new URL(fixture.routes[0], 'https://synthetic.invalid');
    assert.equal(route.pathname, '/');
    assert.equal(route.searchParams.get('registered'), 'true');
    assert.equal(route.searchParams.has('login'), false);
    assert.equal(route.searchParams.get('pendingPlan'), ['pro', 'pro_max'].includes(intent) ? intent : null);
    const entry = landing(route.search.slice(1)); await flush();
    assert.ok(entry.modal());
    assert.equal(entry.modal().pendingPlan, route.searchParams.get('pendingPlan'));
    assert.match(text(entry.h.output), /Account created successfully/);
    entry.stop(); fixture.h.stop();
  });
}
for (const failure of ['profile', 'signout']) test(`signup ${failure} failure cannot claim successful handoff`, async () => {
  const fixture = signup('', failure); await fixture.submit();
  assert.equal(fixture.routes.length, 0);
  assert.match(text(fixture.h.output), /synthetic .* failure/);
  fixture.h.stop();
});
test('signup footer preserves paid intent in the inline landing entry', () => {
  const fixture = signup('pendingPlan=pro');
  const link = find(fixture.h, node => node.type === 'Link' && text(node).trim() === 'Login');
  assert.equal(link.props.href, navigation.customerLoginEntryDestination(new URLSearchParams({ pendingPlan: 'pro' }))); fixture.h.stop();
});

for (const query of [{}, { registered: 'true' }, { pendingPlan: 'pro' }, { pendingPlan: 'pro_max' },
  { next: 'https://evil.example', redirect: '//evil.example', returnUrl: 'javascript:evil()', callbackUrl: 'https://evil.example' },
  { pendingPlan: ['pro', 'pro_max'], registered: ['true', 'false'] }]) {
  test(`real compatibility page redirects only, with safe intent: ${JSON.stringify(query)}`, async () => {
    const component = load('dashboard/src/app/login/page.tsx', 'LoginPage', hooks(), {
      'next/navigation': { redirect: destination => { throw { destination }; } },
      '../../../../services/auth-navigation': navigation,
    });
    // The actual layout decision must not race the server redirect and lose intent.
    for (const role of [null, 'customer']) assert.equal(navigation.navigationDecision({
      path: '/login', initializing: false, role,
    }), null);
    let target;
    try { await component({ searchParams: Promise.resolve(query) }); assert.fail('redirect required'); }
    catch (error) { assert.ok(error.destination); target = error.destination; }
    const url = new URL(target, 'https://synthetic.invalid');
    assert.equal(url.origin, 'https://synthetic.invalid'); assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.get('pendingPlan'), typeof query.pendingPlan === 'string' ? query.pendingPlan : null);
    for (const key of ['next', 'redirect', 'returnUrl', 'callbackUrl']) assert.equal(url.searchParams.has(key), false);
    const entry = landing(url.search.slice(1)); await flush();
    assert.ok(entry.modal()); entry.consumeQuery(); await flush();
    entry.h.render(); await flush();
    assert.ok(entry.modal(), 'inline form persists after query consumption and remount');
    assert.equal(url.searchParams.has('login'), false);
    assert.equal(navigation.navigationDecision({ path: '/', initializing: false, role: null }), null);
    assert.ok(entry.routes.every(route => route === '/')); entry.stop();
  });
}

for (const intent of [null, 'free', 'pro', 'pro_max']) test(`actual inline presentation and pricing-first Register link: ${intent}`, async () => {
  const fixture = modal(intent); await flush();
  const copy = text(fixture.h.output);
  assert.ok(copy.includes(intent === 'pro' ? 'Login to continue to your Pro upgrade' :
    intent === 'pro_max' ? 'Login to continue to Pro Max' : freeTitle));
  if (!intent || intent === 'free') assert.ok(copy.includes(freeSubtitle));
  assert.ok(!copy.includes('Welcome to InventaAPI'));
  const segment = find(fixture.h, node => node.props?.id === 'segment');
  assert.deepEqual(nodes(segment, node => node.type === 'option').map(node => node.props.value).filter(Boolean), [...PRODUCT_SEGMENTS]);
  const signupLink = find(fixture.h, node => node.type === 'a' && node.props?.href === '#pricing');
  assert.equal(signupLink.props.href, '#pricing');
  assert.equal(text(signupLink).trim(), 'Register');
  assert.equal(segment.props.required, true);
  assert.equal(nodes(fixture.h.output, node => node.props?.role === 'dialog').length, 0);
  assert.equal(nodes(fixture.h.output, node => node.props?.['aria-label'] === 'Close login').length, 0);
  fixture.stop();
});
for (const [intent, plan, upgrade] of [[null, 'Free', null], [null, 'Pro', null], ['free', 'Pro Max', null],
  ['pro', 'Free', 'pro'], ['pro_max', 'Pro', 'pro_max']]) {
  test(`actual validated login preserves plan and continuation: ${intent}/${plan}`, async () => {
    const fixture = modal(intent, plan); await fixture.login();
    assert.equal(fixture.signins, 1); assert.equal(fixture.signouts, 0);
    assert.deepEqual(fixture.writes, []); assert.equal(fixture.profile.plan, plan);
    assert.deepEqual(fixture.upgrades, upgrade ? [upgrade] : []);
    assert.deepEqual(fixture.routes, upgrade ? [] : ['/dashboard']); fixture.stop();
  });
}
test('missing Business Segment blocks Firebase login; unauthorized segment signs out', async () => {
  const missing = modal(); await missing.login(''); assert.equal(missing.signins, 0); missing.stop();
  const foreign = modal(); await foreign.login('Pharmacy');
  assert.equal(foreign.signouts, 1); assert.deepEqual(foreign.routes, []); assert.deepEqual(foreign.writes, []); foreign.stop();
});
test('disabled Customer cannot proceed through ordinary Free presentation', async () => {
  const fixture = modal(null, 'Free', true); await fixture.login();
  assert.equal(fixture.signouts, 1); assert.deepEqual(fixture.routes, []); fixture.stop();
});
for (const path of ['/dashboard', '/dashboard/products', '/dashboard/api-keys']) test(`protected ${path} migrates once without root loop`, () => {
  const destination = navigation.navigationDecision({ path, initializing: false, role: null });
  assert.equal(destination, navigation.customerLoginEntryDestination());
  assert.equal(navigation.navigationDecision({ path: '/', initializing: false, role: null }), null);
  assert.equal(navigation.navigationDecision({ path, initializing: true, role: null }), null);
});
test('Admin navigation and configured destination are unchanged', () => {
  assert.equal(navigation.navigationDecision({ app: 'admin', path: '/', initializing: false, role: null }), '/login');
  assert.equal(navigation.navigationDecision({ app: 'admin', path: '/login', initializing: false, role: 'admin' }), '/');
  assert.equal(navigation.adminLoginDestination('https://synthetic-admin.company', 'synthetic-customer.company'), 'https://synthetic-admin.company/login');
});

for (const failure of [false, true]) test(`landing password reset preserves validation, ${failure ? 'error' : 'success'}, and return`, async () => {
  const fixture = modal(null, 'Free', false, failure); await flush();
  find(fixture.h, node => node.type === 'button' && /Forgot Password/i.test(text(node))).props.onClick(); await flush();
  await find(fixture.h, node => node.type === 'button' && text(node) === 'Send Reset Link').props.onClick(); await flush();
  assert.equal(fixture.resets.length, 0); assert.match(text(fixture.h.output), /enter your email/);
  find(fixture.h, node => node.props?.id === 'reset-email').props.onChange({ target: { value: 'fixture@example.invalid' } }); await flush();
  await find(fixture.h, node => node.type === 'button' && text(node) === 'Send Reset Link').props.onClick(); await flush();
  assert.deepEqual(fixture.resets, ['fixture@example.invalid']);
  assert.match(text(fixture.h.output), failure ? /synthetic reset failure/ : /Reset link sent/);
  find(fixture.h, node => node.type === 'button' && /Back to Login/.test(text(node))).props.onClick(); await flush();
  assert.ok(text(fixture.h.output).includes(freeTitle));
  assert.equal(nodes(fixture.h.output, node => node.type === 'form').length, 1);
  assert.deepEqual(fixture.routes, []); fixture.stop();
});

test('plain root needs no query to render inline form; pricing CTAs only register', async () => {
  const entry = landing(); await flush();
  assert.ok(entry.modal()); assert.equal(entry.modal().pendingPlan, null);
  for (const [label, plan] of [['Get Started Free', 'free'], ['Subscribe Now', 'pro'], ['Get Pro Max', 'pro_max']]) {
    const buttons = nodes(entry.h.output, node => node.type === 'button' && text(node).trim().replace(/\s*→$/, '').trim() === label);
    assert.equal(buttons.length, 1, label);
    buttons[0].props.onClick();
    assert.equal(entry.routes.at(-1), navigation.customerSignupDestination(plan));
  }
  assert.equal(find(entry.h, node => node.type === 'SubscriptionModal').props.isOpen, false);
  entry.stop();
});
test('login in progress defers root navigation and subscription opening until validated continuation', async () => {
  const entry = landing('pendingPlan=pro_max'); await flush();
  entry.modal().onStart(); await flush();
  Object.assign(entry.authState, { user: { uid: 'synthetic' }, appUser: { role: 'Developer' },
    authStatus: 'verified', entitlement: { canPurchaseProMax: true, plan: 'Pro' } });
  entry.h.render(); await flush();
  assert.ok(entry.modal(), 'public form remains owned by the in-progress login checks');
  assert.equal(find(entry.h, node => node.type === 'SubscriptionModal').props.isOpen, false);
  assert.ok(!entry.routes.includes('/dashboard'));
  entry.modal().onComplete(); entry.modal().onOpenSubscription('pro_max'); await flush();
  assert.equal(find(entry.h, node => node.type === 'SubscriptionModal').props.isOpen, true);
  assert.ok(!entry.routes.includes('/dashboard')); entry.stop();
});
test('auth restoration waits without marketing flash, then verified plain Customer redirects', async () => {
  const entry = landing(); await flush();
  Object.assign(entry.authState, { loading: true }); entry.h.render(); await flush();
  assert.equal(nodes(entry.h.output, node => node.type === 'LoginForm').length, 0);
  Object.assign(entry.authState, { loading: false, authStatus: 'verified',
    user: { uid: 'synthetic' }, appUser: { role: 'Developer' } });
  entry.h.render(); await flush();
  assert.equal(entry.routes.at(-1), '/dashboard'); entry.stop();
});
test('cancellation and signup success are inline notices, not checkout authority', async () => {
  const entry = landing('payment=cancelled&pendingPlan=pro'); await flush();
  assert.match(entry.modal().initialError, /Payment was not completed/);
  assert.equal(find(entry.h, node => node.type === 'SubscriptionModal').props.isOpen, false);
  entry.consumeQuery(); await flush(); assert.ok(entry.modal()); entry.stop();
});

for (const [plan, permitted] of [['pro', true], ['pro', false], ['pro_max', true], ['pro_max', false]]) {
  test(`restored ${plan} intent waits for authoritative entitlement and preserves eligibility=${permitted}`, async () => {
    const entry = landing('pendingPlan=' + plan); await flush();
    Object.assign(entry.authState, { user: { uid: 'synthetic' }, appUser: { role: 'Developer' },
      authStatus: 'verified' }); entry.h.render(); await flush();
    assert.equal(find(entry.h, node => node.type === 'SubscriptionModal').props.isOpen, false);
    assert.ok(!entry.routes.includes('/dashboard'));
    entry.authState.entitlement = { canPurchasePro: permitted, canPurchaseProMax: permitted,
      activePro: !permitted, plan: permitted ? 'Free' : 'Pro' };
    entry.h.render(); await flush();
    assert.equal(find(entry.h, node => node.type === 'SubscriptionModal').props.isOpen, permitted);
    if (!permitted) assert.match(text(entry.h.output), /Your current plan is already active/);
    entry.stop();
  });
}
for (const role of ['Admin', 'Unknown']) test(`inline form cannot send ${role} identity to Customer dashboard`, async () => {
  const fixture = modal(); fixture.profile.role = role; await fixture.login();
  assert.deepEqual(fixture.routes, []); assert.deepEqual(fixture.upgrades, []);
  if (role === 'Unknown') assert.equal(fixture.signouts, 1);
  fixture.stop();
});
