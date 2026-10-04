import { createHash, randomUUID } from 'node:crypto';
import { checkoutPayload, samePaymentMethods, savedPaymentMethods } from './paymongo-checkout.js';
import { evaluateEntitlement, planKind } from '../functions/subscription-lifecycle.mjs';
import { purchaseForIntent, authenticatedPayment, refFor, modeKey, matchesPurchase, orderIdValid,
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

export function createPaymentHandlers({ getDb, verifyIdToken, getConfig, createSession, expireSession,
  clock = () => new Date(), newOrderId = randomUUID, report = () => {} }) {
  const authenticate = operation => authenticatedPayment({ getDb, verifyIdToken }, operation);
  const checkout = authenticate(async (req, res, uid, db) => {
    const body = req.body || {};
    const purchase = purchaseForIntent(body.plan === undefined ? 'pro' : body.plan);
    requirePayment(purchase, 'UNSUPPORTED_PLAN', 'Unsupported purchase plan.', 400);
    requirePayment(!['planId', 'purchaseId', 'planName', 'discount', 'discountAmount'].some(field => Object.hasOwn(body, field)),
      'PURCHASE_MISMATCH', 'Purchase terms are server-controlled.', 400);
    for (const field of ['amount', 'currency', 'durationDays', 'apiRequestLimit']) {
      requirePayment(body[field] === undefined || body[field] === purchase[field], 'PURCHASE_MISMATCH', 'Purchase terms are server-controlled.', 400);
    }
    const config = getConfig();
    const id = newOrderId();
    const attemptId = randomUUID();
    requirePayment(orderIdValid(id), 'ORDER_ID', 'Checkout unavailable.', 503);
    const lockRef = refFor(db, 'locks', uid);
    const desiredMethods = checkoutPayload({ id, ...purchase }, config.dashboardUrl).data.attributes.payment_method_types;
    const makeOrder = (orderId, now) => {
      const order = { id: orderId, userId: uid, ...purchase, mode: config.mode, createdAt: now.toISOString(), state: 'creating',
        idempotencyKey: `checkout-${config.mode}-${orderId}`, providerKeyFingerprint: keyFingerprint(config.secretKey),
        attemptId, retryAfter: new Date(now.getTime() + LEASE_MS).toISOString() };
      order.providerRequestBody = JSON.stringify(checkoutPayload(order, config.dashboardUrl));
      return order;
    };
    let attempt = await db.runTransaction(async tx => {
      const now = clock();
      const account = (await tx.get(db.collection('users').doc(uid))).data();
      requireCustomer(account, uid);
      requirePurchasable(account, now, purchase);
      const lock = (await tx.get(lockRef)).data();
      if (lock) {
        requirePayment(orderIdValid(lock.orderId), 'CHECKOUT_REVIEW', 'Existing checkout requires support review.');
        const previous = (await tx.get(refFor(db, 'orders', lock.orderId))).data();
        // Completed orders are immutable history. Validate their owner, mode and
        // canonical terms, but require current mode/plan equality only for recovery.
        requirePayment(previous?.id === lock.orderId && previous.userId === uid && ['test', 'live'].includes(previous.mode) && matchesPurchase(previous)
          && (previous.state === 'processed' || previous.mode === config.mode
            && (previous.planId ?? 'pro') === purchase.planId),
          'CHECKOUT_REVIEW', 'Existing checkout requires support review.');
        if (previous.state === 'pending') {
          const binding = (await tx.get(refFor(db, 'sessions', modeKey(previous.mode, previous.sessionId)))).data();
          requirePayment(binding?.orderId === previous.id && binding.userId === uid
            && binding.sessionId === previous.sessionId && binding.mode === previous.mode
            && binding.state !== 'superseded' && !binding.supersededBy
            && (lock.sessionId === undefined || lock.sessionId === previous.sessionId)
            && (lock.mode === undefined || lock.mode === previous.mode), 'BINDING_CONFLICT');
          const methods = savedPaymentMethods(previous);
          requirePayment(Array.isArray(methods) && methods.length > 0 && new Set(methods).size === methods.length
            && methods.every(method => ['gcash', 'qrph'].includes(method)), 'CHECKOUT_REVIEW');
          if (samePaymentMethods(methods, desiredMethods) && previous.providerStatus !== 'expired'
            && binding.providerStatus !== 'expired' && binding.state !== 'expired') return { order: previous, existing: true };
          requirePayment(!previous.paymentId && typeof expireSession === 'function', 'CHECKOUT_REVIEW');
          requirePayment(!(await tx.get(refFor(db, 'orders', id))).exists, 'ORDER_COLLISION');
          const retiring = { ...previous, state: 'expiring', replacementOrderId: id,
            attemptId, retryAfter: new Date(now.getTime() + LEASE_MS).toISOString() };
          tx.set(refFor(db, 'orders', previous.id), retiring);
          return { order: retiring, replace: true };
        }
        if (previous.state === 'expiring') {
          requirePayment(orderIdValid(previous.replacementOrderId) && typeof expireSession === 'function', 'CHECKOUT_REVIEW');
          const binding = (await tx.get(refFor(db, 'sessions', modeKey(previous.mode, previous.sessionId)))).data();
          requirePayment(!previous.paymentId && binding?.orderId === previous.id && binding.userId === uid
            && binding.sessionId === previous.sessionId && binding.mode === previous.mode && !binding.supersededBy
            && (lock.sessionId === undefined || lock.sessionId === previous.sessionId)
            && (lock.mode === undefined || lock.mode === previous.mode), 'CHECKOUT_REVIEW');
          requirePayment(Number.isFinite(Date.parse(previous.retryAfter)) && now.getTime() >= Date.parse(previous.retryAfter),
            'CHECKOUT_IN_PROGRESS', 'Checkout replacement is processing. Retry shortly.');
          const retiring = { ...previous, attemptId, retryAfter: new Date(now.getTime() + LEASE_MS).toISOString() };
          tx.set(refFor(db, 'orders', previous.id), retiring);
          return { order: retiring, replace: true };
        }
        if (['creating', 'retryable'].includes(previous.state)) {
          requirePayment(samePaymentMethods(savedPaymentMethods(previous), desiredMethods), 'CHECKOUT_REVIEW');
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
      const order = makeOrder(id, now);
      tx.set(orderRef, order);
      tx.set(lockRef, { orderId: id });
      return { order, existing: false };
    });
    if (attempt.replace) {
      const old = attempt.order;
      try {
        const proof = await expireSession({ config, order: old });
        requirePayment(proof?.sessionId === old.sessionId && proof.status === 'expired' && proof.unpaid === true, 'CHECKOUT_REVIEW');
        attempt = await db.runTransaction(async tx => {
          const now = clock();
          const oldRef = refFor(db, 'orders', old.id);
          const oldBindingRef = refFor(db, 'sessions', modeKey(old.mode, old.sessionId));
          const nextRef = refFor(db, 'orders', old.replacementOrderId);
          const account = (await tx.get(db.collection('users').doc(uid))).data();
          const saved = (await tx.get(oldRef)).data();
          const binding = (await tx.get(oldBindingRef)).data();
          const lock = (await tx.get(lockRef)).data();
          const next = await tx.get(nextRef);
          requireCustomer(account, uid); requirePurchasable(account, now, purchase);
          requirePayment(saved?.state === 'expiring' && saved.attemptId === attemptId && !saved.paymentId
            && saved.id === old.id && saved.userId === uid && saved.mode === config.mode && matchesPurchase(saved)
            && (saved.planId ?? 'pro') === purchase.planId
            && saved.sessionId === old.sessionId && saved.replacementOrderId === old.replacementOrderId
            && lock?.orderId === old.id && (lock.sessionId === undefined || lock.sessionId === old.sessionId)
            && (lock.mode === undefined || lock.mode === old.mode)
            && binding?.orderId === old.id && binding.userId === uid && binding.sessionId === old.sessionId
            && binding.mode === old.mode && !next.exists, 'CHECKOUT_REVIEW');
          const order = makeOrder(old.replacementOrderId, now);
          tx.update(oldRef, { state: 'superseded', providerStatus: 'expired', supersededBy: order.id, supersededAt: now.toISOString() });
          tx.update(oldBindingRef, { state: 'superseded', providerStatus: 'expired', supersededBy: order.id });
          tx.set(nextRef, order);
          tx.set(lockRef, { orderId: order.id });
          return { order, existing: false };
        });
      } catch (error) {
        // Retain the durable retirement intent. Next attempt must re-read provider
        // state; never assume a timeout means expiration or no payment occurred.
        await db.runTransaction(async tx => {
          const ref = refFor(db, 'orders', old.id);
          const saved = (await tx.get(ref)).data();
          if (saved?.state === 'expiring' && saved.attemptId === attemptId) {
            tx.update(ref, { retryAfter: new Date(clock().getTime() + BACKOFF_MS).toISOString() });
          }
        });
        report({ code: 'CHECKOUT_REPLACEMENT_REVIEW', orderId: old.id, sessionId: old.sessionId });
        requirePayment(false, 'CHECKOUT_REVIEW', 'Existing checkout must be safely closed or reconciled before replacement.', 503);
      }
    }
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
          tx.update(lockRef, { sessionId: session.sessionId, mode: config.mode });
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
    const result = await db.runTransaction(async tx => {
      const now = clock();
      const userRef = db.collection('users').doc(uid);
      const account = (await tx.get(userRef)).data();
      requireCustomer(account, uid);
      const effective = evaluateEntitlement(account, now);
      let paymentConfirmed = false;
      if (orderId !== undefined) {
        const order = (await tx.get(refFor(db, 'orders', orderId))).data();
        requirePayment(order?.userId === uid, 'ORDER_UNAVAILABLE', 'Order unavailable.', 404);
        const receipt = order.paymentId ? (await tx.get(refFor(db, 'payments', `paymongo_${modeKey(order.mode, order.paymentId)}`))).data() : null;
        // Later renewals do not make an earlier receipt appear unpaid.
        paymentConfirmed = order.state === 'processed' && matchesPurchase(order)
          && receipt?.orderId === order.id && receipt.userId === uid && receipt.status === 'paid'
          && receipt.entitlementGranted !== false;
      }
      // Read-only projection. Quota/management and optional scheduler normalize.
      return { plan: effective.plan, subscription_status: effective.status, activePro: effective.activePro,
        activeTrial: effective.activeTrial === true,
        apiRequestLimit: effective.limit, subscriptionStartedAt: effective.startedAt,
        subscriptionExpiresAt: effective.expiresAt, lastSubscribedAt: account.lastSubscribedAt || null,
        expired: effective.expired, ...(effective.expired ? { expiredAt: effective.expiresAt } : {}), paymentConfirmed,
        canPurchasePro: effective.level < 2 && planKind(account.plan) !== 'pro_max',
        canPurchaseProMax: effective.level < 2 || planKind(account.plan) === 'pro_max',
        serverTime: now.toISOString(),
        secondsRemaining: (effective.activePro || effective.activeTrial) ? Math.max(0, (Date.parse(effective.expiresAt) - now.getTime()) / 1000) : 0,
        daysLeft: (effective.activePro || effective.activeTrial) ? Math.ceil((Date.parse(effective.expiresAt) - now.getTime()) / 86400000) : 0 };
    });
    return res.json(result);
  });
  return { checkout, status };
}
