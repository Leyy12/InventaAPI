// Owner-approved, closed pre-release demonstration cohort. This is local
// historical provenance, NOT external PayMongo corroboration or payment proof
// for a new purchase. No identity allowlist, mutable policy or database writes.
const COHORT_CUTOFF = Date.parse('2026-10-15T00:00:00.000Z');
const contexts = new WeakMap();
const unavailable = () => {
  throw Object.assign(new Error('Prior paid request terms require verified contract evidence.'),
    { code: 'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE', status: 503 });
};
const requireEvidence = condition => { if (!condition) unavailable(); };
const instant = value => {
  try {
    if (typeof value !== 'string') return NaN;
    const date = new Date(value);
    return date.toISOString() === value ? date.getTime() : NaN;
  } catch { return NaN; }
};
const historicalDocument = snapshot => {
  try {
    const created = snapshot.createTime.toDate().getTime();
    return Number.isFinite(created) && created < COHORT_CUTOFF;
  } catch { return false; }
};
const liveOnly = record => record?.mode === 'live'
  && (record.livemode === undefined || record.livemode === true)
  && (record.paymentMode === undefined || record.paymentMode === 'live')
  && (record.testMode === undefined || record.testMode === false)
  && (record.isTest === undefined || record.isTest === false)
  && (record.environment === undefined || ['production', 'live'].includes(record.environment));

export async function verifyLegacyProDemonstration(tx, db, uid, document) {
  const order = document.data();
  requireEvidence(historicalDocument(document) && order.state === 'processed' && order.id === document.id && order.userId === uid
    && liveOnly(order) && order.plan === 'Pro' && order.planId === 'pro'
    && order.billingProfile === 'global_live_test_v1' && order.amount === 500 && order.listAmount === 149900
    && order.currency === 'PHP' && order.durationDays === 30 && order.apiRequestLimit === 500
    && order.requestAllowance === undefined && order.entitlementGranted !== false
    && /^pay_[A-Za-z0-9]{1,128}$/u.test(order.paymentId || '')
    && /^cs_[A-Za-z0-9]{1,128}$/u.test(order.sessionId || '')
    && /^pi_[A-Za-z0-9]{1,128}$/u.test(order.paymentIntentId || '')
    && /^evt_[A-Za-z0-9]{1,128}$/u.test(order.webhookEventId || ''));
  const start = instant(order.subscriptionPeriodStart), end = instant(order.subscriptionPeriodEnd);
  const created = instant(order.createdAt), processed = instant(order.processedAt);
  requireEvidence(Number.isFinite(created) && created <= processed && processed === start && start < COHORT_CUTOFF
    && end - start === 30 * 86400000);
  let offer;
  try { offer = JSON.parse(order.providerRequestBody)?.data?.attributes; } catch { unavailable(); }
  const item = offer?.line_items?.[0];
  requireEvidence(offer?.reference_number === order.id && offer.metadata?.orderId === order.id
    && offer.metadata.plan === 'Pro' && (offer.metadata.planId ?? 'pro') === 'pro'
    && offer.show_description === true && offer.show_line_items === true
    && Array.isArray(offer.line_items) && offer.line_items.length === 1
    && item.name === 'InventaAPI Pro Plan' && item.description === '1 Month Subscription — 500 API requests/day'
    && item.amount === 500 && item.currency === 'PHP' && item.quantity === 1);
  const receiptDoc = await tx.get(db.collection('transactions').doc(`paymongo_live_${order.paymentId}`));
  const eventDoc = await tx.get(db.collection('payment_events').doc(`live_${order.webhookEventId}`));
  const sessionDoc = await tx.get(db.collection('payment_sessions').doc(`live_${order.sessionId}`));
  const receipt = receiptDoc.data(), event = eventDoc.data(), session = sessionDoc.data();
  const bound = record => liveOnly(record) && record.orderId === order.id && record.userId === uid
    && record.sessionId === order.sessionId;
  requireEvidence(historicalDocument(receiptDoc) && historicalDocument(eventDoc) && historicalDocument(sessionDoc)
    && bound(receipt) && receipt.paymentId === order.paymentId && receipt.status === 'paid'
    && receipt.entitlementGranted === true && receipt.plan === 'Pro' && receipt.amount === 500
    && receipt.currency === 'PHP' && receipt.webhookEventId === order.webhookEventId
    && receipt.requestAllowance === undefined && receipt.reviewReason === undefined
    && (receipt.paymentIntentId === undefined || receipt.paymentIntentId === order.paymentIntentId)
    && (receipt.paymongoPaymentIntentId === undefined || receipt.paymongoPaymentIntentId === order.paymentIntentId)
    && (receipt.paymongoCheckoutSessionId === undefined || receipt.paymongoCheckoutSessionId === order.sessionId)
    && (receipt.paymongoReferenceId === undefined || receipt.paymongoReferenceId === order.paymentId)
    && instant(receipt.createdAt) === processed && instant(receipt.subscriptionPeriodStart) === start
    && instant(receipt.subscriptionPeriodEnd) === end
    && bound(event) && event.paymentId === order.paymentId && event.reviewRequired !== true
    && instant(event.processedAt) === processed && bound(session) && session.supersededBy === undefined
    && (session.state === undefined || session.state === 'processed'));
  return { uid, start, end };
}

export async function readLegacyProCompatibility(tx, db, uid, account, history) {
  requireEvidence(account?.uid === uid && account.role === 'Developer' && account.plan === 'Pro'
    && account.apiRequestLimit === 500 && account.subscription_status === 'active');
  const paid = history.docs.filter(doc => doc.data().state === 'processed');
  requireEvidence(paid.length === 1 && history.docs.every(doc => doc.data().state === 'processed'
    || doc.data().entitlementGranted !== true && doc.data().subscriptionPeriodEnd == null));
  const context = await verifyLegacyProDemonstration(tx, db, uid, paid[0]);
  requireEvidence(instant(account.subscriptionStartedAt) === context.start
    && instant(account.lastSubscribedAt) === context.start && instant(account.subscriptionExpiresAt) === context.end);
  // Opaque, process-local evidence. It has NO saved Pro promise, so a future
  // accepted purchase cannot inherit this period's grandfathering as a floor.
  const contracts = Object.freeze({ version: 1, plans: Object.freeze({}) });
  contexts.set(contracts, context);
  return contracts;
}

export const hasLegacyProCompatibility = contracts => contexts.has(contracts);
export function legacyProRequestLimit(contracts, account, now) {
  const context = contexts.get(contracts);
  if (!context) return undefined;
  requireEvidence(account.uid === context.uid && account.role === 'Developer' && account.plan === 'Pro' && account.apiRequestLimit === 500
    && account.subscription_status === 'active' && instant(account.subscriptionStartedAt) === context.start
    && instant(account.lastSubscribedAt) === context.start && instant(account.subscriptionExpiresAt) === context.end
    && now.getTime() >= context.start && now.getTime() < context.end);
  return 500;
}
