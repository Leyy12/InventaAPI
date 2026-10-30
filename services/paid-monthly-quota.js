// Monthly REQUEST allowance for active Pro and Pro Max subscriptions: each
// catalog call counts as one, in one allowance for the whole account
// (Pro 15,000, Pro Max 20,000 a month). Free Trial keeps its own accounting in
// account-quota.js.
import { monthlyRequestLimit } from '../functions/entitlement-limits.mjs';
import { ApiSecurityError } from './api-key-security.js';

export const MONTHLY_USAGE_COLLECTION = 'account_paid_monthly_usage';
export const PRO_MAX_SEGMENTS = Object.freeze(['Grocery', 'Pharmacy', 'Hardware']);

// 'pro' | 'pro_max' for an active paid subscription, otherwise null.
export function paidQuotaPlan(entitlement) {
  if (!entitlement || entitlement.activePro !== true) return null;
  if (entitlement.plan === 'Pro Max') return 'pro_max';
  if (entitlement.plan === 'Pro') return 'pro';
  return null;
}

export function monthWindow(now) {
  const window = now.toISOString().slice(0, 7);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { window, resetsAt: next.toISOString() };
}

// Both paid plans use one account allowance.
export function quotaBucket() {
  return 'account';
}

export const monthlyUsageId = (uid, window, bucket) => `${uid}_${window}_${bucket}`;

export function monthlyUsed(stored, window) {
  if (stored === undefined || stored === null) return 0;
  if (typeof stored.window !== 'string' || !/^\d{4}-\d{2}$/u.test(stored.window) || stored.window > window
    || !Number.isSafeInteger(stored.used) || stored.used < 0) {
    throw new ApiSecurityError(503, 'USAGE_UNAVAILABLE', 'Unable to verify monthly account usage.');
  }
  return stored.window === window ? stored.used : 0;
}

export function monthlyUsage(bucket, used, window, resetsAt, plan = 'pro') {
  const limit = monthlyRequestLimit(plan);
  return { window, used, limit, remaining: Math.max(0, limit - used),
    resetsAt, period: 'monthly', unit: 'requests', scope: 'account', bucket };
}

// The buckets shown to the customer: one account allowance for either plan.
export function displayBuckets() {
  return ['account'];
}

export async function readMonthlySummary(tx, db, uid, plan, _keys, now) {
  const { window, resetsAt } = monthWindow(now);
  const limit = monthlyRequestLimit(plan);
  const stored = (await tx.get(db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(uid, window, 'account')))).data();
  const used = monthlyUsed(stored, window);
  return { period: 'monthly', unit: 'requests', window, resetsAt, limit, plan,
    buckets: [{ bucket: 'account', used, remaining: Math.max(0, limit - used) }] };
}
