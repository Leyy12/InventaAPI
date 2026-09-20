import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
test('UI gets authoritative plan/quota/expiry and does not retain cached Pro on failure', () => {
  const auth = source('dashboard/src/lib/firebase/auth-context.tsx');
  assert.match(auth, /plan: entitlement\?\.plan \?\? 'Unavailable'/);
  assert.match(auth, /apiRequestLimit: entitlement\?\.apiRequestLimit/);
  assert.match(auth, /subscriptionExpiresAt: entitlement\?\.subscriptionExpiresAt/);
  assert.match(source('dashboard/src/lib/subscription.ts'), /getIdToken\(\)/);
  assert.match(source('dashboard/src/lib/subscription.ts'), /checkout\/subscription-status/);
  assert.match(auth, /createEntitlementPoller/);
  assert.match(auth, /session\.poller\.refresh\(\)/);
  assert.match(auth, /poller\.stop\(\)/);
  assert.match(source('dashboard/src/lib/entitlement-poller.ts'), /secondsRemaining/);
});
test('Pro is 5000/day, renewal is offered, redirects still require backend proof', () => {
  const page = source('dashboard/src/app/dashboard/page.tsx');
  assert.doesNotMatch(page, /Unlimited requests & segments/);
  assert.match(page, /result\.paymentConfirmed === true/);
  const modal = source('dashboard/src/components/subscription/SubscriptionModal.tsx');
  assert.match(modal, /Renew with GCash/); assert.doesNotMatch(modal, /new Date\(expiresAt\)/);
});
test('Admin plan/usage comes from authenticated backend, not per-key snapshots', () => {
  for (const view of ['consumers', 'security']) {
    const page = source(`admin-panel/src/app/${view}/page.tsx`);
    assert.match(page, /useAccountEntitlements/); assert.doesNotMatch(page, /k\.(plan|requestLimit|requestsUsed)/);
  }
});
test('privacy action is server finalized; schedule uses shared transactional normalizer', () => {
  const page = source('dashboard/src/app/dashboard/privacy/page.tsx');
  assert.match(page, /api\/v1\/account\/deletion/); assert.doesNotMatch(page, /updateDoc|apiKeyRequest/);
  assert.match(source('routes/account.js'), /getAuth\(\)\.deleteUser\(uid\)/);
  const scheduler = source('functions/index.js');
  assert.match(scheduler, /normalizeExpiredAccount/); assert.doesNotMatch(scheduler, /db\.batch/);
});
test('isolated runner denies SDK/network imports and global I/O', async () => {
  assert.throws(() => globalThis['fetch']('https://example.invalid'));
  await assert.rejects(import('node:https'));
  await assert.rejects(import('firebase-admin'));
});
