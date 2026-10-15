import { requirePayment } from './payment-contract.js';
import { samePaymentMethods } from './paymongo-checkout.js';

// Saved terms may protect an existing checkout from replacement; they never
// prove payment. Granting access also requires the signed-session check below.
export function legacySavedRequestAllowance(order) {
  let saved;
  try { saved = JSON.parse(order.providerRequestBody)?.data?.attributes; } catch { /* reject below */ }
  const item = saved?.line_items?.[0];
  const limit = item?.description === '1 Month Subscription — 500 API requests/day' ? 500
    : item?.description === '1 Month Subscription — 5,000 API requests/day' ? 5000 : undefined;
  requirePayment(order.mode === 'live' && order.plan === 'Pro' && (order.planId ?? 'pro') === 'pro'
    && limit !== undefined && order.apiRequestLimit === limit && bound(order, saved)
    && saved.show_description === true && saved.show_line_items === true
    && saved.line_items.length === 1 && item.name === 'InventaAPI Pro Plan'
    && item.amount === order.amount && item.currency === 'PHP' && item.quantity === 1,
  'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE', 'Original checkout request terms require verified reconciliation.', 503);
  return { planId: 'pro', limit, period: 'utc_daily', policyVersion: `requests-v1:legacy-signed-pro-${limit}` };
}

const bound = (order, value) => value?.reference_number === order.id && value.metadata?.orderId === order.id
  && value.metadata.plan === 'Pro' && (value.metadata.planId ?? 'pro') === 'pro';

export function legacyPaidRequestAllowance(order, signedSession) {
  const terms = legacySavedRequestAllowance(order);
  const saved = JSON.parse(order.providerRequestBody).data.attributes;
  const item = saved.line_items[0], proof = signedSession?.line_items?.[0];
  requirePayment(bound(order, signedSession) && signedSession?.line_items?.length === 1
    && ['name', 'description', 'amount', 'currency', 'quantity'].every(key => proof?.[key] === item[key])
    && samePaymentMethods(saved.payment_method_types, signedSession.payment_method_types),
  'REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE', 'Original checkout request terms require verified reconciliation.', 503);
  return terms;
}
