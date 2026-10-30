// Test helper: one catalog call that delivers `products` products (default 1).
// Admission (consumeAccountQuota) then, for Pro / Pro Max, the product charge the
// catalog route makes. Mirrors routes/daas.js: nothing left to send means 429.
// Free Trial calls have no product charge and behave exactly like admission.
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { chargeMonthlyProducts } from '../../../services/paid-monthly-quota.js';
import { ApiSecurityError } from '../../../services/api-key-security.js';

export async function consumeAndDeliver(db, options, products = 1) {
  const admitted = await consumeAccountQuota(db, options);
  if (!admitted.productCharge) return admitted;
  const charged = await chargeMonthlyProducts(db, { ...admitted.productCharge, requested: products, clock: options.clock });
  if (charged.granted === 0 && products > 0) {
    throw new ApiSecurityError(429, 'Rate Limit Exceeded', 'Monthly product allowance is used up.', { quota: charged.usage });
  }
  return { ...admitted, usage: charged.usage, delivered: charged.granted };
}
