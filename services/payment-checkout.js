import { createHash, randomUUID } from 'node:crypto';
import { checkoutPayload } from './paymongo-checkout.js';
import { PRO_PURCHASE, authenticatedPayment, refFor, modeKey, matchesPurchase, orderIdValid,
  requirePayment, requireCustomer, requirePurchasable } from './payment-contract.js';

// Provider retention is 24h. Stop at 23h to leave a clock/network safety margin.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 60000;
const BACKOFF_MS = 5000;
const keyFingerprint = key => createHash('sha256').update(key).digest('hex');
function requireReplayable(order, config, now) {
  requirePayment(order.idempotencyKey === `checkout-${order.mode}-${order.id}`
    && order.providerKeyFingerprint === keyFingerprint(config.secretKey)
    && typeof order.providerRequestBody === 'string'
    && Number.isFinite(Date.parse(order.createdAt)) && now.getTime() >= Date.parse(order.createdAt)
    && now.getTime() < Date.parse(order.createdAt) + RETRY_WINDOW_MS,
  'CHECKOUT_REVIEW', 'Checkout recovery requires support review. Do not pay again.');
}

export function createPaymentHandlers({ getDb, verifyIdToken, getConfig, createSession,
  clock = () => new Date(), newOrderId = randomUUID, report = () => {} }) {
  const authenticate = operation => authenticatedPayment({ getDb, verifyIdToken }, operation);
  const checkout = authenticate(async (req, res, uid, db) => {
    const body = req.body || {};
    requirePayment(body.plan === undefined || body.plan === PRO_PURCHASE.plan, 'UNSUPPORTED_PLAN', 'Only Pro is purchasable.', 400);
    for (const field of ['amount', 'currency', 'durationDays', 'apiRequestLimit']) {
      requirePayment(body[field] === undefined || body[field] === PRO_PURCHASE[field], 'PURCHASE_MISMATCH', 'Purchase terms are server-controlled.', 400);
    }
    const config = getConfig();
    const now = clock();
    const id = newOrderId();
    const attemptId = randomUUID();
    requirePayment(orderIdValid(id), 'ORDER_ID', 'Checkout unavailable.', 503);
    const lockRef = refFor(db, 'locks', uid);
    const attempt = await db.runTransaction(async tx => {
      const account = (await tx.get(db.collection('users').doc(uid))).data();
      requireCustomer(account, uid);
      requirePurchasable(account, now);
      const lock = (await tx.get(lockRef)).data();
      if (lock) {
        requirePayment(orderIdValid(lock.orderId), 'CHECKOUT_REVIEW', 'Existing checkout requires support review.');
        const previous = (await tx.get(refFor(db, 'orders', lock.orderId))).data();
        requirePayment(previous?.userId === uid && previous.mode === config.mode && matchesPurchase(previous),
          'CHECKOUT_REVIEW', 'Existing checkout requires support review.');
        if (previous.state === 'pending') {
          const binding = (await tx.get(refFor(db, 'sessions', modeKey(previous.mode, previous.sessionId)))).data();
          requirePayment(binding?.orderId === previous.id && binding.userId === uid, 'BINDING_CONFLICT');
          return { order: previous, existing: true };
        }
        if (['creating', 'retryable'].includes(previous.state)) {
          requireReplayable(previous, config, now);
          requirePayment(Number.isFinite(Date.parse(previous.retryAfter)) && now.getTime() >= Date.parse(previous.retryAfter),
            'CHECKOUT_IN_PROGRESS', 'Checkout is processing. Retry shortly without starting another payment.');
          const order = { ...previous, state: 'creating', attemptId, retryAfter: new Date(now.getTime() + LEASE_MS).toISOString() };
          tx.set(refFor(db, 'orders', previous.id), order);
          return { order, existing: false };
        }
        requirePayment(previous.state === 'processed', 'CHECKOUT_REVIEW', 'Checkout is processing or requires support review. Do not pay again.');
      }
      const orderRef = refFor(db, 'orders', id);
      requirePayment(!(await tx.get(orderRef)).exists, 'ORDER_COLLISION', 'Checkout unavailable.', 503);
      const order = { id, userId: uid, ...PRO_PURCHASE, mode: config.mode, createdAt: now.toISOString(), state: 'creating',
        idempotencyKey: `checkout-${config.mode}-${id}`, providerKeyFingerprint: keyFingerprint(config.secretKey),
        attemptId, retryAfter: new Date(now.getTime() + LEASE_MS).toISOString() };
      order.providerRequestBody = JSON.stringify(checkoutPayload(order, config.dashboardUrl));
      tx.set(orderRef, order);
      tx.set(lockRef, { orderId: id });
      return { order, existing: false };
    });
    let order = attempt.order;
    const activeOrderId = order.id;
    if (!attempt.existing) {
      let session;
      try {
        requireReplayable(order, config, clock());
        session = await createSession({ config, order });
        await db.runTransaction(async tx => {
          const orderRef = refFor(db, 'orders', activeOrderId);
          const sessionRef = refFor(db, 'sessions', modeKey(config.mode, session.sessionId));
          const saved = (await tx.get(orderRef)).data();
          const binding = await tx.get(sessionRef);
          const lock = (await tx.get(lockRef)).data();
          // A delayed worker must never overwrite a newer lease or fulfilled order.
          requirePayment(saved?.state === 'creating' && saved.attemptId === attemptId
            && saved.userId === uid && lock?.orderId === activeOrderId && !binding.exists, 'BINDING_CONFLICT');
          order = { ...saved, ...session, state: 'pending' };
          tx.set(orderRef, order);
          tx.set(sessionRef, { orderId: activeOrderId, userId: uid, mode: config.mode, sessionId: session.sessionId });
        });
      } catch (error) {
        // Same logical order, exact body/key and API-key scope on recovery.
        // Binding conflicts require review; outages/timeouts can replay safely.
        try {
          await db.runTransaction(async tx => {
            const orderRef = refFor(db, 'orders', activeOrderId);
            const saved = (await tx.get(orderRef)).data();
            if (saved?.state === 'creating' && saved.attemptId === attemptId) tx.update(orderRef, {
              state: ['BINDING_CONFLICT', 'CHECKOUT_REVIEW'].includes(error.code) ? 'review_required' : 'retryable',
              retryAfter: new Date(clock().getTime() + BACKOFF_MS).toISOString(),
              reviewReason: session ? 'orphan_binding_failed' : 'provider_result_uncertain',
              ...(session ? { orphanSessionId: session.sessionId } : {}) });
          });
        } catch { report({ code: 'ORPHAN_RECORD_UNAVAILABLE', orderId: activeOrderId }); }
        report({ code: session ? 'ORPHAN_BINDING_FAILED' : 'PROVIDER_RESULT_UNCERTAIN', orderId: activeOrderId,
          ...(session ? { sessionId: session.sessionId } : {}) });
        requirePayment(false, 'CHECKOUT_UNCONFIRMED', 'Checkout is not confirmed. Retry shortly to recover the same attempt; contact support if it remains unavailable.', 503);
      }
    }
    return res.json({ success: true, orderId: order.id, sessionId: order.sessionId,
      checkoutUrl: order.checkoutUrl, amount: order.amount, currency: order.currency });
  });

  const status = authenticate(async (req, res, uid, db) => {
    const orderId = req.query?.orderId;
    requirePayment(orderId === undefined || orderIdValid(orderId), 'INVALID_ORDER', 'Invalid order identifier.', 400);
    const now = clock();
    const result = await db.runTransaction(async tx => {
      const userRef = db.collection('users').doc(uid);
      const account = (await tx.get(userRef)).data();
      requireCustomer(account, uid);
      let paymentConfirmed = false;
      if (orderId !== undefined) {
        const order = (await tx.get(refFor(db, 'orders', orderId))).data();
        requirePayment(order?.userId === uid, 'ORDER_UNAVAILABLE', 'Order unavailable.', 404);
        paymentConfirmed = order.state === 'processed' && matchesPurchase(order)
          && account.plan === 'Pro' && account.subscription_status === 'active'
          && account.lastSubscribedAt === order.processedAt && account.subscriptionExpiresAt === order.subscriptionPeriodEnd;
      }
      const expiresAt = account.subscriptionExpiresAt;
      const expired = account.plan === 'Pro' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= now.getTime();
      // Existing status-endpoint downgrade is retained, not a new lifecycle.
      // A transaction prevents this old read/modify/write path racing fulfillment.
      if (expired) {
        tx.update(userRef, { plan: 'Free', apiRequestLimit: 50, subscription_status: 'inactive' });
        return { plan: 'Free', subscription_status: 'inactive', expired: true, expiredAt: expiresAt, paymentConfirmed: false };
      }
      return { plan: account.plan || 'Free', subscription_status: account.subscription_status || 'inactive',
        subscriptionExpiresAt: expiresAt || null, expired: false, paymentConfirmed,
        ...(account.plan === 'Pro' && Number.isFinite(Date.parse(expiresAt))
          ? { daysLeft: Math.ceil((Date.parse(expiresAt) - now.getTime()) / 86400000) } : {}) };
    });
    return res.json(result);
  });
  return { checkout, status };
}
