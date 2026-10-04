import { matchesPurchase, providerId, requirePayment } from './payment-contract.js';

export function samePaymentMethods(left, right) {
  return Array.isArray(left) && left.length > 0 && Array.isArray(right)
    && left.every(method => typeof method === 'string')
    && new Set(left).size === left.length && new Set(right).size === right.length
    && left.length === right.length && left.every(method => right.includes(method));
}

export function savedPaymentMethods(order) {
  try { return JSON.parse(order.providerRequestBody)?.data?.attributes?.payment_method_types; }
  catch { return null; }
}

export function checkoutPayload(order, dashboardUrl) {
  requirePayment(matchesPurchase(order), 'PURCHASE_MISMATCH', 'Saved purchase terms are invalid.');
  const base = new URL(dashboardUrl);
  requirePayment(['https:', 'http:'].includes(base.protocol) && !base.username && !base.password,
    'PAYMENT_CONFIG', 'Invalid payment redirect configuration.', 503);
  const success = new URL('/dashboard', base);
  success.searchParams.set('payment', 'success');
  success.searchParams.set('order', order.id);
  const cancel = new URL('/?payment=cancelled', base);
  if (order.planId === 'pro_max') cancel.searchParams.set('pendingPlan', 'pro_max');
  return { data: { attributes: {
    line_items: [{ amount: order.amount, currency: order.currency, quantity: 1,
      name: `InventaAPI ${order.plan} Plan`, description: order.planId === 'pro_max'
        ? '1 Month Subscription — Unlimited account API quota' : '1 Month Subscription — 5,000 API requests/day' }],
    payment_method_types: ['qrph'], success_url: success.href,
    cancel_url: cancel.href,
    reference_number: order.id, metadata: { orderId: order.id, planId: order.planId ?? 'pro', plan: order.plan },
    statement_descriptor: order.planId === 'pro_max' ? 'InventaAPI Pro Max' : 'InventaAPI Pro Plan',
    send_email_receipt: false, show_description: true, show_line_items: true,
  } } };
}

// request is injected at the route boundary; isolated tests cannot load a network implementation.
export async function createPaymongoCheckout({ request, config, order }) {
  requirePayment(matchesPurchase(order) && order.idempotencyKey === `checkout-${order.mode}-${order.id}`
    && typeof order.providerRequestBody === 'string', 'CHECKOUT_REVIEW', 'Missing durable checkout request.', 503);
  const response = await request('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
      'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': order.idempotencyKey },
    // Exact serialized request was persisted before the first provider call.
    body: order.providerRequestBody,
  });
  requirePayment(response.ok, 'PROVIDER_UNCERTAIN', 'Checkout could not be confirmed. Contact support before retrying.', 502);
  const session = (await response.json())?.data;
  const attrs = session?.attributes;
  requirePayment(session?.type === 'checkout_session' && providerId(session.id, 'cs')
    && attrs?.livemode === (order.mode === 'live') && attrs.status === 'active'
    && providerId(attrs.payment_intent?.id, 'pi')
    && samePaymentMethods(attrs.payment_method_types, savedPaymentMethods(order)),
  'PROVIDER_UNCERTAIN', 'Checkout could not be verified.', 502);
  const url = new URL(attrs.checkout_url);
  requirePayment(url.protocol === 'https:' && url.hostname === 'checkout.paymongo.com'
    && !url.username && !url.password && !url.port, 'PROVIDER_UNCERTAIN', 'Checkout URL could not be verified.', 502);
  return { sessionId: session.id, paymentIntentId: attrs.payment_intent.id, checkoutUrl: url.href };
}

// Fixed v1 boundary. Successful HTTP expiration alone is never replacement proof.
export async function expirePaymongoCheckout({ request, config, order }) {
  requirePayment(providerId(order.sessionId, 'cs') && providerId(order.paymentIntentId, 'pi')
    && order.mode === config.mode && matchesPurchase(order), 'CHECKOUT_REVIEW');
  const url = `https://api.paymongo.com/v1/checkout_sessions/${order.sessionId}`;
  const headers = { Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
    Accept: 'application/json' };
  const read = async () => {
    const response = await request(url, { method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(15000) });
    requirePayment(response.ok, 'CHECKOUT_REVIEW', 'Existing checkout needs payment reconciliation.', 503);
    const session = (await response.json())?.data;
    const attrs = session?.attributes;
    const intent = attrs?.payment_intent;
    requirePayment(session?.type === 'checkout_session' && session.id === order.sessionId
      && attrs?.livemode === (order.mode === 'live') && ['active', 'expired'].includes(attrs.status)
      && intent?.id === order.paymentIntentId && intent.type === 'payment_intent'
      && intent.attributes?.livemode === (order.mode === 'live')
      && intent.attributes.amount === order.amount && intent.attributes.currency === order.currency
      && samePaymentMethods(attrs.payment_method_types, savedPaymentMethods(order))
      && Array.isArray(attrs.line_items) && attrs.line_items.length === 1
      && attrs.line_items[0].amount === order.amount && attrs.line_items[0].currency === order.currency
      && attrs.line_items[0].quantity === 1 && Array.isArray(attrs.payments),
    'CHECKOUT_REVIEW', 'Existing checkout state could not be verified.', 503);
    // Settled or in-flight payment must be reconciled, never blindly replaced.
    requirePayment(intent.attributes.status === 'awaiting_payment_method'
      && attrs.payments.every(payment => payment?.attributes?.status === 'failed'),
    'CHECKOUT_REVIEW', 'Existing checkout needs payment reconciliation.', 409);
    return attrs;
  };
  let attrs = await read();
  if (attrs.status === 'active') {
    const response = await request(`${url}/expire`, { method: 'POST', redirect: 'error', headers,
      signal: AbortSignal.timeout(15000) });
    requirePayment(response.ok, 'CHECKOUT_REVIEW', 'Checkout expiration could not be confirmed. Retry safely.', 503);
    attrs = await read();
  }
  requirePayment(attrs.status === 'expired', 'CHECKOUT_REVIEW', 'Checkout remains payable; replacement blocked.', 503);
  return { sessionId: order.sessionId, status: 'expired', unpaid: true };
}
