import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalPeriod } from '../../../functions/subscription-lifecycle.mjs';
import { PRO_PURCHASE } from '../../../services/payment-contract.js';

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const dates = [
  ['Jan 31', '2026-01-31T12:34:56.789Z', '2026-03-02T12:34:56.789Z'],
  ['Feb 28', '2026-02-28T12:34:56.789Z', '2026-03-30T12:34:56.789Z'],
  ['leap Feb 29', '2024-02-29T12:34:56.789Z', '2024-03-30T12:34:56.789Z'],
  ['Mar 31', '2026-03-31T12:34:56.789Z', '2026-04-30T12:34:56.789Z'],
  ['year rollover Dec 31', '2026-12-31T12:34:56.789Z', '2027-01-30T12:34:56.789Z'],
  ['New York spring DST', '2026-03-01T12:34:56.789Z', '2026-03-31T12:34:56.789Z'],
  ['New York fall DST', '2026-10-20T12:34:56.789Z', '2026-11-19T12:34:56.789Z'],
  ['Berlin spring DST', '2026-03-15T12:34:56.789Z', '2026-04-14T12:34:56.789Z'],
  ['Berlin fall DST', '2026-10-20T12:34:56.789Z', '2026-11-19T12:34:56.789Z'],
];
for (const [label, anchor, expectedEnd] of dates) for (const kind of ['initial', 'active renewal', 'expired renewal']) {
  test(`calendar ${zone}: ${label}, ${kind} has identical UTC period boundaries`, () => {
    const active = kind === 'active renewal';
    const now = new Date(Date.parse(anchor) - (active ? 1000 : 0));
    const account = kind === 'initial' ? { plan: 'Free', apiRequestLimit: 50 } : {
      plan: 'Pro', subscription_status: 'active', apiRequestLimit: 5000,
      subscriptionExpiresAt: active ? anchor : new Date(now.getTime() - 1000).toISOString(),
    };
    const period = renewalPeriod(account, now, PRO_PURCHASE.durationDays);
    assert.deepEqual(period, { start: anchor, end: expectedEnd });
  });
}
test(`calendar ${zone}: runner selects one of the four required ambient zones`, () => {
  assert.ok(['UTC', 'America/New_York', 'Asia/Manila', 'Europe/Berlin'].includes(zone));
});
