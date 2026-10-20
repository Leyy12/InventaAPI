import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../../services/auth-navigation.ts';
import { hooks, load, nodes, clock, browser, flush } from './workspace-refresh/harness.mjs';
import * as registration from '../../services/customer-registration.mjs';

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
const loginTitle = 'Login to InventaAPI';
const loginSubtitle = 'Log in to access your dashboard and manage your account.';

function signup(query = '', failure = '') {
  const h = hooks(), time = clock(), events = [], routes = [], profiles = [], verification = [];
  const component = load('dashboard/src/app/signup/page.tsx', 'SignupPageInner', h, {
    'firebase/auth': {
      createUserWithEmailAndPassword: async (_, email) => { events.push('account'); return { user: { uid: 'synthetic', email } }; },
      signOut: async () => { events.push('signout'); if (failure === 'signout') throw Error('synthetic signout failure'); },
      signInWithEmailAndPassword: async (_, email, password) => { events.push('signin'); verification.push(['signin', email, password]);
        if (failure === 'signin') throw Error('synthetic signin failure'); return { user: { uid: 'synthetic', email } }; },
      deleteUser: async () => { events.push('delete'); },
    },
    '@/components/subscription/PostSignupPlans': 'PostSignupPlans',
    'firebase/firestore': {
      doc: (...args) => args, serverTimestamp: () => 'server-time',
      setDoc: async (_, profile) => { events.push('profile'); profiles.push(profile); if (failure === 'profile') throw Error('synthetic profile failure'); },
      ...(failure === 'confirm' ? { getDocFromServer: async () => ({ exists: () => false }) } : {}),
    },
    '@/lib/firebase/config': { auth: {}, db: {} },
    'next/navigation': { useRouter: () => ({ push: route => { events.push('navigation'); routes.push(route); } }),
      useSearchParams: () => new URLSearchParams(query) },
    'lucide-react': icons, 'next/link': 'Link', 'next/image': 'Image',
    '../../../../services/auth-navigation': navigation,
    // Real registration flow; only the backend verification endpoints are synthetic.
    '../../../../services/customer-registration.mjs': { ...registration, readRegistrationPolicy: async () => true,
      sendSignupCode: async ({ email }) => { events.push('code'); verification.push(['send', email]);
        return { ok: true, message: '', retryAfterSeconds: 0, resendAvailableInSeconds: 60 }; },
      verifySignupCode: async ({ email, code }) => { events.push('verify'); verification.push(['verify', email, code]);
        return { ok: true, message: '', verificationToken: 'synthetic-token' }; },
      confirmSignupEmail: async ({ user, verificationToken }) => { events.push('confirm'); verification.push(['confirm', user.email, verificationToken]);
        if (failure === 'confirm') throw Error('synthetic confirm failure'); },
    },
  }, { console: silent, setTimeout: time.schedule, clearTimeout: time.cancel });
  h.mount(component);
  return { h, events, routes, profiles, verification, async submit() {
    const data = { fullName: 'Synthetic Fixture', email: ' Fixture@Example.Invalid ',
      password: 'synthetic-password', confirmPassword: 'synthetic-password',
      businessName: 'Synthetic', businessSegment: 'Grocery', termsAccepted: true, privacyConsent: true };
    for (const [name, value] of Object.entries(data)) {
      find(h, node => node.props?.name === name).props.onChange({ target: {
        name, value, type: typeof value === 'boolean' ? 'checkbox' : 'text', checked: value,
      } });
      await flush();
    }
    await find(h, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
    await flush();
    find(h, node => node.props?.name === 'verificationCode').props.onChange({ target: { value: '123456' } });
    await flush();
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
    '@/components/subscription/SubscriptionModal': 'SubscriptionModal', '@/components/subscription/PlanCards': 'PlanCards',
    '@/lib/firebase/auth-context': { useAuth: () => authState }, '@/config/plans': { SUBSCRIPTION_PLANS: plans },
    '@/lib/plan-request-policy': { usePlanCatalog: () => ({ plans, status: 'ready' }) },
    '../../../../services/auth-navigation': navigation,
  }, { window: b.window, setTimeout: time.schedule, clearTimeout: time.cancel, console: silent });
  h.mount(component);
  return { h, routes, authState, modal: () => find(h, node => node.type === 'LoginForm').props,
    consumeQuery() { params = new URLSearchParams(); h.render(); }, stop() { h.stop(); } };
}

function modal(pendingPlan = null, plan = 'Free', blocked = false, resetFailure = '') {
  const h = hooks(), time = clock(), b = browser(), routes = [], upgrades = [], writes = [], resets = [];
  let signins = 0, signouts = 0;
  const user = { uid: 'synthetic', email: 'fixture@example.invalid' }, auth = { currentUser: null };
  const profile = { role: 'Developer', businessSegment: 'Grocery', selectedSegment: 'Grocery', plan, disabled: blocked };
  const component = load('dashboard/src/components/auth/LoginForm.tsx', 'LoginForm', h, {
    'next/image': 'Image', 'next/link': 'Link', 'lucide-react': icons,
    'firebase/auth': {
      signInWithEmailAndPassword: async () => { signins++; auth.currentUser = user; return { user }; },
      signOut: async () => { signouts++; auth.currentUser = null; },
    },
    'firebase/firestore': { doc: (...args) => args, getDocFromServer: async () => ({ data: () => profile }),
      updateDoc: async (_, fields) => writes.push(fields) },
    '@/lib/firebase/config': { auth, db: {} },
    'next/navigation': { useRouter: () => ({ push: route => routes.push(route) }) },
    '../../../../services/auth-navigation': navigation,
    '@/lib/subscription': { readSubscription: async () => ({ plan, canPurchaseProMax: plan === 'Pro' }) },
    // Real validation; only the backend reset endpoints are synthetic.
    '../../../../services/customer-registration.mjs': { ...registration,
      sendPasswordResetCode: async ({ base, email }) => { resets.push(['send', base, email]);
        return resetFailure === 'send' ? { ok: false, message: 'Please wait 42 seconds before requesting another code.', retryAfterSeconds: 42, resendAvailableInSeconds: 60 }
          : { ok: true, message: '', retryAfterSeconds: 0, resendAvailableInSeconds: 60 }; },
      resetPasswordWithCode: async ({ base, email, code, password }) => { resets.push(['reset', base, email, code, password]);
        return resetFailure === 'reset' ? { ok: false, message: 'Incorrect code. 4 attempts remaining.' } : { ok: true, message: '' }; },
    },
  }, { window: b.window, setTimeout: time.schedule, clearTimeout: time.cancel, console: silent });
  h.mount(component, { pendingPlan, onComplete() {}, onOpenSubscription: value => upgrades.push(value) });
  return { h, time, routes, upgrades, writes, resets, profile,
    get signins() { return signins; }, get signouts() { return signouts; },
    async login() {
      await flush();
      for (const [id, value] of [['email', user.email], ['password', 'synthetic-password']]) {
        find(h, node => node.props?.id === id).props.onChange({ target: { value } }); await flush();
      }
      await find(h, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
      await time.advance(800);
    }, stop() { h.stop(); } };
}

for (const intent of ['', 'free', 'pro', 'pro_max', 'https://evil.example']) {
  test(`real signup creates profile, signs out, then signs the account in to choose a plan: ${intent || 'default'}`, async () => {
    const fixture = signup(new URLSearchParams({ pendingPlan: intent }).toString());
    await fixture.submit();
    assert.deepEqual(fixture.events, ['code', 'verify', 'account', 'confirm', 'profile', 'signout', 'signin']);
    assert.deepEqual(fixture.verification, [['send', 'fixture@example.invalid'], ['verify', 'fixture@example.invalid', '123456'],
      ['confirm', 'fixture@example.invalid', 'synthetic-token'], ['signin', 'fixture@example.invalid', 'synthetic-password']]);
    assert.equal(fixture.profiles[0].role, 'Developer');
    assert.equal(fixture.profiles[0].businessSegment, 'Grocery');
    assert.equal(fixture.profiles[0].email, 'fixture@example.invalid');
    assert.equal(fixture.profiles[0].termsAccepted, true);
    assert.equal(fixture.profiles[0].termsVersion, registration.TERMS_VERSION);
    assert.equal(fixture.profiles[0].privacyConsent, true);
    // Plans come before the dashboard; only a valid paid CTA preselects its checkout.
    assert.deepEqual(fixture.routes, []);
    const plans = find(fixture.h, node => node.type === 'PostSignupPlans');
    assert.equal(plans.props.initialPlan, ['pro', 'pro_max'].includes(intent) ? intent : null);
    assert.equal(nodes(fixture.h.output, node => node.type === 'form').length, 0);
    fixture.h.stop();
  });
}
for (const intent of ['', 'pro', 'https://evil.example']) {
  test(`a failed sign-in after signup falls back to the landing login handoff: ${intent || 'default'}`, async () => {
    const fixture = signup(new URLSearchParams({ pendingPlan: intent }).toString(), 'signin');
    await fixture.submit();
    assert.deepEqual(fixture.events, ['code', 'verify', 'account', 'confirm', 'profile', 'signout', 'signin', 'navigation']);
    assert.equal(nodes(fixture.h.output, node => node.type === 'PostSignupPlans').length, 0);
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
for (const failure of ['profile', 'signout', 'confirm']) test(`signup ${failure} failure cannot claim successful handoff`, async () => {
  const fixture = signup('', failure); await fixture.submit();
  assert.equal(fixture.routes.length, 0);
  assert.match(text(fixture.h.output), { signout: /session could not be closed/, profile: /Account setup could not be verified/,
    confirm: /could not confirm your verified email address/ }[failure]);
  // An identity whose email was never confirmed gets no profile and is removed.
  if (failure === 'confirm') assert.deepEqual(fixture.events.slice(2), ['account', 'confirm', 'delete', 'signout']);
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

for (const intent of [null, 'free', 'pro', 'pro_max']) test(`actual inline presentation and Register link to Create Account: ${intent}`, async () => {
  const fixture = modal(intent); await flush();
  const copy = text(fixture.h.output);
  assert.ok(copy.includes(loginTitle));
  assert.ok(copy.includes(loginSubtitle));
  assert.ok(!copy.includes('InventaAPI Free') && !copy.includes('Free plan dashboard'));
  assert.ok(!copy.includes('Welcome to InventaAPI'));
  // The business segment is chosen once at signup, never at login.
  assert.equal(nodes(fixture.h.output, node => node.props?.id === 'segment' || node.type === 'select').length, 0);
  assert.ok(!copy.includes('Business Segment'));
  for (const id of ['email', 'password']) assert.equal(find(fixture.h, node => node.props?.id === id).props.required, true);
  const signupLink = find(fixture.h, node => node.type === 'Link' && text(node).trim() === 'Register');
  assert.equal(signupLink.props.href, navigation.customerSignupDestination(intent ?? ''));
  assert.equal(signupLink.props.href, intent ? `/signup?pendingPlan=${intent}` : '/signup');
  assert.equal(nodes(fixture.h.output, node => node.props?.href === '#pricing-plans').length, 0);
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
for (const [businessSegment, selectedSegment] of [['Pharmacy', 'Pharmacy'], ['Hardware', undefined], ['Grocery', 'Hardware']]) {
  test(`login needs no segment choice and writes no profile field: ${businessSegment}/${selectedSegment}`, async () => {
    const fixture = modal(); Object.assign(fixture.profile, { businessSegment, selectedSegment }); await fixture.login();
    assert.equal(fixture.signins, 1); assert.equal(fixture.signouts, 0);
    assert.deepEqual(fixture.writes, []); assert.deepEqual(fixture.routes, ['/dashboard']); fixture.stop();
  });
}
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

const resetForm = fixture => find(fixture.h, node => node.type === 'form');
const typeInto = async (fixture, id, value) => {
  find(fixture.h, node => node.props?.id === id).props.onChange({ target: { value } }); await flush();
};
test('forgot password emails a code to the normalized address, then the code sets a new password', async () => {
  const fixture = modal(); await flush();
  find(fixture.h, node => node.type === 'button' && /Forgot password/i.test(text(node))).props.onClick(); await flush();
  assert.match(text(fixture.h.output), /Reset your password/);
  await typeInto(fixture, 'reset-email', 'fixture@example'); await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  assert.deepEqual(fixture.resets, []); assert.match(text(fixture.h.output), /valid email address/);
  await typeInto(fixture, 'reset-email', ' Fixture@Example.Invalid '); await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  assert.deepEqual(fixture.resets, [['send', 'https://synthetic.invalid', 'fixture@example.invalid']]);
  // The reply is the same whether or not the address has an account.
  assert.match(text(fixture.h.output), /If\s+fixture@example\.invalid\s+has an InventaAPI account, we sent it a 6-digit code\./);
  const hint = find(fixture.h, node => node.type === 'p' && text(node).includes('has an InventaAPI account'));
  assert.ok(hint.props.children.includes('It expires in 10 minutes. If you don\'t see it, check your Spam or Promotions folder.'));
  const code = find(fixture.h, node => node.props?.id === 'reset-code');
  assert.equal(code.props.inputMode, 'numeric'); assert.equal(code.props.autoComplete, 'one-time-code'); assert.equal(code.props.maxLength, 6);
  await typeInto(fixture, 'reset-code', '12a-34 56');
  assert.equal(find(fixture.h, node => node.props?.id === 'reset-code').props.value, '123456');
  await typeInto(fixture, 'new-password', 'new-synthetic-password'); await typeInto(fixture, 'confirm-new-password', 'different-password');
  await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  assert.equal(fixture.resets.length, 1); assert.match(text(fixture.h.output), /Passwords do not match/);
  await typeInto(fixture, 'new-password', 'short'); await typeInto(fixture, 'confirm-new-password', 'short');
  await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  assert.equal(fixture.resets.length, 1); assert.match(text(fixture.h.output), /at least 6 characters/);
  await typeInto(fixture, 'new-password', 'new-synthetic-password'); await typeInto(fixture, 'confirm-new-password', 'new-synthetic-password');
  await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  assert.deepEqual(fixture.resets[1], ['reset', 'https://synthetic.invalid', 'fixture@example.invalid', '123456', 'new-synthetic-password']);
  // Back on Login with the address filled in and no password carried over.
  assert.ok(text(fixture.h.output).includes(loginTitle));
  assert.match(text(fixture.h.output), /Your password has been reset\. Log in with your new password\./);
  assert.equal(find(fixture.h, node => node.props?.id === 'email').props.value, 'fixture@example.invalid');
  assert.equal(find(fixture.h, node => node.props?.id === 'password').props.value, '');
  assert.equal(fixture.signins, 0); assert.deepEqual(fixture.routes, []); fixture.stop();
});
test('a rejected reset code keeps the code step and shows the reason', async () => {
  const fixture = modal(null, 'Free', false, 'reset'); await flush();
  find(fixture.h, node => node.type === 'button' && /Forgot password/i.test(text(node))).props.onClick(); await flush();
  await typeInto(fixture, 'reset-email', 'fixture@example.invalid'); await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  await typeInto(fixture, 'reset-code', '000000');
  await typeInto(fixture, 'new-password', 'new-synthetic-password'); await typeInto(fixture, 'confirm-new-password', 'new-synthetic-password');
  await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  assert.match(text(fixture.h.output), /Incorrect code\. 4 attempts remaining\./);
  assert.equal(nodes(fixture.h.output, node => node.props?.id === 'reset-code').length, 1);
  find(fixture.h, node => node.type === 'button' && /Back to Login/.test(text(node))).props.onClick(); await flush();
  assert.ok(text(fixture.h.output).includes(loginTitle));
  assert.equal(nodes(fixture.h.output, node => node.type === 'form').length, 1); fixture.stop();
});
test('reset resend waits for its cooldown; a refused send stays on the email step', async () => {
  const fixture = modal(); await flush();
  find(fixture.h, node => node.type === 'button' && /Forgot password/i.test(text(node))).props.onClick(); await flush();
  await typeInto(fixture, 'reset-email', 'fixture@example.invalid'); await resetForm(fixture).props.onSubmit({ preventDefault() {} }); await flush();
  const resend = () => find(fixture.h, node => node.type === 'button' && /Resend code/.test(text(node)));
  assert.equal(resend().props.disabled, true); assert.match(text(resend()), /Resend code in 60s/);
  await fixture.time.advance(60_000);
  assert.equal(resend().props.disabled, false);
  await resend().props.onClick(); await flush();
  assert.equal(fixture.resets.filter(call => call[0] === 'send').length, 2);
  assert.match(text(fixture.h.output), /We sent a new code to fixture@example\.invalid\./); fixture.stop();
  const refused = modal(null, 'Free', false, 'send'); await flush();
  find(refused.h, node => node.type === 'button' && /Forgot password/i.test(text(node))).props.onClick(); await flush();
  await typeInto(refused, 'reset-email', 'fixture@example.invalid'); await resetForm(refused).props.onSubmit({ preventDefault() {} }); await flush();
  assert.match(text(refused.h.output), /Please wait 42 seconds/);
  assert.equal(nodes(refused.h.output, node => node.props?.id === 'reset-email').length, 1); refused.stop();
});

test('plain root needs no query to render inline form; pricing CTAs only register', async () => {
  const entry = landing(); await flush();
  assert.ok(entry.modal()); assert.equal(entry.modal().pendingPlan, null);
  const cards = find(entry.h, node => node.type === 'PlanCards');
  for (const plan of ['free', 'pro', 'pro_max']) {
    assert.equal(cards.props.isDisabled(plan), false);
    cards.props.onSelect(plan);
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
