import { createHmac, timingSafeEqual } from 'node:crypto';
import { accountBlocked, dateMillis, renewalPeriod } from '../functions/subscription-lifecycle.mjs';
import { PRO_PURCHASE, providerId, orderIdValid, refFor, modeKey, matchesPurchase,
  requirePayment, paymentError, requireCustomer, requirePurchasable } from './payment-contract.js';

// Existing five-minute policy retained. PayMongo recommends a freshness check,
// but does not mandate this particular tolerance in its current documentation.
export const SIGNATURE_TOLERANCE_MS = 300000;
export function verifyPaymentSignature(rawBody, header, config, now) {
  if (!(typeof rawBody === 'string' || Buffer.isBuffer(rawBody)) || !rawBody.length || typeof header !== 'string') return false;
  const parts = {};
  for (const part of header.split(',')) {
    const match = /^(t|te|li)=([^,]*)$/u.exec(part.trim());
    if (!match || Object.hasOwn(parts, match[1])) return false;
    parts[match[1]] = match[2];
  }
  const signature = parts[config.mode === 'live' ? 'li' : 'te'];
  if (!/^\d{1,12}$/u.test(parts.t || '') || !/^[a-f0-9]{64}$/iu.test(signature || '')
    || !Number.isFinite(now.getTime()) || Math.abs(now.getTime() - Number(parts.t) * 1000) > SIGNATURE_TOLERANCE_MS) return false;
  const expected = createHmac('sha256', config.webhookSecret).update(`${parts.t}.`).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function paymentFromEvent(event, mode) {
  const root = event?.data;
  requirePayment(root?.type === 'event' && providerId(root.id, 'evt'), 'INVALID_EVENT', undefined, 400);
  const eventAttrs = root.attributes;
  requirePayment(eventAttrs?.livemode === (mode === 'live'), 'MODE_MISMATCH');
  // Generic payment.paid does not prove this checkout's session binding.
  requirePayment(eventAttrs.type !== 'payment.paid', 'UNBOUND_PAYMENT_EVENT');
  if (eventAttrs.type !== 'checkout_session.payment.paid') return null;
  const session = eventAttrs.data;
  const attrs = session?.attributes;
  requirePayment(session?.type === 'checkout_session' && providerId(session.id, 'cs'), 'INVALID_SESSION');
  requirePayment(attrs?.status === 'active' && attrs.livemode === (mode === 'live'), 'INVALID_SESSION_STATE');
  requirePayment(Array.isArray(attrs.payments), 'MISSING_PAYMENTS');
  const paid = attrs.payments.filter(payment => payment?.attributes?.status === 'paid');
  requirePayment(paid.length === 1, 'AMBIGUOUS_PAYMENT');
  const payment = paid[0];
  const paymentAttrs = payment.attributes;
  const intent = attrs.payment_intent;
  requirePayment(payment.type === 'payment' && providerId(payment.id, 'pay') && providerId(intent?.id, 'pi')
    && intent.type === 'payment_intent' && paymentAttrs.payment_intent_id === intent.id, 'INVALID_PAYMENT_ID');
  requirePayment(paymentAttrs.livemode === (mode === 'live') && intent.attributes?.livemode === (mode === 'live'), 'MODE_MISMATCH');
  requirePayment(intent.attributes.status === 'succeeded' && paymentAttrs.source?.type === 'gcash'
    && paymentAttrs.disputed !== true && (paymentAttrs.refunds === undefined
      || (Array.isArray(paymentAttrs.refunds) && paymentAttrs.refunds.length === 0)), 'INVALID_PAYMENT_STATE');
  for (const source of [paymentAttrs, intent.attributes]) {
    requirePayment(source.amount === PRO_PURCHASE.amount && source.currency === PRO_PURCHASE.currency, 'PURCHASE_MISMATCH');
  }
  requirePayment(Array.isArray(attrs.line_items) && attrs.line_items.length === 1
    && attrs.line_items[0]?.amount === PRO_PURCHASE.amount && attrs.line_items[0]?.currency === PRO_PURCHASE.currency
    && attrs.line_items[0]?.quantity === 1, 'PURCHASE_MISMATCH');
  return { eventId: root.id, sessionId: session.id, paymentId: payment.id, paymentIntentId: intent.id,
    mode, amount: paymentAttrs.amount, currency: paymentAttrs.currency };
}

export async function fulfillPayment(db, payment, time) {
  return db.runTransaction(async tx => {
    const now = typeof time === 'function' ? time() : time;
    const binding = (await tx.get(refFor(db, 'sessions', modeKey(payment.mode, payment.sessionId)))).data();
    requirePayment(binding && orderIdValid(binding.orderId), 'UNBOUND_SESSION');
    const orderRef = refFor(db, 'orders', binding.orderId);
    const order = (await tx.get(orderRef)).data();
    requirePayment(order && order.id === binding.orderId && order.userId === binding.userId
      && binding.sessionId === payment.sessionId && binding.mode === payment.mode
      && order.sessionId === payment.sessionId && order.paymentIntentId === payment.paymentIntentId
      && order.mode === payment.mode && matchesPurchase(order), 'ORDER_MISMATCH');
    requirePayment(['pending', 'processed', 'review_required'].includes(order.state), 'INVALID_ORDER_STATE');
    const eventRef = refFor(db, 'events', modeKey(payment.mode, payment.eventId));
    const paymentRef = refFor(db, 'payments', `paymongo_${modeKey(payment.mode, payment.paymentId)}`);
    const eventRecord = (await tx.get(eventRef)).data();
    const paymentRecord = (await tx.get(paymentRef)).data();
    const same = record => record?.orderId === order.id && record.userId === order.userId
      && record.paymentId === payment.paymentId && record.sessionId === payment.sessionId && record.mode === payment.mode;
    const evidence = { orderId: order.id, userId: order.userId, paymentId: payment.paymentId,
      sessionId: payment.sessionId, mode: payment.mode };
    if (eventRecord || paymentRecord || order.state === 'processed') {
      requirePayment((!eventRecord || same(eventRecord)) && same(paymentRecord)
        && paymentRecord.status === 'paid' && (order.state === 'processed'
          || order.state === 'review_required' && paymentRecord.entitlementGranted === false) && order.paymentId === payment.paymentId,
      'PAYMENT_ALREADY_CONSUMED');
      if (!eventRecord) tx.set(eventRef, { ...evidence, processedAt: order.processedAt });
      return { duplicate: true, ...(paymentRecord.entitlementGranted === false ? { reviewRequired: true } : {}) };
    }
    // Read failures never fall back to processing; no metadata/email ownership.
    requirePayment(order.state === 'pending', 'INVALID_ORDER_STATE');
    const userRef = db.collection('users').doc(order.userId);
    const account = (await tx.get(userRef)).data();
    // A verified charge racing deletion is retained once for operator resolution.
    if (account && accountBlocked(account)) {
      const processedAt = now.toISOString();
      tx.set(paymentRef, { ...evidence, status: 'paid', amount: order.amount, currency: order.currency,
        entitlementGranted: false, reviewReason: 'account_disabled', createdAt: processedAt });
      tx.set(eventRef, { ...evidence, processedAt, reviewRequired: true });
      tx.update(orderRef, { state: 'review_required', paymentId: payment.paymentId, processedAt,
        reviewReason: 'account_disabled', entitlementGranted: false });
      return { duplicate: false, reviewRequired: true };
    }
    requireCustomer(account, order.userId);
    requirePurchasable(account, now);
    const processedAt = now.toISOString();
    const { start, end: expiresAt } = renewalPeriod(account, now, order.durationDays);
    tx.set(paymentRef, { ...evidence, userEmail: typeof account.email === 'string' ? account.email : '',
      amount: order.amount, currency: order.currency,
      paymentMethod: 'gcash', paymongoReferenceId: payment.paymentId,
      paymongoPaymentIntentId: payment.paymentIntentId, paymongoCheckoutSessionId: payment.sessionId,
      plan: order.plan, subscriptionPeriodStart: start, subscriptionPeriodEnd: expiresAt,
      status: 'paid', entitlementGranted: true, createdAt: processedAt, webhookEventId: payment.eventId });
    tx.set(eventRef, { ...evidence, processedAt });
    tx.update(orderRef, { state: 'processed', paymentId: payment.paymentId, webhookEventId: payment.eventId,
      processedAt, subscriptionPeriodStart: start, subscriptionPeriodEnd: expiresAt });
    tx.update(userRef, { plan: order.plan, apiRequestLimit: order.apiRequestLimit, subscription_status: 'active',
      subscriptionExpiresAt: expiresAt, lastSubscribedAt: processedAt,
      subscriptionStartedAt: dateMillis(account.subscriptionExpiresAt) > now.getTime()
        ? (account.subscriptionStartedAt || account.lastSubscribedAt || processedAt) : processedAt });
    return { duplicate: false };
  });
}

export function createPaymentWebhook({ getDb, getConfig, clock = () => new Date(), report = () => {} }) {
  return async (req, res) => {
    let verifiedPayment;
    try {
      const config = getConfig();
      const now = clock();
      requirePayment(verifyPaymentSignature(req.rawBody, req.headers['paymongo-signature'], config, now),
        'INVALID_SIGNATURE', 'Invalid webhook signature.', 403);
      let event;
      try { event = JSON.parse(req.rawBody.toString()); } catch { requirePayment(false, 'INVALID_EVENT', 'Invalid event body.', 400); }
      const payment = paymentFromEvent(event, config.mode);
      verifiedPayment = payment;
      if (!payment) return res.json({ received: true, processed: false, ignored: true,
        ...(['payment.failed', 'checkout_session.payment.failed'].includes(event.data.attributes.type) ? { reason: 'failed' } : {}) });
      const result = await fulfillPayment(getDb(), payment, clock);
      if (result.reviewRequired) report({ code: 'PAYMENT_ACCOUNT_DISABLED', orderPaymentId: payment.paymentId, eventId: payment.eventId });
      // Acknowledge fulfillment only after its durable atomic commit.
      return res.json({ received: true, processed: !result.duplicate && !result.reviewRequired, ...result,
        ...(result.duplicate ? { reason: 'duplicate' } : {}) });
    } catch (error) {
      report({ code: error.code || 'PAYMENT_UNAVAILABLE', ...(verifiedPayment ? {
        eventId: verifiedPayment.eventId, sessionId: verifiedPayment.sessionId, paymentId: verifiedPayment.paymentId,
      } : {}) });
      return paymentError(res, error);
    }
  };
}
