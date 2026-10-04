import { PRO_DAILY_REQUEST_LIMIT } from './entitlement-limits.mjs';
export { TRIAL_MIN_PRODUCTS, TRIAL_MAX_PRODUCTS } from './entitlement-limits.mjs';

// Shared by Express and the existing deployable Functions package. No SDK/I/O.
export const PLAN_LEVELS = Object.freeze({ free: 0, starter: 0, pro: 1, professional: 1,
  'pro max': 2, enterprise: 2, unlimited: 2 });
export const planKind = value => {
  const name = typeof value === 'string' ? value.toLowerCase() : '';
  if (name === 'pro max') return 'pro_max';
  if (name === 'pro' || name === 'professional') return 'pro';
  if (name === 'free' || name === 'starter') return 'free';
  if (name === 'enterprise' || name === 'unlimited') return 'legacy_unlimited';
  return null;
};
// Legacy storage envelope retained for signup/normalization compatibility only.
// evaluateEntitlement never grants this monthly allowance.
export const FREE_ENTITLEMENT = Object.freeze({ plan: 'Free', apiRequestLimit: 50, subscription_status: 'inactive' });
export function accountBlocked(account) {
  return !account || account.disabled === true || account.deleted === true || account.deletedAt != null
    || account.deletionRequested === true || ['deleting', 'deleted', 'disabled', 'pending_deletion'].includes(account.status)
    || (typeof account.plan === 'string' && account.plan.toLowerCase() === 'deleted')
    || (account.accountState != null && account.accountState !== 'active');
}
export function dateMillis(value) {
  try {
    if (value instanceof Date) return value.getTime();
    if (value && typeof value.toDate === 'function') {
      const date = value.toDate();
      return date instanceof Date ? date.getTime() : NaN;
    }
    if (typeof value !== 'string') return NaN;
    // Paid and Trial timestamps must identify an instant, never a local date.
    const match = /^(\d{4})[\-](\d{2})[\-](\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|([+-])(\d{2}):(\d{2}))$/u.exec(value);
    if (!match) return NaN;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone, sign, offsetHourText, offsetMinuteText] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
    const offsetHour = Number(offsetHourText || 0), offsetMinute = Number(offsetMinuteText || 0);
    if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59
      || offsetHour > 23 || offsetMinute > 59) return NaN;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, Number(fraction.padEnd(3, '0').slice(0, 3)));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
    const offset = zone.toUpperCase() === 'Z' ? 0 : (sign === '+' ? 1 : -1) * (offsetHour * 60 + offsetMinute);
    return date.getTime() - offset * 60000;
  } catch { return NaN; }
}
function unavailable(code = 'ENTITLEMENT_UNAVAILABLE', status = 503) {
  throw Object.assign(new Error('Unable to verify account entitlement.'), { code, status });
}

function upgradeRequired(trial, { expired = trial.expired, expiresAt = trial.expiresAt,
  startedAt = trial.startedAt, normalization = null } = {}) {
  return { plan: 'Upgrade Required', level: -1, limit: 0, status: 'upgrade_required',
    upgradeRequired: true, activePro: false, activeTrial: false, expired, expiresAt, startedAt, normalization };
}
export function trialState(account, now = new Date()) {
  const fields = ['hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt', 'trialExpiredAt', 'trialExhaustedAt', 'trialConsumed'];
  if (!fields.some(field => Object.hasOwn(account || {}, field))) return { used: false, active: false, expired: false, startedAt: null, expiresAt: null };
  const start = dateMillis(account.trialStartedAt), end = dateMillis(account.trialExpiresAt);
  if (account.trialVersion !== 1 || account.hasUsedFreeTrial !== true || !Number.isFinite(now.getTime())
    || !Number.isFinite(start) || !Number.isFinite(end) || end - start !== 7 * 86400000 || start > now.getTime()) unavailable('TRIAL_UNAVAILABLE');
  const eligiblePlan = ['free', 'starter'].includes(String(account.plan).toLowerCase());
  if (account.trialConsumed != null && typeof account.trialConsumed !== 'boolean') unavailable('TRIAL_UNAVAILABLE');
  const exhausted = Object.hasOwn(account, 'trialExhaustedAt');
  const exhaustedAt = dateMillis(account.trialExhaustedAt);
  if (exhausted && (!Number.isFinite(exhaustedAt) || exhaustedAt < start || exhaustedAt >= end || exhaustedAt > now.getTime())) unavailable('TRIAL_UNAVAILABLE');
  return { used: true, active: eligiblePlan && account.trialConsumed !== true && !exhausted && now.getTime() < end, exhausted, expired: now.getTime() >= end,
    startedAt: new Date(start).toISOString(), expiresAt: new Date(end).toISOString() };
}
export function evaluateEntitlement(account, now = new Date()) {
  if (accountBlocked(account)) unavailable('ACCOUNT_DISABLED', 403);
  if (!Number.isFinite(now.getTime())) unavailable();
  const kind = planKind(account.plan);
  if (!kind) unavailable();
  const level = kind === 'free' ? 0 : kind === 'pro' ? 1 : 2;
  if (level === 0) {
    const trial = trialState(account, now);
    if (trial.active) return { plan: 'Free Trial', level: 1, limit: null, status: 'trial', activePro: false,
      activeTrial: true, expired: false, expiresAt: trial.expiresAt, startedAt: trial.startedAt, normalization: null };
    // A never-started account has no protected allowance until server session
    // establishment initializes its one-time Trial. Legacy monthly keys cannot bypass it.
    return upgradeRequired(trial);
  }
  const end = dateMillis(account.subscriptionExpiresAt);
  const expiresAt = Number.isFinite(end) ? new Date(end).toISOString() : null;
  const start = dateMillis(account.subscriptionStartedAt ?? account.lastSubscribedAt);
  const startedAt = Number.isFinite(start) ? new Date(start).toISOString() : null;
  if (kind === 'pro' || kind === 'pro_max') {
    // Missing/malformed dates never confer paid access or invent a renewal base.
    if (kind === 'pro_max' && account.apiRequestLimit !== null) unavailable();
    if (!Number.isFinite(end)) unavailable();
    const expired = now.getTime() >= end;
    const activePro = !expired && account.subscription_status === 'active';
    if (!activePro) {
      const trial = trialState(account, now);
      return upgradeRequired(trial, { expired, expiresAt, startedAt,
        normalization: { ...FREE_ENTITLEMENT } });
    }
    return { plan: kind === 'pro_max' ? 'Pro Max' : 'Pro', level,
      limit: kind === 'pro_max' ? null : PRO_DAILY_REQUEST_LIMIT,
      status: 'active', activePro, expired, expiresAt, startedAt, normalization: null };
  }
  const limit = account.apiRequestLimit;
  if (!(Number.isSafeInteger(limit) && limit >= 0 || level === 2 && limit === null)) unavailable();
  return { plan: account.plan, level, limit: null,
    status: account.subscription_status || 'active', activePro: false,
    expired: Number.isFinite(end) && now.getTime() >= end, expiresAt, startedAt, normalization: null };
}
export function renewalPeriod(account, now, days = 30) {
  const entitlement = evaluateEntitlement(account, now);
  if (planKind(account.plan) === 'legacy_unlimited') unavailable('PLAN_UNAVAILABLE', 409);
  // Preserve paid time even if an older normalization retained its future date.
  const hasPriorEnd = account.subscriptionExpiresAt != null;
  const priorEnd = hasPriorEnd ? dateMillis(account.subscriptionExpiresAt) : NaN;
  if (hasPriorEnd && !Number.isFinite(priorEnd)) unavailable();
  const start = new Date(Math.max(now.getTime(), Number.isFinite(priorEnd) ? priorEnd : 0));
  const end = new Date(start);
  // The paid term is 30 UTC calendar days, independent of the host timezone.
  end.setUTCDate(end.getUTCDate() + days);
  return { start: start.toISOString(), end: end.toISOString() };
}
export async function normalizeExpiredAccount(db, uid, clock = () => new Date()) {
  return db.runTransaction(async tx => {
    const ref = db.collection('users').doc(uid);
    const account = (await tx.get(ref)).data();
    if (accountBlocked(account)) return false;
    const effective = evaluateEntitlement(account, clock());
    if (!effective.normalization) return false;
    tx.update(ref, effective.normalization);
    return true;
  });
}
