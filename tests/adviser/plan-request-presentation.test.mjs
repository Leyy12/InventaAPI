import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, flush, nodes } from './workspace-refresh/harness.mjs';
import * as limits from '../../functions/entitlement-limits.mjs';
import * as policy from '../../functions/request-limit-policy.mjs';
import * as reporting from '../../services/reporting.js';
import { createQuotaRefresh } from '../../dashboard/src/lib/quota-refresh.ts';

const icons = new Proxy({}, { get: () => 'svg' });
const config = load('dashboard/src/config/plans.ts', 'exports', hooks(), {
  '../../../functions/entitlement-limits.mjs': limits, 'lucide-react': icons,
});
const text = tree => Array.isArray(tree) ? tree.map(text).join(' ') : tree === null || tree === undefined || typeof tree === 'boolean'
  ? '' : typeof tree === 'object' ? text(tree.props?.children) : String(tree);

test('all three runtime catalogs advertise verified allowances and retain prices, Trial capacity and duration', () => {
  const plans = config.plansForRequestLimits({ free_trial: 100, pro: 1000, pro_max: 2000 });
  assert.equal(plans.pro.price, 500); assert.equal(plans.pro_max.price, 1300);
  assert.equal(plans.free.billingCycle, '7 days'); assert.ok(plans.free.features.includes('Up to 50 products'));
  for (const [id, amount] of [['free', '100'], ['pro', '1,000'], ['pro_max', '2,000']]) {
    assert.equal(plans[id].requestLimitDisplay, `${amount} requests/day (UTC)`);
    assert.match(config.getCumulativeFeatures(id, plans).features.join('|'), new RegExp(amount));
  }
  const unavailable = config.plansForRequestLimits(null);
  for (const id of ['free', 'pro', 'pro_max']) {
    const features = config.getCumulativeFeatures(id, unavailable).features.join('|');
    assert.match(features, /Request allowance unavailable/); assert.doesNotMatch(features, /Unlimited|500 requests/);
  }
  assert.match(config.plansForRequestLimits(policy.DEFAULT_REQUEST_LIMITS).free.requestLimitDisplay, /Unlimited.*7-day/);
});

test('verified policy changes refresh the same account once, matching personalized contracts; failures expose no stale allowance', async () => {
  const h = hooks(); let context, interval, calls = 0, refreshes = 0;
  h.React.createContext = value => (context = { value, Provider: 'provider' });
  h.React.useContext = ctx => ctx.value;
  const auth = { user: { uid: 'synthetic' }, entitlement: { requestPolicyVersion: policy.requestPolicyVersion(policy.DEFAULT_REQUEST_LIMITS),
    apiRequestLimit: 500, purchaseRequestLimits: { pro: 500, pro_max: null } }, refreshUserDoc: async () => { refreshes++; } };
  let response = { success: true, planRequestLimits: policy.DEFAULT_REQUEST_LIMITS, requestPolicyVersion: auth.entitlement.requestPolicyVersion };
  const module = load('dashboard/src/lib/plan-request-policy.tsx', 'exports', h, {
    '@/config/plans': config, '@/lib/firebase/auth-context': { useAuth: () => auth }, '../../../functions/request-limit-policy.mjs': policy,
  }, { setInterval: fn => { interval = fn; return 1; }, clearInterval: () => {}, fetch: async url => {
    assert.equal(url, '/api/v1/system/status'); calls++; return { ok: true, json: async () => response };
  } });
  h.mount(module.PlanRequestPolicyProvider); await flush(); context.value = h.output.props.value;
  assert.equal(module.useAccountRequestAllowance(), 500); assert.equal(refreshes, 0);
  for (let i = 0; i < 10; i++) { interval(); await flush(); }
  assert.equal(refreshes, 0); assert.equal(calls, 11);
  const changed = { free_trial: 100, pro: 1000, pro_max: 2000 }, version = policy.requestPolicyVersion(changed);
  response = { success: true, planRequestLimits: changed, requestPolicyVersion: version };
  interval(); await flush(); context.value = h.output.props.value;
  assert.equal(refreshes, 1); assert.equal(module.useAccountRequestAllowance(), undefined);
  assert.equal(module.usePlanCatalog(true).status, 'unavailable');
  interval(); await flush(); assert.equal(refreshes, 1);
  auth.entitlement = { requestPolicyVersion: version, apiRequestLimit: 1000, purchaseRequestLimits: { pro: 1000, pro_max: null } };
  h.render(); await flush(); context.value = h.output.props.value;
  assert.equal(module.useAccountRequestAllowance(), 1000);
  assert.match(module.usePlanCatalog().plans.pro_max.requestLimitDisplay, /2,000/);
  assert.match(module.usePlanCatalog(true).plans.pro_max.requestLimitDisplay, /Unlimited/);
  response = { success: true, planRequestLimits: changed, requestPolicyVersion: 'wrong-version' };
  interval(); await flush(); context.value = h.output.props.value;
  assert.equal(module.useAccountRequestAllowance(), undefined); assert.equal(module.usePlanCatalog(true).status, 'unavailable');
  assert.doesNotMatch(text(module.usePlanCatalog().plans.pro.requestLimitDisplay), /1,000/);
  h.stop();
});

test('real billing current allowance and cards share verified values; unavailable policy disables purchase', () => {
  const h = hooks(); let ready = true;
  const Component = load('dashboard/src/app/dashboard/plan-billing/page.tsx', 'PlanBillingPage', h, {
    'next/link': 'a', 'lucide-react': icons, '@/config/plans': config,
    '@/lib/firebase/auth-context': { useAuth: () => ({ loading: false, entitlement: { activePro: true, plan: 'Pro', subscription_status: 'active', canPurchasePro: true, canPurchaseProMax: true } }) },
    '@/lib/plan-request-policy': { useAccountRequestAllowance: () => ready ? 1000 : undefined,
      usePlanCatalog: () => ({ plans: config.plansForRequestLimits(ready ? { free_trial: null, pro: 1000, pro_max: null } : null), status: ready ? 'ready' : 'unavailable' }) },
    '@/components/subscription/SubscriptionModal': () => null, '@/components/subscription/FreeTrialContent': () => null,
  });
  const expand = value => Array.isArray(value) ? value.map(expand) : value && typeof value === 'object'
    ? typeof value.type === 'function' ? expand(value.type(value.props)) : { ...value, props: { ...value.props, children: expand(value.props.children) } } : value;
  let tree = expand(h.mount(Component));
  assert.equal((text(tree).match(/1,000 requests\/day \(UTC\)/g) || []).length, 2);
  ready = false; tree = expand(h.render()); assert.doesNotMatch(text(tree), /1,000 requests|500 requests/);
  assert.equal(nodes(tree, node => node.type === 'button' && node.props.disabled).length, 2); h.stop();
});

test('real upgrade modal advertises personalized allowance and freezes verified version before provider redirect', async () => {
  for (const ready of [true, false]) {
    const h = hooks(), requests = [], version = policy.requestPolicyVersion({ free_trial: null, pro: 1000, pro_max: null });
    const location = { href: '' };
    const Component = load('dashboard/src/components/subscription/SubscriptionModal.tsx', 'SubscriptionModal', h, {
      'next/navigation': { useRouter: () => ({ push() {} }) }, 'lucide-react': icons, '@/config/plans': config,
      '@/lib/firebase/auth-context': { useAuth: () => ({ user: { uid: 'synthetic', getIdToken: async () => 'synthetic-only' }, entitlement: { canPurchasePro: true } }) },
      '@/lib/plan-request-policy': { usePlanCatalog: () => ({ plans: config.plansForRequestLimits(ready ? { free_trial: null, pro: 1000, pro_max: null } : null), status: ready ? 'ready' : 'unavailable', requestPolicyVersion: ready ? version : null }) },
    }, { window: { location }, fetch: async (url, options) => {
      assert.equal(url, 'https://synthetic.invalid/api/v1/checkout/create-gcash'); requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ checkoutUrl: 'https://synthetic.invalid/payment' }) };
    } });
    h.mount(Component, { isOpen: true, selectedPlan: 'pro', onClose() {} }); await flush();
    assert.match(text(h.output), ready ? /1,000 requests/ : /Request allowance unavailable/);
    const button = nodes(h.output, node => node.type === 'button' && /Continue|Subscribe|Proceed|Pay/.test(text(node))).at(-1);
    assert.ok(button); await button.props.onClick(); await flush();
    assert.deepEqual(requests, ready ? [{ plan: 'pro', requestPolicyVersion: version }] : []);
    assert.equal(location.href, ready ? 'https://synthetic.invalid/payment' : ''); h.stop();
  }
});

test('real Overview usage renders the authoritative 1,000 allowance and preserved usage, hiding unverified or stale summaries', async () => {
  const h = hooks(), now = new Date(), reset = new Date(now); reset.setUTCHours(24, 0, 0, 0);
  const Component = load('dashboard/src/components/reports/CustomerUsageSummary.tsx', 'Usage', h, {
    '@/lib/trial-display.mjs': {}, 'next/link': 'a', '@/lib/firebase/auth-context': {},
    '@/config/plans': config, '@/lib/plan-request-policy': {}, '@/lib/reports': reporting,
    '@/lib/quota-refresh': { createQuotaRefresh }, '@/lib/account-usage-events': { subscribeAccountUsage: () => () => {} },
    '@/lib/api-keys': { apiKeyRequest: async () => ({ keys: [{}, {}], usage: { scope: 'account', period: 'daily',
      window: now.toISOString().slice(0, 10), used: 237, limit: 1000, resetsAt: reset.toISOString() } }) },
  }, { setInterval: () => 1, clearInterval() {} });
  const user = { uid: 'synthetic' }; h.mount(Component, { user, requestAllowance: 1000 }); await flush();
  assert.match(text(h.output), /Requests used today \(UTC\) 237/);
  assert.match(text(h.output), /Daily account limit 1,000/); assert.match(text(h.output), /Remaining today 763/);
  h.render({ user, requestAllowance: undefined }); assert.doesNotMatch(text(h.output), /1,000|763/);
  h.render({ user, requestAllowance: 2000 }); assert.doesNotMatch(text(h.output), /1,000|763/);
  h.stop();
});

test('real API Keys page receives updated allowance without remounting the key session', async () => {
  const h = hooks(); let allowance = 1000;
  const Component = load('dashboard/src/app/dashboard/api-keys/page.tsx', 'ApiKeysPage', h, {
    'next/link': 'a', 'lucide-react': icons, '@/config/plans': config,
    '@/lib/plan-request-policy': { useAccountRequestAllowance: () => allowance },
    '@/lib/firebase/auth-context': { useAuth: () => ({ user: { uid: 'synthetic' }, entitlement: { subscription_status: 'active' } }) },
    '@/lib/api-keys': {}, '@/components/shared/AppDialog': { default: () => null, appConfirm: async () => true, appAlert: async () => {} }, '@/lib/api-key-generation': {}, '@/components/reports/CustomerUsageSummary': () => null,
    '@/components/api/RequestHistory': () => null, '@/components/shared/CodeSnippet': () => null,
  });
  const before = h.mount(Component); assert.equal(before.props.requestAllowance, 1000);
  allowance = 2000; const after = h.render(); assert.equal(after.props.requestAllowance, 2000);
  assert.equal(after.key, before.key); assert.equal(after.type, before.type); h.stop();
});
