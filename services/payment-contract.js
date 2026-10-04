import { validDocumentId } from './api-key-security.js';
import { accountBlocked, evaluateEntitlement, dateMillis, planKind } from '../functions/subscription-lifecycle.mjs';

// Existing price/quota/duration; each paid term spans 30 UTC calendar days.
export const PRO_PURCHASE = Object.freeze({ planId: 'pro', plan: 'Pro', amount: 149900,
  currency: 'PHP', durationDays: 30, apiRequestLimit: 5000 });
export const PRO_MAX_PURCHASE = Object.freeze({ planId: 'pro_max', plan: 'Pro Max', amount: 499900,
  currency: 'PHP', durationDays: 30, apiRequestLimit: null });
export const PURCHASE_CATALOG = Object.freeze({ pro: PRO_PURCHASE, pro_max: PRO_MAX_PURCHASE });
export const purchaseForIntent = planId => typeof planId === 'string' && Object.hasOwn(PURCHASE_CATALOG, planId)
  ? PURCHASE_CATALOG[planId] : null;
export const GLOBAL_LIVE_TEST_AMOUNT = 500;
export const GLOBAL_LIVE_TEST_PROFILE = 'global_live_test_v1';

// Operator-only, opt-in Live billing. Never accepts an arbitrary discount.
export function globalTestBillingConfiguration({ mode, globalTestBilling, globalTestAmountCentavos }) {
  requirePayment(globalTestBilling === undefined || ['true', 'false'].includes(globalTestBilling),
    'PAYMENT_CONFIG', 'Invalid temporary billing configuration.', 503);
  requirePayment(globalTestAmountCentavos === undefined || globalTestAmountCentavos === '500',
    'PAYMENT_CONFIG', 'Temporary billing amount must be exactly 500 centavos.', 503);
  const enabled = globalTestBilling === 'true';
  requirePayment(!enabled || mode === 'live' && globalTestAmountCentavos === '500',
    'PAYMENT_CONFIG', 'Temporary billing requires Live mode and an explicit 500-centavo amount.', 503);
  return enabled;
}

export function settlementForPurchase(purchase, config) {
  if (config.globalTestBilling !== true) return { ...purchase };
  requirePayment(config.mode === 'live', 'PAYMENT_CONFIG', 'Temporary billing requires Live mode.', 503);
  return { ...purchase, listAmount: purchase.amount, amount: GLOBAL_LIVE_TEST_AMOUNT,
    billingProfile: GLOBAL_LIVE_TEST_PROFILE };
}
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
export const matchesPurchase = order => {
  const purchase = purchaseForIntent(order?.planId ?? (order?.plan === 'Pro' ? 'pro' : null));
  // Pre-catalog Pro orders lacked planId; only those exact historical terms
  // retain their original fulfillment contract. Pro Max always requires its ID.
  return !!purchase && (order.planId === purchase.planId || purchase.planId === 'pro' && order.planId === undefined)
    && Object.entries(purchase).every(([key, value]) => ['planId', 'amount'].includes(key) || order[key] === value)
    && (order.billingProfile === undefined && order.listAmount === undefined && order.amount === purchase.amount
      || order.billingProfile === GLOBAL_LIVE_TEST_PROFILE && order.mode === 'live'
        && order.planId === purchase.planId && order.listAmount === purchase.amount && order.amount === GLOBAL_LIVE_TEST_AMOUNT);
};

export function paymentConfiguration({ mode, secretKey, webhookSecret, nodeEnv, dashboardUrl,
  globalTestBilling, globalTestAmountCentavos }) {
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
  const temporaryBilling = globalTestBillingConfiguration({ mode, globalTestBilling, globalTestAmountCentavos });
  return { mode, secretKey, webhookSecret, dashboardUrl, globalTestBilling: temporaryBilling };
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

export function requirePurchasable(account, now, purchase = PRO_PURCHASE) {
  const kind = planKind(account.plan);
  requirePayment(['free', 'pro', 'pro_max'].includes(kind) && purchaseForIntent(purchase.planId)
    && !(kind === 'pro_max' && purchase.planId === 'pro'), 'PLAN_UNAVAILABLE', 'This account cannot purchase that plan.');
  requirePayment(account.subscriptionExpiresAt == null || Number.isFinite(dateMillis(account.subscriptionExpiresAt)),
    'ENTITLEMENT_UNAVAILABLE', 'Subscription needs review before purchase.', 409);
  requirePayment(!['pro', 'pro_max'].includes(kind)
    || dateMillis(account.subscriptionExpiresAt) <= now.getTime() || account.subscription_status === 'active',
  'ACTIVE_PRO', 'Unresolved subscription requires review.');
  try { evaluateEntitlement(account, now); }
  catch { requirePayment(false, 'ENTITLEMENT_UNAVAILABLE', 'Subscription needs review before purchase.', 409); }
}
