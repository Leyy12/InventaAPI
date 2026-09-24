import { validDocumentId } from './api-key-security.js';
import { accountBlocked, evaluateEntitlement, dateMillis } from '../functions/subscription-lifecycle.mjs';

// Existing price/quota/duration; each paid term spans 30 UTC calendar days.
export const PRO_PURCHASE = Object.freeze({ plan: 'Pro', amount: 149900, currency: 'PHP', durationDays: 30, apiRequestLimit: 5000 });
export const PAYMENT_COLLECTIONS = Object.freeze({ orders: 'payment_orders', locks: 'payment_checkout_locks',
  sessions: 'payment_sessions', events: 'payment_events', payments: 'transactions' });

export class PaymentError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
export function requirePayment(condition, code, message = 'Payment verification failed.', status = 409) {
  if (!condition) throw new PaymentError(status, code, message);
}
export function paymentError(res, error) {
  return res.status(error instanceof PaymentError ? error.status : 503).json({
    error: error instanceof PaymentError ? error.message : 'Payment service unavailable. Please try again later.',
    code: error instanceof PaymentError ? error.code : 'PAYMENT_UNAVAILABLE',
  });
}
export const providerId = (id, prefix) => typeof id === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{1,128}$`, 'u').test(id);
export const orderIdValid = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(id);
export const modeKey = (mode, id) => `${mode}_${id}`;
export const refFor = (db, name, id) => db.collection(PAYMENT_COLLECTIONS[name]).doc(id);
export const matchesPurchase = order => order && Object.entries(PRO_PURCHASE).every(([key, value]) => order[key] === value);

export function paymentConfiguration({ mode, secretKey, webhookSecret, nodeEnv, dashboardUrl }) {
  const keyMode = /^sk_(test|live)_\S+$/u.exec(secretKey || '')?.[1];
  requirePayment(['test', 'live'].includes(mode) && keyMode === mode
    && typeof webhookSecret === 'string' && webhookSecret.trim().length > 0
    && !/REPLACE|PLACEHOLDER|YOUR_/iu.test(webhookSecret)
    && !/REPLACE|PLACEHOLDER|YOUR_/iu.test(secretKey), 'PAYMENT_CONFIG', 'Payment service is not configured.', 503);
  // Webhooks need no redirect. Checkout passes its configured URL here so a
  // configuration error is rejected before creating/locking an order.
  if (dashboardUrl !== undefined) {
    let url;
    try { url = new URL(dashboardUrl); } catch { /* Fail closed below. */ }
    // Runtime production still requires a secure redirect, even with sandbox payments.
    requirePayment(url && !url.username && !url.password && (nodeEnv === 'production' || mode === 'live'
      ? url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      : ['http:', 'https:'].includes(url.protocol)), 'PAYMENT_CONFIG', 'Invalid payment redirect configuration.', 503);
  }
  return { mode, secretKey, webhookSecret, dashboardUrl };
}

export function authenticatedPayment({ getDb, verifyIdToken }, operation) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const match = typeof req.headers.authorization === 'string' && /^Bearer ([^\s]+)$/u.exec(req.headers.authorization);
      requirePayment(match, 'UNAUTHENTICATED', 'A Firebase ID token is required.', 401);
      let actor;
      try { actor = await verifyIdToken(match[1], true); } catch { /* Uniform authentication failure. */ }
      requirePayment(validDocumentId(actor?.uid), 'UNAUTHENTICATED', 'Invalid or expired authentication.', 401);
      for (const claimed of [req.body?.userId, req.query?.userId]) {
        requirePayment(claimed === undefined || claimed === actor.uid, 'IDENTITY_MISMATCH', 'Account access denied.', 403);
      }
      return await operation(req, res, actor.uid, getDb());
    } catch (error) { return paymentError(res, error); }
  };
}

export function requireCustomer(account, uid) {
  requirePayment(!accountBlocked(account) && account.uid === uid && account.role === 'Developer', 'ACCOUNT_UNAVAILABLE', 'Customer account unavailable.', 403);
}

export function requirePurchasable(account, now) {
  requirePayment(['free', 'starter', 'pro', 'professional'].includes(account.plan?.toLowerCase()), 'PLAN_UNAVAILABLE', 'This account cannot purchase Pro.');
  requirePayment(account.subscriptionExpiresAt == null || Number.isFinite(dateMillis(account.subscriptionExpiresAt)),
    'ENTITLEMENT_UNAVAILABLE', 'Subscription needs review before purchase.', 409);
  requirePayment(!['pro', 'professional'].includes(account.plan?.toLowerCase())
    || dateMillis(account.subscriptionExpiresAt) <= now.getTime() || account.subscription_status === 'active',
  'ACTIVE_PRO', 'Unresolved subscription requires review.');
  try { evaluateEntitlement(account, now); }
  catch { requirePayment(false, 'ENTITLEMENT_UNAVAILABLE', 'Subscription needs review before purchase.', 409); }
}
