import { PRO_PURCHASE, providerId, requirePayment } from './payment-contract.js';

export function checkoutPayload(order, dashboardUrl) {
  const base = new URL(dashboardUrl);
  requirePayment(['https:', 'http:'].includes(base.protocol) && !base.username && !base.password,
    'PAYMENT_CONFIG', 'Invalid payment redirect configuration.', 503);
  const success = new URL('/dashboard', base);
  success.searchParams.set('payment', 'success');
  success.searchParams.set('order', order.id);
  return { data: { attributes: {
    line_items: [{ amount: PRO_PURCHASE.amount, currency: PRO_PURCHASE.currency, quantity: 1,
      name: 'InventaAPI Pro Plan', description: '1 Month Subscription — 5,000 API requests/day' }],
    payment_method_types: ['gcash'], success_url: success.href,
    cancel_url: new URL('/?payment=cancelled', base).href,
    reference_number: order.id, metadata: { orderId: order.id, plan: PRO_PURCHASE.plan },
    statement_descriptor: 'InventaAPI Pro Plan', send_email_receipt: false, show_description: true, show_line_items: true,
  } } };
}

// request is injected at the route boundary; isolated tests cannot load a network implementation.
export async function createPaymongoCheckout({ request, config, order }) {
  requirePayment(order.idempotencyKey === `checkout-${order.mode}-${order.id}`
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
    && providerId(attrs.payment_intent?.id, 'pi'), 'PROVIDER_UNCERTAIN', 'Checkout could not be verified.', 502);
  const url = new URL(attrs.checkout_url);
  requirePayment(url.protocol === 'https:' && url.hostname === 'checkout.paymongo.com'
    && !url.username && !url.password && !url.port, 'PROVIDER_UNCERTAIN', 'Checkout URL could not be verified.', 502);
  return { sessionId: session.id, paymentIntentId: attrs.payment_intent.id, checkoutUrl: url.href };
}
