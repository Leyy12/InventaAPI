// Monthly PRODUCT allowance for active Pro and Pro Max subscriptions: every
// product variant a catalog response delivers uses one (a product without
// variants uses one). One allowance for the whole account: Pro 15,000, Pro Max
// 20,000 a month. Pro Max also records how much each segment (Grocery, Pharmacy,
// Hardware) used, for display only. Free Trial keeps its own accounting in
// account-quota.js.
import { createHash } from 'node:crypto';
import { monthlyProductLimit } from '../functions/entitlement-limits.mjs';
import { ApiSecurityError } from './api-key-security.js';

export const MONTHLY_USAGE_COLLECTION = 'account_paid_monthly_usage';
// Which product variants each app already received this month:
// <uid>_<YYYY-MM>_<app id> → { keys: { <short variant hash>: 1 } }.
export const MONTHLY_DELIVERED_COLLECTION = 'account_paid_monthly_delivered';
export const variantHash = key => createHash('sha1').update(String(key)).digest('base64url').slice(0, 12);
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
// page order as { segment, variantKeys } (one key per variant; a product without
// variants has one key) or, for callers without keys, { segment, cost }.
// With a `consumerId` (the app the call came from, see api-consumers.js), a
// variant that app already received this month is sent free; only new ones count.
// In one transaction it grants at most what the account has left, decides which
// variants of each item may be sent (page order; already-delivered first), adds
// the new total to the account, records the new variants for the app and, for Pro
// Max, adds each segment's share to its display counter.
export async function chargeMonthlyProducts(db, { userId, plan, window, resetsAt, items, consumerId = null, clock = () => new Date() }) {
  const limit = monthlyProductLimit(plan);
  const accountRef = db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(userId, window, 'account'));
  const segmentRefs = plan === 'pro_max'
    ? Object.fromEntries(PRO_MAX_SEGMENTS.map(segment => [segment, db.collection(MONTHLY_USAGE_COLLECTION).doc(monthlyUsageId(userId, window, segment))]))
    : {};
  const deliveredRef = consumerId ? db.collection(MONTHLY_DELIVERED_COLLECTION).doc(monthlyUsageId(userId, window, consumerId)) : null;
  return db.runTransaction(async tx => {
    const accountDoc = await tx.get(accountRef);
    const segmentUsed = {};
    for (const [segment, ref] of Object.entries(segmentRefs)) {
      const doc = await tx.get(ref);
      segmentUsed[segment] = monthlyUsed(doc.exists ? doc.data() : undefined, window);
    }
    const deliveredDoc = deliveredRef ? await tx.get(deliveredRef) : null;
    const storedKeys = deliveredDoc?.exists && deliveredDoc.data()?.window === window
      && deliveredDoc.data().keys && typeof deliveredDoc.data().keys === 'object' ? deliveredDoc.data().keys : {};
    const delivered = { ...storedKeys };
    const used = monthlyUsed(accountDoc.exists ? accountDoc.data() : undefined, window);
    let budget = Math.max(0, limit - used);
    let granted = 0, repeated = 0;
    const shares = {};
    // Per item: which of its variant keys may be sent, and how many units that is.
    const plans = items.map(item => {
      if (!Array.isArray(item.variantKeys)) {
        const cost = Number.isSafeInteger(item.cost) && item.cost > 0 ? item.cost : 0;
        const take = Math.min(cost, budget);
        budget -= take; granted += take;
        if (take) shares[item.segment] = (shares[item.segment] || 0) + take;
        return { take, keys: null };
      }
      const keys = [];
      for (const key of item.variantKeys) {
        const hash = variantHash(key);
        if (deliveredRef && delivered[hash]) { keys.push(key); repeated++; continue; }
        if (budget <= 0) continue;
        budget--; granted++;
        if (deliveredRef) delivered[hash] = 1;
        shares[item.segment] = (shares[item.segment] || 0) + 1;
        keys.push(key);
      }
      return { take: keys.length, keys };
    });
    const now = clock().toISOString();
    if (granted > 0) {
      tx.set(accountRef, { userId, window, bucket: 'account', used: used + granted, updatedAt: now });
      for (const [segment, share] of Object.entries(shares)) {
        if (!Object.hasOwn(segmentRefs, segment)) continue;
        segmentUsed[segment] += share;
        tx.set(segmentRefs[segment], { userId, window, bucket: segment, used: segmentUsed[segment], updatedAt: now });
      }
      if (deliveredRef) tx.set(deliveredRef, { userId, window, consumerId, keys: delivered, updatedAt: now });
    }
    return { granted, repeated, allowed: plans.map(p => p.take), allowedKeys: plans.map(p => p.keys),
      usage: monthlyUsage('account', used + granted, window, resetsAt, plan),
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
