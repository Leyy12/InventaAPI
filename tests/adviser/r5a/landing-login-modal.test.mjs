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
