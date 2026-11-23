import { describe, test, expect } from '@jest/globals';
import {
  TRIAL_MAX_PRODUCTS, trialCatalogChangeAllowed, monthlyProductLimit,
} from '../../functions/entitlement-limits.mjs';
import {
  DEFAULT_REQUEST_LIMITS, validPlanRequestLimit, requestLimitPolicy, effectiveRequestAllowance,
} from '../../functions/request-limit-policy.mjs';
import { purchaseForIntent, globalTestBillingConfiguration } from '../../services/payment-contract.js';

const ids = n => Array.from({ length: n }, (_, i) => `p${i}`);

describe('Free Trial product cap', () => {
  test('allows exactly the maximum', () => {
    expect(trialCatalogChangeAllowed([], ids(TRIAL_MAX_PRODUCTS))).toBe(true);
  });
  test('blocks one over the maximum', () => {
    expect(trialCatalogChangeAllowed([], ids(TRIAL_MAX_PRODUCTS + 1))).toBe(false);
  });
  test('counts unique IDs, not duplicates', () => {
    expect(trialCatalogChangeAllowed([], [...ids(TRIAL_MAX_PRODUCTS), 'p0', 'p1'])).toBe(true);
  });
});

describe('monthly product limits', () => {
  test('Pro is 15,000 and Pro Max is 20,000', () => {
    expect(monthlyProductLimit('pro')).toBe(15000);
    expect(monthlyProductLimit('pro_max')).toBe(20000);
    expect(monthlyProductLimit('Pro Max')).toBe(20000);
  });
});

describe('request limit policy', () => {
  test('defaults are used when nothing is configured', () => {
    expect(requestLimitPolicy({})).toEqual(DEFAULT_REQUEST_LIMITS);
  });
  test('Pro cannot be unlimited', () => {
    expect(validPlanRequestLimit('pro', null)).toBe(false);
    expect(validPlanRequestLimit('pro', 500)).toBe(true);
  });
  test('invalid configuration fails with 503', () => {
    expect(() => requestLimitPolicy({ planRequestLimits: { pro: -1 } })).toThrow(expect.objectContaining({ status: 503 }));
  });
  test('the higher of saved promise and policy wins', () => {
    const contracts = { version: 1, plans: { pro: { version: 1, period: 'utc_daily', limit: 800 } } };
    expect(effectiveRequestAllowance(contracts, 'pro')).toBe(800);
    expect(effectiveRequestAllowance(undefined, 'pro', { ...DEFAULT_REQUEST_LIMITS, pro: 1000 })).toBe(1000);
  });
});

describe('payment catalog', () => {
  test('known plans resolve, unknown plans do not', () => {
    expect(purchaseForIntent('pro')?.amount).toBe(50000);
    expect(purchaseForIntent('pro_max')?.amount).toBe(130000);
    expect(purchaseForIntent('enterprise')).toBeFalsy();
  });
  test('temporary billing is refused in test mode', () => {
    expect(() => globalTestBillingConfiguration({ mode: 'test', globalTestBilling: 'true', globalTestAmountCentavos: '500' })).toThrow();
    expect(globalTestBillingConfiguration({ mode: 'test', globalTestBilling: 'false' })).toBe(false);
  });
});
