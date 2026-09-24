// Shared by Express and the existing deployable Functions package. No SDK/I/O.
export const PLAN_LEVELS = Object.freeze({ free: 0, starter: 0, pro: 1, professional: 1, enterprise: 2, unlimited: 2 });
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
export const TRIAL_LIMIT = 500;
function upgradeRequired(trial, { expired = trial.expired, expiresAt = trial.expiresAt,
  startedAt = trial.startedAt, normalization = null } = {}) {
  return { plan: 'Upgrade Required', level: -1, limit: 0, status: 'upgrade_required',
    upgradeRequired: true, activePro: false, activeTrial: false, expired, expiresAt, startedAt, normalization };
}
export function trialState(account, now = new Date()) {
  const fields = ['hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt', 'trialExpiredAt', 'trialExhaustedAt'];
  if (!fields.some(field => Object.hasOwn(account || {}, field))) return { used: false, active: false, expired: false, startedAt: null, expiresAt: null };
  const start = dateMillis(account.trialStartedAt), end = dateMillis(account.trialExpiresAt);
  if (account.trialVersion !== 1 || account.hasUsedFreeTrial !== true || !Number.isFinite(now.getTime())
    || !Number.isFinite(start) || !Number.isFinite(end) || end - start !== 7 * 86400000 || start > now.getTime()) unavailable('TRIAL_UNAVAILABLE');
  const eligiblePlan = ['free', 'starter'].includes(String(account.plan).toLowerCase());
  const exhausted = Object.hasOwn(account, 'trialExhaustedAt');
  const exhaustedAt = dateMillis(account.trialExhaustedAt);
  if (exhausted && (!Number.isFinite(exhaustedAt) || exhaustedAt < start || exhaustedAt >= end || exhaustedAt > now.getTime())) unavailable('TRIAL_UNAVAILABLE');
  return { used: true, active: eligiblePlan && !exhausted && now.getTime() < end, exhausted, expired: now.getTime() >= end,
    startedAt: new Date(start).toISOString(), expiresAt: new Date(end).toISOString() };
}
export function evaluateEntitlement(account, now = new Date()) {
  if (accountBlocked(account)) unavailable('ACCOUNT_DISABLED', 403);
  if (!Number.isFinite(now.getTime())) unavailable();
  const name = typeof account.plan === 'string' ? account.plan.toLowerCase() : '';
  if (!Object.hasOwn(PLAN_LEVELS, name)) unavailable();
  const level = PLAN_LEVELS[name];
  if (level === 0) {
    const trial = trialState(account, now);
    if (trial.active) return { plan: 'Pro Trial', level: 1, limit: TRIAL_LIMIT, status: 'trial', activePro: false,
      activeTrial: true, expired: false, expiresAt: trial.expiresAt, startedAt: trial.startedAt, normalization: null };
    if (trial.used) return upgradeRequired(trial);
  }
  const end = dateMillis(account.subscriptionExpiresAt);
  const expiresAt = Number.isFinite(end) ? new Date(end).toISOString() : null;
  const start = dateMillis(account.subscriptionStartedAt ?? account.lastSubscribedAt);
  const startedAt = Number.isFinite(start) ? new Date(start).toISOString() : null;
  if (level === 1) {
    // Missing/malformed dates never confer paid access or invent a renewal base.
    if (!Number.isFinite(end)) unavailable();
    const expired = now.getTime() >= end;
    const activePro = !expired && account.subscription_status === 'active';
    if (!activePro) {
      const trial = trialState(account, now);
      if (trial.used) return upgradeRequired(trial, { expired, expiresAt, startedAt,
        normalization: { ...FREE_ENTITLEMENT } });
    }
    return { plan: activePro ? 'Pro' : 'Free', level: activePro ? 1 : 0, limit: activePro ? 5000 : 50,
      status: activePro ? 'active' : 'inactive', activePro, expired, expiresAt, startedAt,
      normalization: !activePro ? { ...FREE_ENTITLEMENT } : null };
  }
  const limit = account.apiRequestLimit;
  if (!(Number.isSafeInteger(limit) && limit >= 0 || level === 2 && limit === null)) unavailable();
  // Preserve explicit lower server caps, but a stale Free snapshot cannot exceed 50.
  return { plan: level === 0 ? 'Free' : account.plan, level, limit: level === 2 ? null : Math.min(limit, 50),
    status: level === 0 ? 'inactive' : (account.subscription_status || 'active'), activePro: false,
    expired: Number.isFinite(end) && now.getTime() >= end, expiresAt, startedAt, normalization: null };
}
export function renewalPeriod(account, now, days = 30) {
  const entitlement = evaluateEntitlement(account, now);
  if (entitlement.level === 2) unavailable('PLAN_UNAVAILABLE', 409);
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
