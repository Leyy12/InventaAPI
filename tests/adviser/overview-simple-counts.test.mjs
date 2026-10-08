import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, nodes, flush } from './workspace-refresh/harness.mjs';
import { formatTrialExpiry, trialCapacityMessage, trialRemainingSlots } from '../../dashboard/src/lib/trial-display.mjs';
import { TRIAL_MAX_PRODUCTS, trialCatalogChangeAllowed } from '../../functions/entitlement-limits.mjs';

const warning = 'Free Trial product limit reached — 50 of 50 products.';
for (const productsIncluded of [0, 10, 50]) {
  for (const activeKeys of [0, 1]) {
    test(`Overview renders authoritative ${productsIncluded} products and ${activeKeys} keys without card denominators`, async () => {
      const h = hooks();
      const Usage = load('dashboard/src/components/reports/CustomerUsageSummary.tsx', 'Usage', h, {
        'next/link': 'a', '@/lib/firebase/auth-context': {},
        '@/lib/api-keys': { apiKeyRequest() { throw Error('External I/O prohibited'); } },
        '@/lib/reports': { quotaSummary: () => null },
        '@/lib/trial-display.mjs': { formatTrialExpiry, trialCapacityMessage, trialRemainingSlots },
        '@/lib/account-usage-events': { subscribeAccountUsage: () => () => {} },
        '@/lib/quota-refresh': { createQuotaRefresh: ({ onState }) => ({
          start: () => onState({ status: 'ready', count: activeKeys, usage: null,
            trialCatalog: { productsIncluded, activeKeys, expiresAt: null } }),
          refresh() {}, stop() {},
        }) },
      }, { setInterval: () => 1, clearInterval() {} });
      h.mount(Usage, { user: { uid: 'synthetic-overview' }, activeTrial: true, upgradeRequired: false });
      await flush();
      try {
        const cardValue = label => {
          const cards = nodes(h.output, node => node.type === 'div'
            && node.props.children?.[0]?.props?.children === label);
          assert.equal(cards.length, 1, label);
          return cards[0].props.children[1].props.children;
        };
        assert.equal(cardValue('Products'), productsIncluded.toLocaleString());
        assert.equal(cardValue('Active API Keys'), activeKeys.toLocaleString());
        assert.doesNotMatch(cardValue('Products'), /10 of 50|50 of 50|\bof\b/);
        assert.doesNotMatch(cardValue('Active API Keys'), /1 of 1|\bof\b/);
        assert.equal(cardValue('Remaining Slots'), String(50 - productsIncluded));
        const messages = nodes(h.output, node => node.props.role === 'status');
        assert.equal(messages.length, productsIncluded === 50 ? 1 : 0);
        if (productsIncluded === 50) assert.equal(messages[0].props.children, warning);
      } finally { h.stop(); }
    });
  }
}

test('shared Trial capacity remains 50 with unchanged slots, warning and product enforcement', () => {
  assert.equal(TRIAL_MAX_PRODUCTS, 50);
  assert.equal(trialRemainingSlots(10), 40);
  assert.equal(trialRemainingSlots(50), 0);
  assert.equal(trialCapacityMessage(10), null);
  assert.equal(trialCapacityMessage(50), warning);
  assert.equal(trialCatalogChangeAllowed([], Array.from({ length: 50 }, (_, i) => String(i))), true);
  assert.equal(trialCatalogChangeAllowed([], Array.from({ length: 51 }, (_, i) => String(i))), false);
});
