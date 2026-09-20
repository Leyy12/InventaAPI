import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalPeriod } from '../../../functions/subscription-lifecycle.mjs';
import { PRO_PURCHASE } from '../../../services/payment-contract.js';

// Exact pre-Phase-2B2 calculation from payment-webhook.js at cfd72dbd.
function previousPurchaseEnd(anchor) {
  const end = new Date(anchor);
  end.setDate(end.getDate() + PRO_PURCHASE.durationDays);
  return end.toISOString();
}
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dates = [
  ['normal', '2026-01-15T12:00:00.000Z'],
  ['month boundary', '2026-01-31T12:00:00.000Z'],
  ['leap-year boundary', '2024-02-10T12:00:00.000Z'],
  ['spring DST', '2026-03-01T12:00:00.000Z'],
  ['fall DST', '2026-10-20T12:00:00.000Z'],
];
for (const [label, anchor] of dates) for (const kind of ['initial', 'active renewal', 'expired renewal']) {
  test(`calendar ${zone}: ${label}, ${kind} matches pre-Phase-2B2`, () => {
    const active = kind === 'active renewal';
    const now = new Date(Date.parse(anchor) - (active ? 1000 : 0));
    const account = kind === 'initial' ? { plan: 'Free', apiRequestLimit: 50 } : {
      plan: 'Pro', subscription_status: 'active', apiRequestLimit: 5000,
      subscriptionExpiresAt: active ? anchor : new Date(now.getTime() - 1000).toISOString(),
    };
    const period = renewalPeriod(account, now, PRO_PURCHASE.durationDays);
    assert.equal(period.start, anchor);
    assert.equal(period.end, previousPurchaseEnd(anchor));
  });
}
test(`calendar ${zone}: explicit spring/fall offsets reproduce the original DST mismatch correctly`, () => {
  assert.ok(['UTC', 'America/New_York'].includes(zone), 'runner must explicitly choose the test timezone');
  const account = { plan: 'Free', apiRequestLimit: 50 };
  const spring = renewalPeriod(account, new Date('2026-03-01T12:00:00.000Z')).end;
  const fall = renewalPeriod(account, new Date('2026-10-20T12:00:00.000Z')).end;
  assert.equal(spring, zone === 'UTC' ? '2026-03-31T12:00:00.000Z' : '2026-03-31T11:00:00.000Z');
  assert.equal(fall, zone === 'UTC' ? '2026-11-19T12:00:00.000Z' : '2026-11-19T13:00:00.000Z');
});
