import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatTrialExpiry, trialCapacityMessage, trialRemainingSlots } from '../../dashboard/src/lib/trial-display.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const billing = read('dashboard/src/app/dashboard/plan-billing/page.tsx');
const trial = read('dashboard/src/app/dashboard/free-trial/page.tsx');
const plans = read('dashboard/src/config/plans.ts');
const overview = read('dashboard/src/components/reports/CustomerUsageSummary.tsx');

test('Plan & Billing keeps its concise header and uses the embedded authoritative Trial status', () => {
  assert.match(billing, /Plan &amp; Billing/);
  assert.match(billing, /Manage your subscription, usage, and billing\./);
  assert.match(billing, /trial \? <FreeTrialPage embedded \/>/);
  assert.match(trial, /fetch\(`\$\{process\.env\.NEXT_PUBLIC_API_URL\}\/api\/v1\/free-trial\/status`/);
  assert.match(trial, /Trial ends/);
  assert.match(trial, /role="progressbar" aria-label="Trial time remaining"/);
  assert.match(trial, /trial\.secondsRemaining/);
  assert.match(trial, /trial\.startedAt/);
  assert.match(trial, /trial\.expiresAt/);
  assert.match(trial, /trial\.productsIncluded\.toLocaleString\(\)} of \$\{TRIAL_MAX_PRODUCTS\}/);
  assert.match(trial, /trialRemainingSlots\(trial\.productsIncluded\)/);
  assert.doesNotMatch(trial, /Minimum required:/i);
  assert.doesNotMatch(trial, /trial\.maximumProducts|trial\.productsAvailable/);
  assert.match(trial, /trialCapacityMessage\(trial\.productsIncluded\)/);
  assert.match(trial, /trial\.activeKeys/);
  assert.match(trial, /trial\.activeKeys\} of 1/);
  assert.match(trial, /API requests do not reduce your product allowance/);
  assert.match(overview, /Remaining Slots/);
  assert.doesNotMatch(overview, /trial\.productsAvailable|Trial Expires: \{trial\.expiresAt\}/);
  assert.match(trial, /href="\/dashboard\/api-keys"[^>]*>[\s\S]*?Manage API Keys/);
  assert.doesNotMatch(trial, /50\s*\/\s*500|450 slots available/);
});

test('Upgrade cards use canonical plan config and preserve server purchase permissions', () => {
  assert.match(billing, /SUBSCRIPTION_PLANS\.pro/);
  assert.match(billing, /SUBSCRIPTION_PLANS\.pro_max/);
  assert.match(plans, /priceDisplay: "₱1,499"/);
  assert.match(plans, /priceDisplay: "₱4,999"/);
  assert.match(billing, /entitlement\.canPurchasePro/u);
  assert.match(billing, /entitlement\.canPurchaseProMax/u);
  assert.match(billing, /setPurchasePlan\(plan\)/u);
  assert.match(billing, /selectedPlan=\{purchasePlan\}/u);
  assert.match(billing, /Renew \$\{plan\.name\}/u);
  assert.match(billing, /Get \$\{plan\.name\}/u);
  assert.match(billing, /Standard security, abuse protection, and IP rate limits still apply\./u);
  for (const benefit of ['${PRO_DAILY_REQUEST_LIMIT} requests per day', 'All Business Segments', 'Product Recommendations',
    'Real Sales Analytics Feed', 'Multiple API Keys', 'Unlimited account API quota', 'API Playground']) {
    assert.ok(plans.includes(benefit), `canonical plan config must contain ${benefit}`);
  }
  assert.doesNotMatch(billing, /₱5\b|500 pesos|five-peso/i);
});

test('Current Free Trial, Upgrade Required, Pro and Pro Max states remain distinct', () => {
  assert.match(trial, /7-Day Free Trial/);
  assert.match(trial, /ACTIVE/);
  assert.match(trial, /trial\.upgradeRequired \? 'Trial ended'/);
  assert.match(trial, /UPGRADE REQUIRED/);
  assert.match(billing, /entitlement\.plan === 'Pro'/);
  assert.match(billing, /entitlement\.plan === 'Pro Max'/);
  assert.match(billing, /currentPlan=\{entitlement\.plan\}/);
  assert.match(billing, /isCurrent \? 'Your current plan'/);
});

test('Plan cards stack on narrow screens and align side by side at desktop widths', () => {
  assert.match(billing, /grid grid-cols-1 gap-4 lg:grid-cols-2/);
  assert.match(trial, /grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(billing, /min-h-11 w-full/);
  assert.match(billing, /focus-visible:ring-2/);
});

test('Trial product usage displays account-level capacity without negative slots or a second-key implication', () => {
  const cases = [[0, 50], [1, 49], [10, 40], [49, 1], [50, 0], [51, 0], [75, 0]];
  for (const [count, remaining] of cases) assert.equal(trialRemainingSlots(count), remaining, `${count} products`);
  for (const count of [0, 1, 10, 49]) assert.equal(trialCapacityMessage(count), null);
  assert.equal(trialCapacityMessage(50), 'Free Trial product limit reached — 50 of 50 products.');
  assert.equal(trialCapacityMessage(51), 'Your Free Trial product limit is 50 products.');
  assert.match(overview, /Active API Keys/);
  assert.match(trial, /ACTIVE API KEYS', value: `\$\{trial\.activeKeys\} of 1`/);
  for (const source of [overview, trial, read('dashboard/src/app/dashboard/products/page.tsx')]) {
    assert.doesNotMatch(source, /Remove products before adding more|Remove a product before adding another|Legacy over-cap catalog preserved/);
  }
});

test('Trial expiry is human-readable from the same stored instant, not a raw ISO timestamp', () => {
  const instant = '2026-10-11T11:36:17.490Z';
  const formatted = formatTrialExpiry(instant, 'en-US', 'Asia/Manila');
  assert.equal(formatted, 'October 11, 2026 at 7:36 PM');
  assert.notEqual(formatted, instant);
  assert.match(overview, /dateTime=\{trial\.expiresAt\}/);
  assert.match(overview, /formatTrialExpiry\(trial\.expiresAt\)/);
  assert.match(trial, /dateTime=\{trial\.expiresAt\}/);
  assert.doesNotMatch(overview, /Trial Expires: \{trial\.expiresAt\}/);
});

test('Overview Trial summary is compact while Plan & Billing retains detailed entitlement copy', () => {
  assert.match(overview, /trialCapacityMessage\(trial\.productsIncluded\)/);
  assert.equal(trialCapacityMessage(50), 'Free Trial product limit reached — 50 of 50 products.');
  assert.match(overview, /Trial expires <time dateTime=\{trial\.expiresAt\}>\{formatTrialExpiry\(trial\.expiresAt\)\}<\/time>/);
  for (const redundant of ['One-time 7-day Free Trial', 'Your Free Trial includes up to', 'API requests do not reduce your product allowance', 'Unused product slots do not increase the API-key limit']) {
    assert.doesNotMatch(overview, new RegExp(redundant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(overview, /Free Trial · Active/);
  assert.match(trial, /one-time 7-day Free Trial includes up to/);
  assert.match(trial, /API requests do not reduce your product allowance/);
  assert.match(trial, /unused product slots do not increase the API-key limit/);
  assert.equal(trialCapacityMessage(10), null);
  assert.equal(trialRemainingSlots(10), 40);
});

test('paid-plan display remains canonical and excludes temporary five-peso billing', () => {
  assert.match(plans, /priceDisplay: "₱1,499"/);
  assert.match(plans, /priceDisplay: "₱4,999"/);
  assert.match(plans, /\$\{PRO_DAILY_REQUEST_LIMIT\} requests per day/);
  assert.match(plans, /Unlimited account API quota/);
  assert.doesNotMatch(`${billing}\n${plans}`, /₱5\b|500 pesos|five-peso/i);
});
