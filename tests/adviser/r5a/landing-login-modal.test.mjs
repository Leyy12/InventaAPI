import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');

test('Customer root is Landing for fresh and returning unauthenticated browsers', () => {
  const source = read('dashboard/src/app/page.tsx');
  assert.match(source, /<AuthEntry \/>/);
  assert.doesNotMatch(source, /landingSeen|useSyncExternalStore|router\.replace/);
  assert.match(read('dashboard/src/components/auth/AuthEntry.tsx'), /if \(loading \|\| destination\) return/);
});

test('Landing retains permanent login and pricing-first registration', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  assert.match(source, /<LoginForm/);
  assert.match(read('dashboard/src/components/auth/LoginForm.tsx'), /Register/);
  assert.doesNotMatch(source, /proceed\('\/login'\)/);
});

test('Landing page keeps centered sections and navbar navigation without redundant CTAs', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  const header = source.slice(source.indexOf('{/* Navigation */}'), source.indexOf('{/* Hero Section */}'));
  assert.match(header, /Features/);
  assert.match(header, /How it Works/);
  assert.match(header, /Pricing/);
  assert.doesNotMatch(header, /API Docs/);
  assert.doesNotMatch(header, />\s*Login\s*</);
  assert.doesNotMatch(header, />\s*Sign Up\s*</);
  assert.match(header, /href="#features"[^>]*>Features</);
  assert.match(header, /href="#how-it-works"[^>]*>How it Works</);
  assert.match(header, /href="#pricing"[^>]*>Pricing</);
  assert.doesNotMatch(header, /href="\/docs"/);
  assert.doesNotMatch(source, /Get Started →|See How It Works →|View Plans(?: →)?/);
  assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,440px\)\]/);
  assert.match(source, /min-w-0 text-center lg:text-left/);
  assert.doesNotMatch(header, /max-w-7xl|mx-auto/);
  assert.match(source, /grid md:grid-cols-3 gap-8/);
  assert.doesNotMatch(source, /mt-12 text-center/);
  assert.match(source, /focus-visible:ring-2/);
  assert.match(source, /min-h-screen[^"]*overflow-x-hidden/);
  for (const id of ['features', 'how-it-works', 'pricing']) {
    assert.match(source, new RegExp('<section id="' + id + '" className="scroll-mt-20'));
  }
  const styles = read('dashboard/src/app/globals.css');
  assert.match(styles, /scroll-behavior:\s*smooth/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /:focus-visible/);
  assert.match(source, /Grocery, Pharmacy, and Hardware/);
  assert.doesNotMatch(source, /hardware, grocery, and electronics/);
});

test('Landing navigation exposes accessible mobile links and the existing Docs route', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  const navigation = source.slice(source.indexOf('{/* Navigation */}'), source.indexOf('{/* Hero Section */}'));
  const mobileNavigation = navigation.slice(navigation.indexOf('id="landing-mobile-navigation"'));

  assert.ok(read('dashboard/src/app/docs/page.tsx'));
  assert.equal((navigation.match(/href="\/docs"/g) || []).length, 0);
  assert.match(read('dashboard/src/components/layout/dashboard-navigation.ts'), /name: 'Documentation', href: '\/docs'/);
  assert.match(navigation, /aria-label=\{mobileMenuOpen \? "Close navigation menu" : "Open navigation menu"\}/);
  assert.match(navigation, /aria-expanded=\{mobileMenuOpen\}/);
  assert.match(navigation, /aria-controls="landing-mobile-navigation"/);
  assert.match(navigation, /ref=\{mobileMenuButtonRef\}/);
  assert.match(navigation, /setMobileMenuOpen\(\(open\) => !open\)/);
  assert.doesNotMatch(navigation, /setMobileMenuOpen\(false\);\s*setShowLoginModal\(true\)/);
  assert.match(navigation, /md:hidden/);
  assert.match(source, /event\.key === "Escape"[\s\S]*?setMobileMenuOpen\(false\)[\s\S]*?mobileMenuButtonRef\.current\?\.focus\(\)/);
  for (const [label, href] of [
    ['Features', '#features'],
    ['How it Works', '#how-it-works'],
    ['Pricing', '#pricing'],
  ]) {
    assert.match(mobileNavigation, new RegExp(`href="${href.replace('#', '\\#')}"[^>]*>[\\s\\S]*?${label}`));
    assert.match(mobileNavigation, /onClick=\{\(\) => setMobileMenuOpen\(false\)\}/);
  }
});

test('Inline login has no popup or dismissal and preserves existing form paths', () => {
  const source = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.doesNotMatch(source, /role="dialog"/);
  assert.doesNotMatch(source, /aria-modal|fixed inset-0|zoom-in|backdrop-blur/);
  assert.doesNotMatch(source, /onClose|Escape/);
  assert.match(source, /aria-labelledby="login-form-title"/);
  for (const token of ['Forgot password?', 'Register', 'Reset Code', 'New Password']) assert.ok(source.includes(token), token);
});

test('Customer Login asks only for email and password; the segment is chosen once at signup', () => {
  const source = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.match(source, /id="email"/);
  assert.match(source, /id="password"/);
  assert.doesNotMatch(source, /id="segment"|Business Segment|Select your business segment|PRODUCT_SEGMENTS|setShowSegment|requestedSegment/);
  assert.match(read('dashboard/src/app/signup/page.tsx'), /name="businessSegment"/);
});

test('Login never changes the stored segment; scope stays profile/plan-authorized on the server', () => {
  const source = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.match(source, /await readSubscription\(user\)/);
  assert.match(source, /await signOut\(auth\)/);
  assert.doesNotMatch(source, /updateDoc|selectedSegment|loginSegmentAllowed|normalizeSegment/);
  assert.match(read('services/daas-catalog.js'), /activeCustomerSegment\(userData\)/);
  assert.match(read('services/customer-segment.js'), /restrictedSegmentAccount\(account\) \? account\?\.businessSegment : account\?\.selectedSegment/);
});

test('Password reset uses an emailed code, never a Firebase reset link', () => {
  const source = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.doesNotMatch(source, /sendPasswordResetEmail/);
  assert.match(source, /sendPasswordResetCode\(\{ base: API_BASE, email: target \}\)/);
  assert.match(source, /resetPasswordWithCode\(\{ base: API_BASE, email: resetSentTo, code: resetCode, password: newPassword \}\)/);
  assert.match(source, /autoComplete="one-time-code"/);
});

test('Existing Admin authentication boundary remains intact', () => {
  const source = read('dashboard/src/components/auth/LoginForm.tsx');
  assert.match(source, /if \(role === "admin"\)/);
  assert.match(source, /adminLoginDestination\(/);
  assert.match(read('services/product-contract.js'), /PRODUCT_SEGMENTS = Object\.freeze\(\['Grocery', 'Pharmacy', 'Hardware'\]\)/);
});

test('Successful Customer logout returns to root without resurrecting popup intent', () => {
  const source = read('dashboard/src/lib/firebase/auth-context.tsx');
  assert.ok(source.includes('if (busy) beginCustomerLogout();'));
  assert.ok(source.includes("clearSession(); router.replace('/')"));
  assert.doesNotMatch(source, /completeLanding|login=true&from=logout/);
});

test('Post-logout intent is session-scoped, consumed once, and leaves root URL clean', () => {
  const source = read('services/auth-navigation.ts');
  assert.match(source, /POST_LOGOUT_LOGIN_KEY/);
  assert.match(source, /sessionStorage\.removeItem\(POST_LOGOUT_LOGIN_KEY\)/);
  assert.match(read('dashboard/src/components/auth/AuthEntry.tsx'), /consumePostLogoutLoginEntry\(\)/);
});

test('Legacy landing marker cannot decide authentication or root routing', () => {
  const source = read('services/auth-navigation.ts');
  assert.match(source, /return null;\s*}/);
  assert.match(source, /LANDING_SEEN_KEY/);
  assert.doesNotMatch(read('dashboard/src/app/page.tsx'), /LANDING_SEEN_KEY|landing-completed/);
});
