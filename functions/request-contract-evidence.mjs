import { DEFAULT_REQUEST_LIMITS, REQUEST_LIMIT_PLANS, newRequestContract,
  promisedRequestAllowance, validOrderRequestAllowance } from './request-limit-policy.mjs';

const paidPlan = name => String(name).toLowerCase() === 'pro max' ? 'pro_max'
  : ['pro', 'professional'].includes(String(name).toLowerCase()) ? 'pro' : null;
const instant = value => {
  try {
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const parts = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/iu.exec(value);
    if (!parts || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) return NaN;
    const calendar = new Date(0); calendar.setUTCFullYear(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    return calendar.getUTCFullYear() === Number(parts[1]) && calendar.getUTCMonth() === Number(parts[2]) - 1
      && calendar.getUTCDate() === Number(parts[3]) ? Date.parse(value) : NaN;
  } catch { return NaN; }
};
const unavailable = () => {
  throw Object.assign(new Error('Prior paid request terms require verified contract evidence.'),
    { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE', status: 503 });
};
const mergePromise = (plans, plan, limit, origin, orderId) => {
  const previous = plans[plan];
  const promised = previous ? previous.limit === null || limit === null ? null : Math.max(previous.limit, limit) : limit;
  plans[plan] = { ...newRequestContract(promised), origin, ...(orderId ? { orderId } : {}) };
};

// Read-only resolution inside the caller's transaction. Queue persistence only
// after ALL reads, atomically with any profile normalization/checkout commit.
// A client profile field never supplies a request allowance. Existing private
// commitments are authoritative; overwritten paid plan fields are not history.
export async function resolveRequestContracts(tx, db, uid, account, { incomingOrder, recoverHistorical = false } = {}) {
  const ref = db.collection('account_request_contracts').doc(uid);
  const stored = (await tx.get(ref)).data();
  for (const plan of REQUEST_LIMIT_PLANS) promisedRequestAllowance(stored, plan);
  const kind = paidPlan(account?.plan);
  const priorPaid = account?.subscriptionExpiresAt != null;
  const hasPaidPromise = !!(stored?.plans?.pro || stored?.plans?.pro_max);
  if (kind ? stored?.plans?.[kind] : !recoverHistorical || !priorPaid || hasPaidPromise) return { ref, contracts: stored, changed: false };
  if (!Number.isFinite(instant(account?.subscriptionExpiresAt))) unavailable();

  // Bound recovery. No skipped/truncated history can silently remove a promise.
  const history = await tx.get(db.collection('payment_orders').where('userId', '==', uid).limit(101));
  if (history.docs.length > 100) unavailable();
  const recovered = {};
  for (const doc of history.docs) {
    const order = doc.data();
    if (order.state !== 'processed') continue;
    const plan = paidPlan(order.plan);
    // Accepted historical settlement shapes, matching the locked payment
    // contract. Recovery cannot treat an arbitrary amount as paid plan evidence.
    const listAmount = plan === 'pro_max' ? 499900 : 149900;
    const validSettlement = order.billingProfile === undefined && order.listAmount === undefined && order.amount === listAmount
      || order.billingProfile === 'global_live_test_v1' && order.mode === 'live' && order.listAmount === listAmount && order.amount === 500;
    if (!plan || order.id !== doc.id || order.userId !== uid || !['test', 'live'].includes(order.mode)
      || order.plan !== (plan === 'pro_max' ? 'Pro Max' : 'Pro') || order.entitlementGranted === false || !validSettlement
      || (order.planId !== plan && !(plan === 'pro' && order.planId === undefined))
      || order.durationDays !== 30 || order.currency !== 'PHP' || !Number.isSafeInteger(order.amount) || order.amount <= 0
      || !(plan === 'pro_max' ? order.apiRequestLimit === null : [500, 5000].includes(order.apiRequestLimit))
      || !validOrderRequestAllowance(order) || !/^pay_[A-Za-z0-9]{1,128}$/u.test(order.paymentId || '')
      || !/^cs_[A-Za-z0-9]{1,128}$/u.test(order.sessionId || '')) unavailable();
    const receipt = (await tx.get(db.collection('transactions').doc(`paymongo_${order.mode}_${order.paymentId}`))).data();
    if (!receipt || receipt.orderId !== order.id || receipt.userId !== uid || receipt.mode !== order.mode
      || receipt.paymentId !== order.paymentId || receipt.sessionId !== order.sessionId || receipt.status !== 'paid'
      || receipt.entitlementGranted === false || receipt.plan !== order.plan || receipt.amount !== order.amount
      || receipt.currency !== order.currency || !Number.isFinite(instant(receipt.subscriptionPeriodEnd))
      || order.subscriptionPeriodEnd != null && instant(order.subscriptionPeriodEnd) !== instant(receipt.subscriptionPeriodEnd)) unavailable();
    mergePromise(recovered, plan, order.requestAllowance === undefined ? DEFAULT_REQUEST_LIMITS[plan] : order.requestAllowance.limit,
      'paid_order', order.id);
  }
  if (kind && !recovered[kind]) {
    // Capture the still-intact, server-controlled legacy entitlement BEFORE
    // losing its tier. This fallback is NEVER used for a normalized Free profile.
    if (kind === 'pro_max' && account.apiRequestLimit !== null
      || !['active', 'inactive'].includes(account.subscription_status)) unavailable();
    mergePromise(recovered, kind, DEFAULT_REQUEST_LIMITS[kind], 'legacy_entitlement');
  }
  if (!Object.keys(recovered).length) {
    // A verified incoming Unlimited purchase is itself an adequate promise and
    // cannot reduce unknown prior terms. Finite incoming terms cannot repair
    // missing historical evidence for an already-normalized paid account.
    const plan = paidPlan(incomingOrder?.plan);
    if (plan && validOrderRequestAllowance(incomingOrder)
      && (incomingOrder.requestAllowance?.limit === null || incomingOrder.requestAllowance === undefined && plan === 'pro_max')) {
      mergePromise(recovered, plan, null, 'paid_order', incomingOrder.id);
    } else unavailable();
  }
  return { ref, contracts: { version: 1, plans: { ...recovered, ...stored?.plans } }, changed: true };
}

export function preserveRequestContracts(tx, resolved) {
  if (resolved.changed) tx.set(resolved.ref, resolved.contracts);
}
