import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const billing = read('dashboard/src/app/dashboard/plan-billing/page.tsx');
const trial = read('dashboard/src/app/dashboard/free-trial/page.tsx');
const plans = read('dashboard/src/config/plans.ts');

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
  assert.match(trial, /trial\.productsIncluded\.toLocaleString\(\)/);
  assert.match(trial, /trial\.productsAvailable\.toLocaleString\(\)/);
  assert.doesNotMatch(trial, /Minimum required:/i);
  assert.match(trial, /trial\.maximumProducts/);
  assert.match(trial, /capacity reached/);
  assert.match(trial, /trial\.activeKeys/);
  assert.match(trial, /trial\.maximumActiveKeys/);
  assert.match(trial, /API calls do not consume your product allowance\./);
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
  assert.match(trial, /grid grid-cols-1 gap-3 sm:grid-cols-3/);
  assert.match(billing, /min-h-11 w-full/);
  assert.match(billing, /focus-visible:ring-2/);
});
