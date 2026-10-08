import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { hooks, load, nodes } from './workspace-refresh/harness.mjs';
import * as navigation from '../../services/auth-navigation.ts';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const form = read('dashboard/src/components/auth/LoginForm.tsx');
const signup = read('dashboard/src/app/signup/page.tsx');
const entry = read('dashboard/src/components/auth/AuthEntry.tsx');
const icons = new Proxy({}, { get: (_, name) => String(name) });
const text = value => Array.isArray(value) ? value.map(text).join(' ') :
  value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');

for (const pendingPlan of [null, 'free', 'pro', 'pro_max']) {
  test(`real inline card is plan-neutral without discarding ${pendingPlan} continuation`, () => {
    const h = hooks();
    const component = load('dashboard/src/components/auth/LoginForm.tsx', 'exports.default', h, {
      'next/image': 'Image', 'firebase/auth': {}, 'firebase/firestore': {},
      '@/lib/firebase/config': { auth: {}, db: {} },
      'next/navigation': { useRouter: () => ({}) },
      '@/lib/firebase/auth-context': { useAuth: () => ({ refreshUserDoc() {} }) },
      'lucide-react': icons, '../../../../services/auth-navigation': navigation,
      '../../../../services/product-contract.js': { PRODUCT_SEGMENTS: ['Grocery', 'Pharmacy', 'Hardware'] },
      '../../../../services/customer-segment.js': {}, '@/lib/subscription': {},
    });
    h.mount(component, { pendingPlan, onComplete() {} });
    try {
      assert.equal(text(nodes(h.output, node => node.props?.id === 'login-form-title')[0]), 'Login to InventaAPI');
      assert.ok(text(h.output).includes('Log in to access your dashboard and manage your account.'));
      assert.doesNotMatch(text(h.output), /InventaAPI Free|Free plan dashboard|Pro upgrade|PayMongo checkout/);
      assert.equal(nodes(h.output, node => node.type === 'form').length, 1);
      assert.equal(nodes(h.output, node => node.props?.role === 'dialog').length, 0);
      assert.equal(nodes(h.output, node => node.props?.href === '#pricing-plans').length, 1);
      const logo = nodes(h.output, node => node.type === 'Image')[0];
      assert.equal(logo.props.width, 64); assert.equal(logo.props.height, 64);
      for (const id of ['email', 'password', 'segment']) {
        assert.equal(nodes(h.output, node => node.props?.id === id)[0].props.required, true);
      }
    } finally { h.stop(); }
  });
}

test('paid intent still reaches the existing authoritative login continuation', () => {
  assert.match(form, /if \(\(pendingPlan === "pro" \|\| pendingPlan === "pro_max"\)/);
  assert.match(form, /effective\.canPurchaseProMax/);
  assert.match(form, /onOpenSubscription\?\.\(pendingPlan\)/);
  assert.ok(form.indexOf('onOpenSubscription?.(pendingPlan)') > form.indexOf('loginSegmentAllowed('));
  assert.match(entry, /pendingPlan=\{pendingPlan\}/);
});

test('Register skips the section heading and targets the unchanged plan grid with navbar clearance', () => {
  assert.match(form, /href="#pricing-plans"/);
  assert.doesNotMatch(form, /href="#pricing"/);
  assert.match(entry, /id="pricing-plans" className="scroll-mt-24 grid md:grid-cols-3 gap-8 max-w-6xl mx-auto"/);
  assert.ok(entry.indexOf('id="pricing-plans"') > entry.indexOf('Simple, transparent pricing.'));
  assert.equal((entry.match(/id="pricing-plans"/g) || []).length, 1);
  assert.match(read('dashboard/src/app/globals.css'), /scroll-behavior:\s*smooth/);
  assert.match(read('dashboard/src/app/globals.css'), /prefers-reduced-motion:\s*reduce/);
});

test('Pricing navbar remains heading navigation; all three signup destinations remain intact', () => {
  assert.equal((entry.match(/href="#pricing"/g) || []).length, 2);
  for (const plan of ['free', 'pro', 'pro_max']) {
    assert.ok(entry.includes(`router.push(customerSignupDestination("${plan}"))`));
    assert.equal(navigation.customerSignupDestination(plan), `/signup?pendingPlan=${plan}`);
  }
});

test('real signup retains every input, consent and both footer/submit actions', () => {
  const h = hooks();
  const component = load('dashboard/src/app/signup/page.tsx', 'SignupPageInner', h, {
    'firebase/auth': {}, 'firebase/firestore': {}, '@/lib/firebase/config': { auth: {}, db: {} },
    'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    'lucide-react': icons, 'next/link': 'Link', 'next/image': 'Image',
    '../../../../services/auth-navigation': navigation,
  });
  h.mount(component);
  try {
    for (const name of ['fullName', 'email', 'password', 'confirmPassword', 'businessName', 'businessSegment']) {
      const input = nodes(h.output, node => node.props?.name === name);
      assert.equal(input.length, 1); assert.equal(input[0].props.required, true);
    }
    assert.equal(nodes(h.output, node => node.props?.name === 'privacyConsent')[0].props.checked, false);
    assert.ok(text(h.output).includes('RA 10173'));
    assert.equal(nodes(h.output, node => node.props?.href === '/privacy-policy').length, 1);
    assert.equal(nodes(h.output, node => node.props?.type === 'submit').length, 1);
    assert.equal(nodes(h.output, node => node.type === 'Link' && node.props.href === '/').length, 1);
    assert.equal(nodes(h.output, node => node.type === 'Image')[0].props.width, 64);
  } finally { h.stop(); }
});

test('signup still validates consent, provisions, signs out, then returns to the single root', () => {
  assert.match(signup, /if \(!formData\.privacyConsent\)/);
  assert.ok(signup.indexOf('await setDoc') > signup.indexOf('await createUserWithEmailAndPassword'));
  assert.ok(signup.indexOf('await signOut(auth)') > signup.indexOf('await setDoc'));
  assert.ok(signup.indexOf('router.push(redirectUrl)') > signup.indexOf('await signOut(auth)'));
  assert.match(signup, /customerLoginEntryDestination\(intent\)/);
});

test('compact form styles permit natural mobile page scrolling, never internal scrolling/clipping', () => {
  for (const source of [form, signup]) {
    assert.doesNotMatch(source, /overflow-(?:y-auto|auto|scroll|hidden)|max-h-|(?<![\w-])h-screen/);
    assert.match(source, /p-5 sm:p-6/);
    assert.match(source, /space-y-3/);
    assert.match(source, /py-2\.5 text-sm/);
    assert.doesNotMatch(source, /scale-|text-\[9px\]/);
  }
  assert.match(signup, /min-h-screen flex items-center justify-center px-4 py-6/);
});

test('inline hero/mobile order and absence of LoginModal remain unchanged', () => {
  assert.match(entry, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,440px\)\]/);
  assert.ok(entry.indexOf('<h1') < entry.indexOf('<LoginForm'));
  assert.match(entry, /text-center lg:text-left/);
  assert.equal(existsSync(new URL('../../dashboard/src/components/auth/LoginModal.tsx', import.meta.url)), false);
  for (const source of [entry, form, signup]) assert.doesNotMatch(source, /showLoginModal|setShowLoginModal|role="dialog"/);
});

test('logout and protected navigation still fail closed without a popup', () => {
  navigation.beginCustomerLogout();
  assert.equal(navigation.customerLogoutDestination('/dashboard'), null);
  navigation.markPostLogoutLogin();
  assert.equal(navigation.customerLogoutDestination('/dashboard'), '/');
  navigation.consumePostLogoutLoginEntry();
  assert.equal(navigation.customerLoginEntryDestination(), '/');
  assert.equal(navigation.navigationDecision({ path: '/dashboard/products', initializing: false, role: null }), '/');
  const provider = read('dashboard/src/lib/firebase/auth-context.tsx');
  assert.match(provider, /clearSession\(\); router\.replace\('\/'\)/);
  assert.doesNotMatch(provider, /finally \{ router\.replace/);
});
