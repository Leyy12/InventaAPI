import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { hooks, clock, flush, load, nodes } from './workspace-refresh/harness.mjs';
import * as limits from '../../functions/entitlement-limits.mjs';
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
  assert.match(trial, /label: 'PRODUCTS', value: trial\.productsIncluded\.toLocaleString\(\)/);
  assert.match(trial, /trialRemainingSlots\(trial\.productsIncluded\)/);
  assert.doesNotMatch(trial, /Minimum required:/i);
  assert.doesNotMatch(trial, /trial\.maximumProducts|trial\.productsAvailable/);
  assert.match(trial, /trialCapacityMessage\(trial\.productsIncluded\)/);
  assert.match(trial, /trial\.activeKeys/);
  assert.match(trial, /label: 'ACTIVE API KEYS', value: trial\.activeKeys\.toLocaleString\(\)/);
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
  for (const benefit of ['${PRO_DAILY_REQUEST_LIMIT} requests per day', 'All Business Segments',
    'Real Sales Analytics Feed', 'Multiple API Keys', 'Unlimited account API quota', 'API Playground']) {
    assert.ok(plans.includes(benefit), `canonical plan config must contain ${benefit}`);
  }
  assert.doesNotMatch(plans, /Product Recommendations/);
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
  assert.match(trial, /ACTIVE API KEYS', value: trial\.activeKeys\.toLocaleString\(\)/);
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

// Execute the actual TSX render branches with synthetic status data and no SDK
// or external I/O. Effects use the existing isolated hook runner; child plan
// cards are expanded so assertions inspect visible links/content, not strings
// merely present in the source (which also contains the standalone route).
const icons = { Zap: 'svg', ShieldCheck: 'svg', Building2: 'svg', ArrowRight: 'svg', Check: 'svg', CreditCard: 'svg' };
const fixture = {
  eligible: false, active: true, exhausted: false, expired: false,
  hasUsedFreeTrial: true, upgradeRequired: false, endReason: null,
  status: 'active', startedAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-10-08T00:00:00.000Z',
  serverTime: '2026-10-04T00:00:00.000Z', secondsRemaining: 345600,
  productsIncluded: 10, activeKeys: 1,
};
const planConfig = load('dashboard/src/config/plans.ts', 'exports.SUBSCRIPTION_PLANS', hooks(), {
  '../../../functions/entitlement-limits.mjs': limits, 'lucide-react': icons,
});
function expand(tree) {
  if (Array.isArray(tree)) return tree.map(expand);
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return { ...tree, props: { ...tree.props, children: expand(tree.props?.children) } };
}
function visibleText(tree) {
  if (Array.isArray(tree)) return tree.map(visibleText).join(' ');
  if (tree === null || tree === undefined || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return visibleText(tree.props?.children);
}
function keyActions(tree) {
  return nodes(tree, node => node.type === 'a' && /Manage API Keys/.test(visibleText(node)));
}
async function renderTrial({ embedded = true, state = fixture, fail = false, pending = false } = {}) {
  const h = hooks(), c = clock();
  const Component = load('dashboard/src/app/dashboard/free-trial/page.tsx', 'TrialPanel', h, {
    'next/link': 'a', 'lucide-react': icons, '@/lib/firebase/auth-context': {},
    '@/lib/account-usage-events': { subscribeAccountUsage: () => () => {} },
    '@/lib/trial-display.mjs': { formatTrialExpiry, trialCapacityMessage, trialRemainingSlots },
    '../../../../../functions/entitlement-limits.mjs': limits,
  }, {
    performance: { now: c.now }, setTimeout: c.schedule, clearTimeout: c.cancel,
    setInterval: () => 1, clearInterval: () => {},
    fetch: async url => {
      assert.equal(url, 'https://synthetic.invalid/api/v1/free-trial/status');
      if (pending) return new Promise(() => {});
      if (fail) throw new Error('Synthetic unavailable status');
      return { ok: true, json: async () => state };
    },
  });
  h.mount(Component, { user: { uid: 'synthetic-billing', getIdToken: async () => 'synthetic-not-a-credential' }, embedded });
  await flush();
  const tree = expand(h.output);
  h.stop();
  return tree;
}
function renderBilling(trialTree, overrides = {}) {
  const h = hooks();
  const Component = load('dashboard/src/app/dashboard/plan-billing/page.tsx', 'PlanBillingPage', h, {
    'next/link': 'a', 'lucide-react': icons,
    '@/lib/firebase/auth-context': { useAuth: () => ({ loading: false, entitlement: {
      activePro: false, activeTrial: true, plan: 'Free', subscription_status: 'trial',
      canPurchasePro: true, canPurchaseProMax: true, ...overrides,
    } }) },
    '@/config/plans': { SUBSCRIPTION_PLANS: planConfig },
    '@/components/subscription/SubscriptionModal': () => null,
    '../free-trial/page': ({ embedded }) => { assert.equal(embedded, true); return trialTree; },
  });
  const tree = expand(h.mount(Component));
  h.stop();
  return tree;
}
const embeddedCases = [
  ['active', {}],
  ['expired', { state: { ...fixture, active: false, expired: true, upgradeRequired: true, endReason: 'expired' } }],
  ['exhausted', { state: { ...fixture, active: false, exhausted: true, upgradeRequired: true, endReason: 'exhausted' } }],
  ['pending', { state: { ...fixture, active: false, eligible: true, upgradeRequired: false } }],
  ['unavailable', { state: { ...fixture, active: false, eligible: false, upgradeRequired: false } }],
  ['loading', { pending: true }],
  ['verification error', { fail: true }],
];
for (const [label, options] of embeddedCases) {
  test(`rendered embedded ${label} Trial has no key CTA; Plan & Billing keeps exactly one accessible dedicated action`, async () => {
    const trialTree = await renderTrial(options);
    assert.equal(keyActions(trialTree).length, 0);
    assert.doesNotMatch(visibleText(trialTree), /Manage API Keys/);
    const tree = renderBilling(trialTree);
    const actions = keyActions(tree);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].props.href, '/dashboard/api-keys');
    assert.match(actions[0].props.className, /focus-visible:ring-2/);
    const section = nodes(tree, node => node.type === 'section' && node.props['aria-label'] === 'Manage API keys');
    assert.equal(section.length, 1);
    assert.match(visibleText(section[0]), /API key management.*View and manage your existing keys/);
    const children = tree.props.children.filter(Boolean);
    assert.ok(children.indexOf(section[0]) > 0);
    assert.ok(children.indexOf(section[0]) < children.findIndex(node => node.props?.id === 'upgrade'));
  });
}
for (const [label, state] of [['active', fixture], ['ended', { ...fixture, active: false, upgradeRequired: true }],
  ['paid', { ...fixture, active: false, status: 'paid' }]]) {
  test(`rendered standalone ${label} Trial retains its API-key navigation`, async () => {
    const tree = await renderTrial({ embedded: false, state });
    assert.equal(keyActions(tree).length, 1);
    assert.equal(keyActions(tree)[0].props.href, '/dashboard/api-keys');
  });
}
for (const status of ['upgrade_required', 'unavailable']) {
  test(`rendered non-active ${status} billing retains exactly one dedicated key action`, () => {
    const tree = renderBilling(null, { activeTrial: false, subscription_status: status });
    assert.equal(keyActions(tree).length, 1);
    assert.equal(keyActions(tree)[0].props.href, '/dashboard/api-keys');
    assert.equal(nodes(tree, node => node.props['aria-label'] === 'Manage API keys').length, 1);
    assert.equal(nodes(tree, node => node.type === 'article').length, 2);
    assert.match(visibleText(tree), status === 'upgrade_required' ? /UPGRADE REQUIRED/ : /Unavailable/);
  });
}
for (const plan of ['Pro', 'Pro Max']) {
  test(`rendered ${plan} billing retains one key action and canonical paid cards/permissions`, () => {
    const tree = renderBilling(null, { activePro: true, activeTrial: false, plan,
      subscription_status: 'active', canPurchasePro: false, canPurchaseProMax: true });
    assert.equal(keyActions(tree).length, 1);
    const cards = nodes(tree, node => node.type === 'article');
    assert.equal(cards.length, 2);
    assert.match(visibleText(cards[0]), /₱1,499/);
    assert.match(visibleText(cards[1]), /₱4,999/);
    assert.equal(nodes(cards[0], node => node.type === 'button').length, 0);
    assert.equal(nodes(cards[1], node => node.type === 'button').length, 1);
    assert.match(visibleText(tree), /Current plan/);
  });
}
test('rendered active embedded Trial preserves metrics, expiry, progress and explanatory copy without a CTA container', async () => {
  const tree = await renderTrial();
  const text = visibleText(tree);
  for (const copy of ['7-Day Free Trial', 'ACTIVE', 'PRODUCTS', '10', 'REMAINING SLOTS', '40',
    'ACTIVE API KEYS', '1', 'TIME REMAINING', '4d', 'API requests do not reduce your product allowance']) {
    assert.ok(text.includes(copy), copy);
  }
  const progress = nodes(tree, node => node.props.role === 'progressbar');
  assert.equal(progress.length, 1);
  assert.equal(progress[0].props['aria-label'], 'Trial time remaining');
  assert.equal(progress[0].props['aria-valuenow'], 57);
  assert.equal(nodes(tree, node => node.type === 'time')[0].props.dateTime, fixture.expiresAt);
  assert.equal(nodes(tree, node => node.props.className?.includes('mt-5 inline-flex')).length, 0);
});
for (const productsIncluded of [0, 10, 50]) {
  for (const activeKeys of [0, 1]) {
    test(`embedded Trial renders count-only metrics for ${productsIncluded} products and ${activeKeys} keys while standalone retains limits`, async () => {
      const state = { ...fixture, productsIncluded, activeKeys, secondsRemaining: 435600 };
      const tree = await renderTrial({ state });
      const cards = nodes(tree, node => node.type === 'div' && node.props.className?.includes('bg-slate-950/35'));
      assert.equal(cards.length, 4);
      const metric = label => {
        const card = cards.find(node => visibleText(node.props.children[0]) === label);
        assert.ok(card, label);
        return card;
      };
      for (const [label, expected] of [['PRODUCTS', productsIncluded], ['ACTIVE API KEYS', activeKeys],
        ['REMAINING SLOTS', 50 - productsIncluded], ['TIME REMAINING', '5d 1h']]) {
        const card = metric(label);
        assert.equal(visibleText(card.props.children[1]), String(expected));
        assert.doesNotMatch(visibleText(card), / of /);
      }
      const expiry = nodes(tree, node => node.type === 'time')[0];
      assert.equal(expiry.props.dateTime, fixture.expiresAt);
      assert.equal(visibleText(expiry), formatTrialExpiry(fixture.expiresAt));
      const progress = nodes(tree, node => node.props.role === 'progressbar')[0];
      assert.equal(progress.props['aria-valuenow'], 72);
      assert.equal(progress.props['aria-valuetext'], '5d 1h remaining');
      assert.equal(progress.props.children.props.style.width, '72%');
      const warnings = nodes(tree, node => node.props.role === 'status');
      assert.deepEqual(warnings.map(visibleText), productsIncluded === 50
        ? ['Free Trial product limit reached — 50 of 50 products.'] : []);
      assert.match(visibleText(tree).replace(/\s+/g, ' '), /includes up to 50 account-level products and 1 active API key/);
      const standalone = await renderTrial({ embedded: false, state });
      const standaloneText = visibleText(standalone).replace(/\s+/g, ' ');
      assert.match(standaloneText, new RegExp(`Products: ${productsIncluded} of 50`));
      assert.match(standaloneText, new RegExp(`Active API keys: ${activeKeys} of 1`));
      assert.match(standaloneText, /121 hours remaining\./);
      assert.equal(nodes(standalone, node => node.type === 'time')[0].props.dateTime, fixture.expiresAt);
    });
  }
}

test('rendered embedded full-capacity Trial keeps its warning and zero remaining slots', async () => {
  const tree = await renderTrial({ state: { ...fixture, productsIncluded: 50 } });
  assert.match(visibleText(tree), /Free Trial product limit reached — 50 of 50 products/);
  assert.match(visibleText(tree), /REMAINING SLOTS 0/);
  assert.equal(keyActions(tree).length, 0);
});

test('rendered billing uses the same uncapped horizontal workspace as Products and API Keys', () => {
  for (const overrides of [{}, { activeTrial: false, subscription_status: 'upgrade_required' },
    { activeTrial: false, activePro: true, plan: 'Pro' },
    { activeTrial: false, activePro: true, plan: 'Pro Max' }]) {
    const tree = renderBilling(null, overrides);
    const classes = new Set(tree.props.className.split(/\s+/));
    for (const expected of ['w-full', 'px-6', 'lg:px-8', 'space-y-7', 'pb-10']) {
      assert.ok(classes.has(expected), `outer wrapper must keep ${expected}`);
    }
    assert.ok(!classes.has('mx-auto'));
    assert.ok(![...classes].some(value => /(?:^|:)max-w-/.test(value)));
    const grids = nodes(tree, node => node.props.className?.split(/\s+/).includes('lg:grid-cols-2'));
    assert.equal(grids.length, 1);
    assert.ok(grids[0].props.className.split(/\s+/).includes('grid-cols-1'));
    assert.equal(keyActions(tree).length, 1);
    const cards = nodes(tree, node => node.type === 'article');
    assert.equal(cards.length, 2);
    assert.match(visibleText(cards[0]), /₱1,499/);
    assert.match(visibleText(cards[1]), /₱4,999/);
  }
  for (const route of ['products', 'api-keys']) {
    const page = read(`dashboard/src/app/dashboard/${route}/page.tsx`);
    assert.match(page, /className="w-full px-6 lg:px-8\s/);
  }
});

test('billing preserves reviewed copy, handlers and spacing except the explicitly removed capability filters', () => {
  // Fingerprint of d0cd41c's page with only its outer layout classes omitted.
  // Line endings and outer class ordering do not affect this scope assertion.
  // Reverse only the two approved filter deletions to retain the original scope fingerprint.
  assert.doesNotMatch(billing, /Product Recommendations/);
  assert.equal((billing.match(/All Business Segments\|Real Sales Analytics Feed/g) || []).length, 2);
  const source = billing.replaceAll('\r\n', '\n')
    .replaceAll('All Business Segments|Real Sales Analytics Feed', 'All Business Segments|Product Recommendations|Real Sales Analytics Feed');
  const outer = /return <div className="[^"]+">\n    <header>/;
  assert.match(source, outer);
  const unchanged = source.replace(outer, 'return <div className="__OUTER_LAYOUT__">\n    <header>');
  assert.equal(createHash('sha256').update(unchanged).digest('hex'),
    'f17562b284ac5ecb5abbc2f269f9a6f1d4f663bc1e27dfe926fa56bf62e06c86');
});
