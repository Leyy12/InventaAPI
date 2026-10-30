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

// Pro shares one account allowance. Pro Max has one key for all segments, so the
// allowance is chosen per PRODUCT: each variant counts against its product's
// segment ("general" only for a product with no segment).
export function quotaBucket(plan, key) {
  if (plan === 'pro') return 'account';
  return normalizeSegment(key?.segment) || 'general';
}
export function productBucket(plan, product) {
  if (plan === 'pro') return 'account';
  return normalizeSegment(product?.segment) || 'general';
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

// Charges what a response is about to deliver, per allowance bucket
// ({ Grocery: 8, Pharmacy: 3 }). Each bucket grants at most what it has left, in
// one transaction, so concurrent calls can never take a month past the limit.
export async function chargeMonthlyBuckets(db, { userId, window, resetsAt, requested, clock = () => new Date() }) {
  const wanted = Object.entries(requested || {})
    .map(([bucket, count]) => [bucket, Number.isSafeInteger(count) && count > 0 ? count : 0])
    .sort(([a], [b]) => a.localeCompare(b));
  return db.runTransaction(async tx => {
    const current = [];
    for (const [bucket, count] of wanted) {
      const ref = db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(userId, window, bucket));
      const doc = await tx.get(ref);
      current.push({ bucket, count, ref, used: monthlyUsed(doc.exists ? doc.data() : undefined, window) });
    }
    const granted = {}, usage = {};
    for (const { bucket, count, ref, used } of current) {
      granted[bucket] = Math.min(count, Math.max(0, PAID_MONTHLY_REQUEST_LIMIT - used));
      if (granted[bucket] > 0) tx.set(ref, { userId, window, bucket, used: used + granted[bucket], updatedAt: clock().toISOString() });
      usage[bucket] = monthlyUsage(bucket, used + granted[bucket], window, resetsAt);
    }
    return { granted, usage };
  });
}

// Single-bucket form (Pro, or any one allowance).
export async function chargeMonthlyProducts(db, { userId, bucket, window, resetsAt, requested, clock = () => new Date() }) {
  const result = await chargeMonthlyBuckets(db, { userId, window, resetsAt, requested: { [bucket]: requested }, clock });
  return { granted: result.granted[bucket], usage: result.usage[bucket] };
}

// The buckets shown to the customer: Pro has one, Pro Max one per segment.
export function displayBuckets(plan) {
  if (plan === 'pro') return ['account'];
  return [...PRO_MAX_SEGMENTS];
}

export async function readMonthlySummary(tx, db, uid, plan, keys, now) {
  const { window, resetsAt } = monthWindow(now);
  const buckets = [];
  for (const bucket of displayBuckets(plan)) {
    const stored = (await tx.get(db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(uid, window, bucket)))).data();
    buckets.push({ bucket, used: monthlyUsed(stored, window) });
  }
  return { period: 'monthly', unit: 'products', window, resetsAt, limit: PAID_MONTHLY_REQUEST_LIMIT, plan,
    buckets: buckets.map(item => ({ ...item, remaining: Math.max(0, PAID_MONTHLY_REQUEST_LIMIT - item.used) })) };
}
