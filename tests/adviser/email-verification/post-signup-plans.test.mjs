import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, nodes, flush } from '../workspace-refresh/harness.mjs';

// Real plan cards and post-signup chooser over the real plan catalog; navigation and
// checkout are synthetic. The loader forbids external I/O.
const icons = new Proxy({}, { get: (_, name) => String(name) });
const text = value => Array.isArray(value) ? value.map(text).join(' ') :
  value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
const config = name => load('dashboard/src/config/plans.ts', `exports.${name}`, hooks(), {
  '../../../functions/entitlement-limits.mjs': { PRO_DAILY_REQUEST_LIMIT: 500, TRIAL_MAX_PRODUCTS: 50, TRIAL_MAX_ACTIVE_KEYS: 5 }, 'lucide-react': icons,
});
const plans = config('plansForRequestLimits')({ free_trial: null, pro: 500, pro_max: null });
const classes = node => String(node.props?.className ?? '').split(/\s+/u);

function cards(props = {}) {
  const h = hooks(), selected = [];
  const component = load('dashboard/src/components/subscription/PlanCards.tsx', 'exports.default', h, {});
  h.mount(component, { plans, onSelect: plan => selected.push(plan), ...props });
  return { h, selected, buttons: () => nodes(h.output, node => node.type === 'button') };
}

test('each plan card is a flex column whose feature list grows, so every button sits on one baseline', () => {
  const fixture = cards();
  const grid = nodes(fixture.h.output, node => classes(node).includes('md:grid-cols-3'));
  assert.equal(grid.length, 1);
  const columns = (Array.isArray(grid[0].props.children) ? grid[0].props.children : [grid[0].props.children]).filter(Boolean);
  assert.equal(columns.length, 3);
  for (const card of columns) {
    assert.ok(classes(card).includes('flex') && classes(card).includes('flex-col'), card.props.className);
    const children = card.props.children.filter(Boolean);
    assert.equal(children.at(-1).type, 'button', 'the button is the last item of the card');
    assert.equal(children.filter(child => classes(child).includes('flex-1')).length, 1, 'one growing feature list');
  }
  // The shared rate-limit note sits under the grid, not inside the Pro Max card.
  const note = nodes(fixture.h.output, node => node.type === 'p' && text(node).includes('Standard security, abuse-prevention'));
  assert.equal(note.length, 1);
  assert.equal(nodes(grid[0], node => node === note[0]).length, 0);
  fixture.h.stop();
});
test('the three buttons choose free, pro and pro_max with the catalog CTA text', () => {
  const fixture = cards();
  assert.deepEqual(fixture.buttons().map(button => text(button).replace(/\s+/gu, ' ').trim()),
    ['Get Started Free →', 'Subscribe Now →', 'Get Pro Max →']);
  for (const button of fixture.buttons()) { assert.equal(button.props.type, 'button'); assert.equal(button.props.disabled, false); button.props.onClick(); }
  assert.deepEqual(fixture.selected, ['free', 'pro', 'pro_max']);
  fixture.h.stop();
});
test('cards render the catalog\'s prices, features and exclusions', () => {
  const fixture = cards(), copy = text(fixture.h.output);
  for (const value of ['FREE TRIAL', 'PRO', 'PRO MAX', '1,499', plans.pro_max.priceDisplay, 'Everything in Free, and:', 'Everything in Pro, and:',
    ...plans.free.features, ...plans.free.exclusions, ...plans.pro.incrementalFeatures, ...plans.pro_max.incrementalFeatures]) {
    assert.ok(copy.includes(value), value);
  }
  fixture.h.stop();
});
test('callers can disable plans and rename calls to action', () => {
  const fixture = cards({ isDisabled: plan => plan !== 'free', ctaText: plan => plan === 'free' ? 'Continue with Free Trial' : plans[plan].ctaText });
  assert.deepEqual(fixture.buttons().map(button => button.props.disabled), [false, true, true]);
  assert.match(text(fixture.buttons()[0]), /Continue with Free Trial/);
  fixture.h.stop();
});

function chooser({ initialPlan = null, status = 'ready' } = {}) {
  const h = hooks(), routes = [];
  const component = load('dashboard/src/components/subscription/PostSignupPlans.tsx', 'exports.default', h, {
    'next/navigation': { useRouter: () => ({ push: route => routes.push(route) }) },
    'lucide-react': icons, '@/components/subscription/PlanCards': 'PlanCards',
    '@/components/subscription/SubscriptionModal': 'SubscriptionModal',
    '@/lib/plan-request-policy': { usePlanCatalog: () => ({ plans, status }) },
  });
  h.mount(component, { initialPlan });
  const find = type => { const matches = nodes(h.output, node => node.type === type); assert.equal(matches.length, 1); return matches[0]; };
  return { h, routes, cards: () => find('PlanCards'), checkout: () => find('SubscriptionModal') };
}

test('after signup every plan is offered; Free Trial continues to the dashboard', async () => {
  const fixture = chooser();
  assert.match(text(fixture.h.output), /Account created/); assert.match(text(fixture.h.output), /Choose your plan/);
  const props = fixture.cards().props;
  assert.equal(props.plans, plans);
  assert.equal(props.ctaText('free'), 'Continue with Free Trial');
  assert.equal(props.ctaText('pro'), 'Subscribe Now'); assert.equal(props.ctaText('pro_max'), 'Get Pro Max');
  assert.equal(fixture.checkout().props.isOpen, false);
  props.onSelect('free'); await flush();
  assert.deepEqual(fixture.routes, ['/dashboard']); assert.equal(fixture.checkout().props.isOpen, false);
  fixture.h.stop();
});
for (const plan of ['pro', 'pro_max']) test(`choosing ${plan} opens its checkout; closing it returns to the plans`, async () => {
  const fixture = chooser();
  fixture.cards().props.onSelect(plan); await flush();
  assert.equal(fixture.checkout().props.isOpen, true); assert.equal(fixture.checkout().props.selectedPlan, plan);
  fixture.checkout().props.onClose(); await flush();
  assert.equal(fixture.checkout().props.isOpen, false); assert.deepEqual(fixture.routes, []);
  fixture.h.stop();
});
test('paid plans wait for the verified allowance; the Free Trial never does', () => {
  for (const status of ['loading', 'unavailable']) {
    const fixture = chooser({ status });
    const { isDisabled } = fixture.cards().props;
    assert.deepEqual(['free', 'pro', 'pro_max'].map(isDisabled), [false, true, true], status);
    fixture.h.stop();
  }
  const ready = chooser();
  assert.deepEqual(['free', 'pro', 'pro_max'].map(ready.cards().props.isDisabled), [false, false, false]);
  ready.h.stop();
});
for (const [initialPlan, open] of [['pro', 'pro'], ['pro_max', 'pro_max'], ['free', null], [null, null]]) {
  test(`a plan picked before signup (${initialPlan}) opens checkout only when it is paid`, () => {
    const fixture = chooser({ initialPlan });
    assert.equal(fixture.checkout().props.isOpen, open !== null);
    if (open) assert.equal(fixture.checkout().props.selectedPlan, open);
    fixture.h.stop();
  });
}
