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
    if (value == null || value === '' || !(typeof value === 'string' || value instanceof Date || typeof value.toDate === 'function')) return NaN;
    return (typeof value.toDate === 'function' ? value.toDate() : new Date(value)).getTime();
  } catch { return NaN; }
}
function unavailable(code = 'ENTITLEMENT_UNAVAILABLE', status = 503) {
  throw Object.assign(new Error('Unable to verify account entitlement.'), { code, status });
}
export function evaluateEntitlement(account, now = new Date()) {
  if (accountBlocked(account)) unavailable('ACCOUNT_DISABLED', 403);
  if (!Number.isFinite(now.getTime())) unavailable();
  const name = typeof account.plan === 'string' ? account.plan.toLowerCase() : '';
  if (!Object.hasOwn(PLAN_LEVELS, name)) unavailable();
  const level = PLAN_LEVELS[name];
  const end = dateMillis(account.subscriptionExpiresAt);
  const expiresAt = Number.isFinite(end) ? new Date(end).toISOString() : null;
  const start = dateMillis(account.subscriptionStartedAt ?? account.lastSubscribedAt);
  const startedAt = Number.isFinite(start) ? new Date(start).toISOString() : null;
  if (level === 1) {
    // Missing/malformed dates never confer paid access or invent a renewal base.
    if (!Number.isFinite(end)) unavailable();
    const expired = now.getTime() >= end;
    const activePro = !expired && account.subscription_status === 'active';
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
  const priorEnd = dateMillis(account.subscriptionExpiresAt);
  const start = new Date(Math.max(now.getTime(), Number.isFinite(priorEnd) ? priorEnd : 0));
  const end = new Date(start);
  // Preserve the pre-Phase-2B2 runtime-local calendar/DST semantics. The actual
  // production runtime timezone remains a release input, not a new UTC policy.
  end.setDate(end.getDate() + days);
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
