import { REQUEST_LIMIT_PLANS, newRequestContract,
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
const covers = (limit, previous) => limit === null || previous !== null && limit >= previous;

// Read-only resolution inside the caller's transaction. Queue persistence only
// after ALL reads, atomically with any profile normalization/checkout commit.
// A client profile field never supplies a request allowance. Existing private
// commitments are authoritative; overwritten paid plan fields are not history.
export async function resolveRequestContracts(tx, db, uid, account, { recoverHistorical = false, recordCompleteness = false } = {}) {
  const ref = db.collection('account_request_contracts').doc(uid);
  const stored = (await tx.get(ref)).data();
  for (const plan of REQUEST_LIMIT_PLANS) promisedRequestAllowance(stored, plan);
  const kind = paidPlan(account?.plan);
  const priorPaid = account?.subscriptionExpiresAt != null;
  if (account?.uid != null && account.uid !== uid) unavailable();
  const missing = ['pro', 'pro_max'].filter(plan => !stored?.plans?.[plan]);
  // Existing Enterprise/Unlimited tiers are outside paid Pro contract recovery.
  const normalized = ['free', 'starter'].includes(String(account?.plan).toLowerCase());
  if (!kind && !normalized) return { ref, contracts: stored, changed: false };
  if (!missing.length || !(kind && missing.includes(kind) || recoverHistorical && priorPaid)) {
    return { ref, contracts: stored, changed: false };
  }
  const accountEnd = instant(account?.subscriptionExpiresAt);
  const accountStart = instant(account?.subscriptionStartedAt ?? account?.lastSubscribedAt);
  const intactPromise = !!(kind && stored?.plans?.[kind]);
  const verifiedHistory = !!(stored?.plans?.pro || stored?.plans?.pro_max)
    && instant(stored?.historyVerifiedThrough) === accountEnd;
  if (!Number.isFinite(accountEnd) || (!(intactPromise || verifiedHistory)
    && (!Number.isFinite(accountStart) || accountStart >= accountEnd))) unavailable();

  // Bound recovery. No skipped/truncated history can silently remove a promise.
  const history = await tx.get(db.collection('payment_orders').where('userId', '==', uid).limit(101));
  if (history.docs.length > 100) unavailable();
  const evidence = { pro: [], pro_max: [] };
  // An intact private promise for the current paid tier already verifies that
  // tier. A normalized profile requires a receipt covering its retained end.
  let applicable = intactPromise || verifiedHistory;
  for (const doc of history.docs) {
    const order = doc.data();
    if (order.state !== 'processed') {
      // Unfulfilled checkout attempts are not purchases. A non-finalized record
      // claiming an entitlement/paid period needs reconciliation, not omission.
      if (order.entitlementGranted === true || order.subscriptionPeriodEnd != null) unavailable();
      continue;
    }
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
      || receipt.entitlementGranted !== true || receipt.plan !== order.plan || receipt.amount !== order.amount
      || receipt.currency !== order.currency) unavailable();
    const start = instant(receipt.subscriptionPeriodStart), end = instant(receipt.subscriptionPeriodEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 30 * 86400000 || end > accountEnd
      || order.subscriptionPeriodStart != null && instant(order.subscriptionPeriodStart) !== start
      || order.subscriptionPeriodEnd == null || instant(order.subscriptionPeriodEnd) !== end) unavailable();
    if (end === accountEnd && start >= accountStart && (!kind || kind === plan)) applicable = true;
    if (stored?.plans?.[plan]) continue; // Never replace an authoritative private promise.
    // The legacy storage envelope and today's policy do not establish terms.
    // Only the server-owned accepted order snapshot is used here. Records
    // without it require reconciliation; no historical policy is invented.
    if (order.requestAllowance === undefined) unavailable();
    if (receipt.requestAllowance !== undefined && (!validOrderRequestAllowance({ ...order, requestAllowance: receipt.requestAllowance })
      || receipt.requestAllowance.limit !== order.requestAllowance.limit
      || receipt.requestAllowance.policyVersion !== order.requestAllowance.policyVersion)) unavailable();
    evidence[plan].push({ start, end, orderId: order.id, limit: order.requestAllowance.limit });
  }
  if (!applicable) unavailable();
  const recovered = {};
  for (const plan of missing) {
    const purchases = evidence[plan].sort((a, b) => a.end - b.end || a.start - b.start);
    let previous;
    for (const purchase of purchases) {
      // A lower subsequent snapshot or conflicting overlapping periods cannot
      // silently cancel a protected promise. Distinct plans never share floors.
      if (previous && (!covers(purchase.limit, previous.limit)
        || purchase.start < previous.end && purchase.limit !== previous.limit)) unavailable();
      previous = purchase;
    }
    if (previous) recovered[plan] = { ...newRequestContract(previous.limit), origin: 'paid_order', orderId: previous.orderId };
  }
  if (kind && !stored?.plans?.[kind] && !recovered[kind]) unavailable();
  // Record completeness before a normalizer erases the current tier. This is
  // evidence of a bounded, complete scan and a verified applicable promise,
  // never an allowance or an assumption that an unscanned plan has no history.
  // Future resolutions still scan missing plans; the marker cannot bypass the
  // bound, receipt validation or new conflicting evidence.
  const historyVerifiedThrough = new Date(accountEnd).toISOString();
  const changed = Object.keys(recovered).length > 0 || recordCompleteness && stored?.historyVerifiedThrough !== historyVerifiedThrough;
  return { ref, contracts: changed ? { ...stored, version: 1, plans: { ...stored?.plans, ...recovered },
    ...(recordCompleteness ? { historyVerifiedThrough } : {}) } : stored, changed };
}

export function preserveRequestContracts(tx, resolved) {
  if (resolved.changed) tx.set(resolved.ref, resolved.contracts);
}
