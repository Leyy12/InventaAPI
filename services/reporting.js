// Browser-safe read-only reporting. Phase 1 remains the sole product projection.
import { PRODUCT_SEGMENTS, normalizeSegment, projectProduct } from './product-contract.js';

export const REPORT_SEGMENTS = PRODUCT_SEGMENTS;
export function reportSelection(value) {
  return value === 'All' ? 'All' : normalizeSegment(value);
}
export function customerReportScope(plan, preference) {
  if (['Pro', 'Enterprise', 'Unlimited'].includes(plan)) return { state: 'ready', segment: 'All', restricted: false };
  if (!['Free', 'Basic', 'Starter'].includes(plan)) return { state: 'unavailable', segment: null, restricted: true };
  const segment = normalizeSegment(preference);
  return { state: segment ? 'ready' : 'preference_required', segment, restricted: true };
}
// Account-owned selection survives verification, but current scope always wins.
export function reconcileReportSession(previous, uid, plan, preference) {
  const scope = customerReportScope(plan, preference);
  const sameAccount = !!uid && previous?.uid === uid;
  const selection = scope.restricted && scope.segment ? scope.segment : sameAccount ? previous.selection : 'All';
  const loadCatalog = !!uid && (!!scope.segment || (scope.state === 'unavailable' && sameAccount && previous.loadCatalog));
  const next = { uid, selection, loadCatalog, scope };
  return sameAccount && previous.selection === selection && previous.loadCatalog === loadCatalog
    && previous.scope.state === scope.state && previous.scope.segment === scope.segment
    && previous.scope.restricted === scope.restricted ? previous : next;
}
// Verification identity only, never a source of quota values.
export function quotaVerificationKey(uid, entitlement) {
  return uid && entitlement ? JSON.stringify([uid, entitlement.serverTime, entitlement.plan,
    entitlement.subscription_status, entitlement.apiRequestLimit, entitlement.subscriptionStartedAt,
    entitlement.subscriptionExpiresAt, entitlement.activePro, entitlement.expired]) : null;
}
export function activeKeyHolders(keys, accounts) {
  if (keys.status !== 'ready' || accounts.status !== 'ready') return null;
  const owners = new Set(accounts.records.filter(account => typeof account.id === 'string'
    && account.disabled !== true && account.deleted !== true && account.deletedAt == null
    && account.deletionRequested !== true && !['deleting', 'deleted', 'disabled', 'pending_deletion'].includes(account.status)
    && (account.accountState == null || account.accountState === 'active')
    && String(account.plan).toLowerCase() !== 'deleted').map(account => account.id));
  return new Set(keys.records.filter(key => key.status === 'active' && typeof key.userId === 'string'
    && key.userId.length > 0 && key.userId.trim() === key.userId && !/[\/\u0000-\u001f\u007f]/u.test(key.userId)
    && !['.', '..'].includes(key.userId) && !/^__.*__$/u.test(key.userId)
    && new TextEncoder().encode(key.userId).length <= 1500 && owners.has(key.userId)).map(key => key.userId)).size;
}
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const average = values => {
  if (!values.length) return null;
  const result = values.reduce((sum, value) => sum + value / values.length, 0);
  return Number.isFinite(result) ? result : null;
};
export function catalogReport(records, selection = 'All') {
  const segment = reportSelection(selection);
  if (!segment) throw new Error('Unsupported report segment.');
  const products = records.map(record => projectProduct(record)).filter(product => product?.visibility.visible
    && (segment === 'All' || product.segment === segment));
  const prices = products.map(product => product.price).filter(finiteNonnegative);
  // Preserve established upper cutoffs; continuous intervals also cover decimal prices.
  const distribution = ['₱0–50', 'Over ₱50–100', 'Over ₱100–500', 'Over ₱500–1,000', 'Over ₱1,000']
    .map(range => ({ range, count: 0 }));
  for (const price of prices) distribution[price <= 50 ? 0 : price <= 100 ? 1 : price <= 500 ? 2 : price <= 1000 ? 3 : 4].count++;
  const categories = new Map();
  for (const product of products) categories.set(product.category, (categories.get(product.category) || 0) + 1);
  return { total: products.length, priced: prices.length, missingPrice: products.length - prices.length,
    averagePrice: average(prices), distribution,
    segments: REPORT_SEGMENTS.map(name => ({ name, count: products.filter(product => product.segment === name).length })),
    categories: [...categories].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) };
}
export function reportView(source, selection) {
  if (source.status === 'loading') return { state: 'loading', report: null };
  if (source.status === 'error') return { state: 'error', report: null };
  const report = catalogReport(source.records, selection);
  return { state: report.total ? 'ready' : 'empty', report };
}
export function quotaSummary(usage, now = new Date()) {
  if (!usage || usage.scope !== 'account' || !Number.isSafeInteger(usage.used) || usage.used < 0
    || !(usage.limit === null || (Number.isSafeInteger(usage.limit) && usage.limit >= 0))
    || usage.window !== now.toISOString().slice(0, 10)
    || !Number.isFinite(Date.parse(usage.resetsAt)) || Date.parse(usage.resetsAt) <= now.getTime()) return null;
  const pending = !!usage.holdUntil;
  if (pending && usage.holdUntil !== usage.resetsAt) return null;
  return { used: pending ? null : usage.used, limit: usage.limit,
    remaining: pending ? 0 : usage.limit === null ? null : Math.max(0, usage.limit - usage.used),
    percent: pending || usage.limit === null || usage.limit === 0 ? null : Math.min(100, (usage.used / usage.limit) * 100),
    pending, resetsAt: usage.resetsAt };
}
export function reportTimestamp(value) {
  try {
    const date = value instanceof Date ? value : typeof value?.toDate === 'function' ? value.toDate()
      : typeof value === 'string' ? new Date(value) : null;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch { return null; }
}
export function telemetryReport(records) {
  const valid = records.filter(record => reportTimestamp(record.timestamp));
  const outcomes = valid.filter(record => typeof record.success === 'boolean');
  const latencies = valid.map(record => record.latencyMs).filter(finiteNonnegative);
  const hours = new Map();
  for (const record of valid) {
    const hour = reportTimestamp(record.timestamp).toISOString().slice(0, 13) + ':00Z';
    hours.set(hour, (hours.get(hour) || 0) + 1);
  }
  return { recorded: valid.length, excluded: records.length - valid.length,
    successPercent: outcomes.length ? 100 * outcomes.filter(record => record.success).length / outcomes.length : null,
    outcomeSamples: outcomes.length, averageLatency: average(latencies), latencySamples: latencies.length,
    series: [...hours].sort(([a], [b]) => a.localeCompare(b)).map(([hour, count]) => ({ hour, count })) };
}
