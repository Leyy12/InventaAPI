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

test('Landing retains its Login modal flow and Create Account remains available', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  assert.match(source, /setShowLoginModal\(true\)/);
  assert.match(read('dashboard/src/components/auth/LoginModal.tsx'), /Create Account/);
  assert.doesNotMatch(source, /proceed\('\/login'\)/);
});

test('Landing page keeps centered sections and navbar navigation without redundant CTAs', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  const header = source.slice(source.indexOf('{/* Navigation */}'), source.indexOf('{/* Hero Section */}'));
  assert.match(header, /Features/);
  assert.match(header, /How it Works/);
  assert.match(header, /Pricing/);
  assert.match(header, /API Docs/);
  assert.doesNotMatch(header, />\s*Login\s*</);
  assert.doesNotMatch(header, />\s*Sign Up\s*</);
  assert.match(header, /href="#features"[^>]*>Features</);
  assert.match(header, /href="#how-it-works"[^>]*>How it Works</);
  assert.match(header, /href="#pricing"[^>]*>Pricing</);
  assert.match(header, /href="\/docs"[^>]*>API Docs</);
  assert.doesNotMatch(source, /Get Started →|See How It Works →|View Plans(?: →)?/);
  assert.match(source, /max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center/);
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
  assert.equal((navigation.match(/href="\/docs"/g) || []).length, 2);
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
    ['API Docs', '/docs'],
  ]) {
    assert.match(mobileNavigation, new RegExp(`href="${href.replace('#', '\\#')}"[^>]*>[\\s\\S]*?${label}`));
    assert.match(mobileNavigation, /onClick=\{\(\) => setMobileMenuOpen\(false\)\}/);
  }
});

test('Login modal exposes close, Escape, dialog semantics, and existing form paths', () => {
  const source = read('dashboard/src/components/auth/LoginModal.tsx');
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /aria-label="Close login"/);
  for (const token of ['Forgot password?', 'Create Account', 'Business Segment']) assert.ok(source.includes(token), token);
});

test('Customer Login always requires the canonical business segment before Firebase auth', () => {
  const source = read('dashboard/src/components/auth/LoginModal.tsx');
  assert.match(source, /PRODUCT_SEGMENTS.*product-contract\.js/);
  assert.match(source, /setShowSegment\(true\)/);
  assert.match(source, /id="segment"/);
  assert.match(source, /required/);
  assert.match(source, /Select your business segment/);
  const passwordOffset = source.indexOf('id="password"');
  const segmentOffset = source.indexOf('id="segment"');
  assert.ok(passwordOffset >= 0 && segmentOffset > passwordOffset, 'segment follows password');
  const missingSegment = source.indexOf('if (!requestedSegment)');
  const firebaseSignIn = source.indexOf('await signInWithEmailAndPassword');
  assert.ok(missingSegment >= 0 && firebaseSignIn > missingSegment, 'missing segment blocks sign-in');
});

test('Segment selection is profile/plan-authorized and cannot grant access client-side', () => {
  const source = read('dashboard/src/components/auth/LoginModal.tsx');
  assert.match(source, /normalizeSegment\(userData\?\.selectedSegment\)/);
  assert.match(source, /normalizeSegment\(userData\?\.businessSegment\)/);
  assert.match(source, /await readSubscription\(user\)/);
  assert.match(source, /loginSegmentAllowed\(\{ \.\.\.userData, plan \}, chosenSegment\)/);
  assert.match(source, /await signOut\(auth\)/);
  assert.match(source, /That business segment is not available for this account/);
  assert.match(source, /updateDoc\(doc\(db, "users", user\.uid\), \{ selectedSegment: chosenSegment \}\)/);
  assert.doesNotMatch(source, /setSegment\([^)]*\);\s*router\.push\("\/dashboard"/s);
});

test('Selector reset and existing Admin authentication boundary remain intact', () => {
  const source = read('dashboard/src/components/auth/LoginModal.tsx');
  assert.match(source, /setSegment\(""\)/);
  assert.match(source, /if \(role === "admin"\)/);
  assert.match(source, /adminLoginDestination\(/);
  assert.match(read('services/product-contract.js'), /PRODUCT_SEGMENTS = Object\.freeze\(\['Grocery', 'Pharmacy', 'Hardware'\]\)/);
});

test('Successful Customer logout returns to root with one-time modal intent', () => {
  const source = read('dashboard/src/lib/firebase/auth-context.tsx');
  assert.ok(source.includes('if (busy) beginCustomerLogout();'));
  assert.ok(source.includes("clearSession(); router.replace('/')"));
  assert.doesNotMatch(source, /completeLanding|login=true&from=logout/);
});

test('Post-logout intent is session-scoped, consumed once, and leaves root URL clean', () => {
  const source = read('services/auth-navigation.ts');
  assert.match(source, /POST_LOGOUT_LOGIN_KEY/);
  assert.match(source, /sessionStorage\.removeItem\(POST_LOGOUT_LOGIN_KEY\)/);
  assert.match(read('dashboard/src/components/auth/AuthEntry.tsx'), /consumePostLogoutLogin\(\)/);
});

test('Legacy landing marker cannot decide authentication or root routing', () => {
  const source = read('services/auth-navigation.ts');
  assert.match(source, /return null;\s*}/);
  assert.match(source, /LANDING_SEEN_KEY/);
  assert.doesNotMatch(read('dashboard/src/app/page.tsx'), /LANDING_SEEN_KEY|landing-completed/);
});
