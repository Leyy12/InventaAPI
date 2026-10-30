// Monthly PRODUCT allowance for active Pro and Pro Max subscriptions: each
// product variant a catalog response delivers uses one of the 15,000.
// Pro: one allowance for the whole account. Pro Max: one allowance per
// Business Segment, chosen by the segment of the API key making the request.
// Free Trial keeps its own (daily / catalog) accounting in account-quota.js.
import { PAID_MONTHLY_PRODUCT_LIMIT as PAID_MONTHLY_REQUEST_LIMIT } from '../functions/entitlement-limits.mjs';
import { normalizeSegment } from './product-contract.js';
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

// Pro keys share the account allowance. Pro Max keys use their segment's
// allowance; an older key with no segment uses a separate "general" allowance.
export function quotaBucket(plan, key) {
  if (plan === 'pro') return 'account';
  return normalizeSegment(key?.segment) || 'general';
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

export function monthlyUsage(bucket, used, window, resetsAt) {
  return { window, used, limit: PAID_MONTHLY_REQUEST_LIMIT, remaining: Math.max(0, PAID_MONTHLY_REQUEST_LIMIT - used),
    resetsAt, period: 'monthly', unit: 'products', scope: bucket === 'account' ? 'account' : 'segment', bucket };
}

// Charges the products a response is about to deliver. Grants at most what is
// left this month, so concurrent calls can never take the total past the limit.
// Returns how many products may be sent and the updated usage.
export async function chargeMonthlyProducts(db, { userId, bucket, window, resetsAt, requested, clock = () => new Date() }) {
  const count = Number.isSafeInteger(requested) && requested > 0 ? requested : 0;
  const ref = db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(userId, window, bucket));
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const used = monthlyUsed(doc.exists ? doc.data() : undefined, window);
    const granted = Math.min(count, Math.max(0, PAID_MONTHLY_REQUEST_LIMIT - used));
    if (granted > 0) tx.set(ref, { userId, window, bucket, used: used + granted, updatedAt: clock().toISOString() });
    return { granted, usage: monthlyUsage(bucket, used + granted, window, resetsAt) };
  });
}

// The buckets shown to the customer: Pro has one, Pro Max one per segment
// (plus "general" only while an older untagged key exists).
export function displayBuckets(plan, keys = []) {
  if (plan === 'pro') return ['account'];
  const general = keys.some(key => key.status === 'active' && !normalizeSegment(key.segment));
  return [...PRO_MAX_SEGMENTS, ...(general ? ['general'] : [])];
}

export async function readMonthlySummary(tx, db, uid, plan, keys, now) {
  const { window, resetsAt } = monthWindow(now);
  const buckets = [];
  for (const bucket of displayBuckets(plan, keys)) {
    const stored = (await tx.get(db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(uid, window, bucket)))).data();
    buckets.push({ bucket, used: monthlyUsed(stored, window) });
  }
  return { period: 'monthly', unit: 'products', window, resetsAt, limit: PAID_MONTHLY_REQUEST_LIMIT, plan,
    buckets: buckets.map(item => ({ ...item, remaining: Math.max(0, PAID_MONTHLY_REQUEST_LIMIT - item.used) })) };
}
