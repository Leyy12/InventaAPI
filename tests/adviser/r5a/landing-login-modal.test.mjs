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

test('Landing Login opens the modal in place and preserves Signup navigation', () => {
  const source = read('dashboard/src/components/auth/AuthEntry.tsx');
  assert.match(source, /setShowLoginModal\(true\)/);
  assert.match(source, /proceed\('\/signup'\)/);
  assert.doesNotMatch(source, /proceed\('\/login'\)/);
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
