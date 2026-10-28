import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateEntitlement } from '../../functions/subscription-lifecycle.mjs';
import { restrictedSegmentAccount } from '../../services/customer-segment.js';

const now = new Date('2026-10-28T00:00:00.000Z');
const freeAccount = { plan: 'Free', apiRequestLimit: 50, businessSegment: 'Grocery' };

function withSwitch(value, run) {
  const before = process.env.PLANS_DISABLED;
  if (value === undefined) delete process.env.PLANS_DISABLED; else process.env.PLANS_DISABLED = value;
  try { return run(); } finally {
    if (before === undefined) delete process.env.PLANS_DISABLED; else process.env.PLANS_DISABLED = before;
  }
}

test('plans switched off: every account is active, unlimited Pro Max with a future expiry', () => withSwitch('true', () => {
  const result = evaluateEntitlement(freeAccount, now);
  assert.equal(result.plan, 'Pro Max');
  assert.equal(result.activePro, true);
  assert.equal(result.limit, null);
  assert.ok(Date.parse(result.expiresAt) > now.getTime());
  assert.equal(result.normalization, null);
  assert.equal(restrictedSegmentAccount(freeAccount), false);
}));

test('switch off or unset: real plans apply', () => {
  for (const value of [undefined, 'false', '1']) withSwitch(value, () => {
    assert.notEqual(evaluateEntitlement(freeAccount, now).plan, 'Pro Max');
    assert.equal(restrictedSegmentAccount(freeAccount), true);
  });
});

test('blocked accounts stay blocked even with plans switched off', () => withSwitch('true', () => {
  assert.throws(() => evaluateEntitlement({ ...freeAccount, accountState: 'deleted', deletionRequested: true }, now));
}));
