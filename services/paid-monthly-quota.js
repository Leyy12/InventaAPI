// Monthly PRODUCT allowance for active Pro and Pro Max subscriptions: every
// product variant a catalog response delivers uses one (a product without
// variants uses one). One allowance for the whole account: Pro 15,000, Pro Max
// 20,000 a month. Pro Max also records how much each segment (Grocery, Pharmacy,
// Hardware) used, for display only. Free Trial keeps its own accounting in
// account-quota.js.
import { monthlyProductLimit } from '../functions/entitlement-limits.mjs';
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

// The limited allowance is always the account's.
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
  const limit = monthlyProductLimit(plan);
  return { window, used, limit, remaining: Math.max(0, limit - used),
    resetsAt, period: 'monthly', unit: 'products', scope: 'account', bucket };
}

// Charges what one response is about to deliver. `items` lists the products in
// page order as { segment, cost } (cost = variants). In one transaction it grants
// at most what the account has left, decides how many variants of each item may be
// sent (page order; the last one may be partial), adds the total to the account
// and, for Pro Max, adds each segment's share to its display counter.
export async function chargeMonthlyProducts(db, { userId, plan, window, resetsAt, items, clock = () => new Date() }) {
  const limit = monthlyProductLimit(plan);
  const accountRef = db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(userId, window, 'account'));
  const segmentRefs = plan === 'pro_max'
    ? Object.fromEntries(PRO_MAX_SEGMENTS.map(segment => [segment, db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(userId, window, segment))]))
    : {};
  return db.runTransaction(async tx => {
    const accountDoc = await tx.get(accountRef);
    const segmentUsed = {};
    for (const [segment, ref] of Object.entries(segmentRefs)) {
      const doc = await tx.get(ref);
      segmentUsed[segment] = monthlyUsed(doc.exists ? doc.data() : undefined, window);
    }
    const used = monthlyUsed(accountDoc.exists ? accountDoc.data() : undefined, window);
    let budget = Math.max(0, limit - used);
    const allowed = items.map(item => {
      const cost = Number.isSafeInteger(item.cost) && item.cost > 0 ? item.cost : 0;
      const take = Math.min(cost, budget);
      budget -= take;
      return take;
    });
    const granted = allowed.reduce((sum, n) => sum + n, 0);
    const now = clock().toISOString();
    if (granted > 0) {
      tx.set(accountRef, { userId, window, bucket: 'account', used: used + granted, updatedAt: now });
      const shares = {};
      items.forEach((item, i) => { if (allowed[i] && Object.hasOwn(segmentRefs, item.segment)) shares[item.segment] = (shares[item.segment] || 0) + allowed[i]; });
      for (const [segment, share] of Object.entries(shares)) {
        segmentUsed[segment] += share;
        tx.set(segmentRefs[segment], { userId, window, bucket: segment, used: segmentUsed[segment], updatedAt: now });
      }
    }
    return { granted, allowed, usage: monthlyUsage('account', used + granted, window, resetsAt, plan),
      segments: plan === 'pro_max' ? PRO_MAX_SEGMENTS.map(segment => ({ segment, used: segmentUsed[segment] })) : null };
  });
}

// What the customer sees: the account total (limited) and, for Pro Max, how much
// each segment used this month.
export async function readMonthlySummary(tx, db, uid, plan, _keys, now) {
  const { window, resetsAt } = monthWindow(now);
  const limit = monthlyProductLimit(plan);
  const read = async bucket => monthlyUsed((await tx.get(db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(uid, window, bucket)))).data(), window);
  const used = await read('account');
  const segments = [];
  if (plan === 'pro_max') for (const segment of PRO_MAX_SEGMENTS) segments.push({ segment, used: await read(segment) });
  return { period: 'monthly', unit: 'products', window, resetsAt, limit, plan,
    buckets: [{ bucket: 'account', used, remaining: Math.max(0, limit - used) }],
    ...(plan === 'pro_max' ? { segments } : {}) };
}
