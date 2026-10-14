import { TRIAL_MAX_PRODUCTS } from '../../../functions/entitlement-limits.mjs';
import { canonicalLinkedProductIds, type ProductLink } from './linked-product-names';
import type { AccountEntitlement } from './use-account-entitlements';

export type InventoryKey = ProductLink & { userId: string; status?: string };
export type EntitlementLoadStatus = 'loading' | 'ready' | 'refreshing' | 'unavailable';

// The allowance belongs to the owner. Revoked rows retain their own history,
// but cannot contribute to the owner's current authorization scope.
export function activeAccountProductCounts(keys: InventoryKey[]): Record<string, number> {
  const accounts = new Map<string, Set<string>>();
  for (const key of keys) {
    if (key.status !== 'active' || !key.userId) continue;
    const ids = accounts.get(key.userId) ?? new Set<string>();
    for (const id of canonicalLinkedProductIds(key)) ids.add(id);
    accounts.set(key.userId, ids);
  }
  return Object.fromEntries([...accounts].map(([uid, ids]) => [uid, ids.size]));
}

export function inventoryPlanLabel(account?: AccountEntitlement): string {
  if (!account || typeof account.plan !== 'string' || typeof account.status !== 'string'
    || account.plan === 'Unavailable' || account.status === 'unverified') return 'Unavailable';
  if (account.plan === 'Disabled') return 'Disabled';
  if (account.status === 'upgrade_required' || account.plan === 'Upgrade Required') return 'Upgrade Required';
  if (account.active === false || account.status === 'inactive') return 'Inactive';
  if (account.active !== true) return 'Unavailable';
  if (account.plan === 'Free Trial' && account.status !== 'trial') return 'Unavailable';
  if (['Pro', 'Pro Max'].includes(account.plan) && account.status !== 'active') return 'Unavailable';
  return account.plan;
}

export type InventoryUsage = { label: string; value: string; note?: string; percent?: number };
const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function inventoryUsage(account: AccountEntitlement | undefined, products: number): InventoryUsage {
  const plan = inventoryPlanLabel(account);
  if (plan === 'Upgrade Required') return { label: 'Account access', value: plan, note: 'Upgrade required to resume API access' };
  if (['Disabled', 'Inactive', 'Unavailable'].includes(plan)) return { label: 'Account access', value: plan };
  if (plan === 'Free Trial') {
    if (!count(products)) return { label: 'Linked Products', value: 'Usage unavailable' };
    return { label: 'Linked Products', value: `${products} / ${TRIAL_MAX_PRODUCTS} Products`,
      note: `${Math.max(0, TRIAL_MAX_PRODUCTS - products)} slots remaining`, percent: Math.min(100, products / TRIAL_MAX_PRODUCTS * 100) };
  }
  const used = account?.period === 'daily' && count(account.used) ? account.used : null;
  if (plan === 'Pro Max' && account?.limit === null) return used === null
    ? { label: 'Requests Today (UTC)', value: 'Unlimited requests', note: 'Daily usage unavailable' }
    : { label: 'Requests Today (UTC)', value: `${used} used · Unlimited`, note: 'No daily request limit' };
  if (used === null || !count(account?.limit) || account.limit === 0) return { label: 'Requests Today (UTC)', value: 'Usage unavailable' };
  return { label: 'Requests Today (UTC)', value: `${used} / ${account.limit} Requests`,
    note: `${Math.max(0, account.limit - used)} requests remaining`, percent: Math.min(100, used / account.limit * 100) };
}

// Only stored, timezone-qualified ISO timestamps and known Firestore shapes
// are supported. Date-only strings and numeric millisecond guesses are rejected.
export function normalizeKeyTimestamp(value: unknown): Date | null {
  try {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      const ms = (value as Date).getTime();
      return Number.isFinite(ms) ? new Date(ms) : null;
    }
    if (typeof value === 'string') {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
      if (!match) return null;
      const [, year, month, day, hour, minute, second, zone] = match;
      const calendar = new Date(0);
      calendar.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
      if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1
        || calendar.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59
        || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))) return null;
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? new Date(ms) : null;
    }
    if (!value || typeof value !== 'object') return null;
    const stored = value as { toDate?: () => unknown; seconds?: unknown; nanoseconds?: unknown; _seconds?: unknown; _nanoseconds?: unknown };
    if (typeof stored.toDate === 'function') {
      const date = stored.toDate();
      return Object.prototype.toString.call(date) === '[object Date]' ? normalizeKeyTimestamp(date) : null;
    }
    const seconds = stored.seconds ?? stored._seconds;
    const nanos = stored.nanoseconds ?? stored._nanoseconds;
    if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanos) || (nanos as number) < 0 || (nanos as number) > 999999999
      || (seconds as number) < -62135596800 || (seconds as number) > 253402300799) return null;
    return new Date((seconds as number) * 1000 + Math.floor((nanos as number) / 1000000));
  } catch { return null; }
}

const keyDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric',
  year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
export function formatKeyTimestamp(value: unknown, field: 'createdAt' | 'lastUsed'): string {
  const date = normalizeKeyTimestamp(value);
  if (date) return `${keyDateFormat.format(date)} PHT`;
  return field === 'createdAt' ? 'Date unavailable' : value === null ? 'Never used' : 'Not recorded';
}
