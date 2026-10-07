import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { customerSignupDestination, customerLoginEntryDestination, navigationDecision } from '../../services/auth-navigation.ts';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const entry = read('dashboard/src/components/auth/AuthEntry.tsx');
const form = read('dashboard/src/components/auth/LoginForm.tsx');
const hero = entry.slice(entry.indexOf('{/* Hero Section */}'), entry.indexOf('{/* Features Grid */}'));
const header = entry.slice(entry.indexOf('{/* Navigation */}'), entry.indexOf('{/* Hero Section */}'));

test('header brand uses safe page gutters rather than the centered max-width container', () => {
  assert.match(header, /className="px-4 sm:px-6 lg:px-8"/);
  assert.doesNotMatch(header, /max-w-7xl|mx-auto/);
});
test('desktop hero places unchanged marketing first and reusable inline login second', () => {
  assert.match(hero, /grid items-center gap-10 lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,440px\)\]/);
  assert.match(hero, /text-center lg:text-left/);
  for (const copy of ['Data-as-a-Service Platform v1.0', 'Centralized Product', 'Database for SMEs',
    'Stop building your product catalog from scratch. Consume our standardized, highly-available REST API to power your Point of Sale, Inventory, or E-Commerce applications instantly.']) assert.ok(hero.includes(copy));
  assert.ok(hero.indexOf('<h1') < hero.indexOf('<LoginForm'));
  assert.equal((entry.match(/<LoginForm/g) || []).length, 1);
});
test('mobile stacks marketing and login with shrinkable columns and bounded card width', () => {
  assert.match(hero, /min-w-0 w-full max-w-md mx-auto/);
  assert.doesNotMatch(hero, /grid-cols-2|w-\[440px\]/);
  assert.match(form, /w-full glass-card[\s\S]*p-6 sm:p-8/);
  assert.match(entry, /w-\[calc\(100vw-2rem\)\] max-w-lg/);
});
test('both navbar variants retain three section links, not public API Docs', () => {
  for (const target of ['#features', '#how-it-works', '#pricing']) assert.equal(header.split('href="' + target + '"').length - 1, 2);
  assert.doesNotMatch(header, /API Docs|href="\/docs"/);
  assert.ok(existsSync(new URL('../../dashboard/src/app/docs/page.tsx', import.meta.url)));
  assert.match(read('dashboard/src/components/layout/dashboard-navigation.ts'), /name: 'Documentation', href: '\/docs'/);
});
test('login exists without popup lifecycle, overlay, dismissal or duplicated Firebase implementation', () => {
  assert.match(form, /export default function LoginForm/);
  assert.doesNotMatch(form, /isOpen|onClose|standalone|aria-modal|role="dialog"|fixed inset-0|Escape|zoom-in/);
  assert.doesNotMatch(entry, /LoginModal|showLoginModal/);
  assert.equal(existsSync(new URL('../../dashboard/src/components/auth/LoginModal.tsx', import.meta.url)), false);
  assert.equal((form.match(/await signInWithEmailAndPassword/g) || []).length, 1);
});
test('form remains accessible, required-segment and ordinary Free presentation', () => {
  assert.match(form, /aria-labelledby="login-form-title"/);
  assert.match(form, /role="alert"/); assert.match(form, /role="status"/);
  assert.match(form, /id="segment"\s+required/);
  for (const value of ['Email Address', 'Password', 'Business Segment', 'Forgot password?', 'Login to continue to InventaAPI Free']) assert.ok(form.includes(value));
  assert.doesNotMatch(form, /Welcome to InventaAPI/);
  assert.match(form, /href="#pricing"[\s\S]*Register/);
});
for (const plan of ['free', 'pro', 'pro_max']) test('pricing intent registers without granting entitlement: ' + plan, () => {
  assert.equal(customerSignupDestination(plan), '/signup?pendingPlan=' + plan);
  assert.ok(entry.includes('router.push(customerSignupDestination("' + plan + '"))'));
});
test('unknown signup destinations cannot become external navigation', () => {
  for (const intent of ['//evil.example', 'javascript:alert(1)', 'https://evil.example']) assert.equal(customerSignupDestination(intent), '/signup');
});
test('compatibility strips popup and return-url instructions while preserving safe paid intent', () => {
  assert.equal(customerLoginEntryDestination(), '/');
  assert.equal(customerLoginEntryDestination(new URLSearchParams('login=true&pendingPlan=pro_max&registered=true&next=https://evil.example')),
    '/?registered=true&pendingPlan=pro_max');
});
test('root in-progress auth handoff never bypasses protected routes or Admin separation', () => {
  assert.equal(navigationDecision({ path: '/', initializing: false, role: 'customer', entryFlow: true }), null);
  assert.equal(navigationDecision({ path: '/', initializing: false, role: 'customer' }), '/dashboard');
  for (const path of ['/dashboard', '/dashboard/products']) assert.equal(navigationDecision({
    path, initializing: false, role: null, entryFlow: true }), '/');
  assert.equal(navigationDecision({ path: '/', initializing: false, role: 'admin', entryFlow: true }), 'admin-app');
});
test('successful signup still provisions before sign-out and navigation; footer preserves paid intent', () => {
  const signup = read('dashboard/src/app/signup/page.tsx');
  assert.ok(signup.indexOf('await setDoc') > signup.indexOf('await createUserWithEmailAndPassword'));
  assert.ok(signup.indexOf('await signOut(auth)') > signup.indexOf('await setDoc'));
  assert.ok(signup.indexOf('const redirectUrl = customerLoginEntryDestination(intent)') > signup.indexOf('await signOut(auth)'));
  assert.ok(signup.indexOf('router.push(redirectUrl)') > signup.indexOf('const redirectUrl = customerLoginEntryDestination(intent)'));
  assert.match(signup, /href=\{customerLoginEntryDestination\(new URLSearchParams/);
});
test('legacy logout markers are consumed, never mapped to form/modal visibility', () => {
  const body = entry.slice(entry.indexOf('    if (!loading && !user)'), entry.indexOf('  const destination'));
  assert.match(body, /consumePostLogoutLoginEntry\(\)/);
  assert.doesNotMatch(body, /setPendingPlan|setShow|router/);
  assert.match(read('dashboard/src/lib/firebase/auth-context.tsx'), /if \(busy\) beginCustomerLogout\(\)/);
});
