// Test helper: one catalog call that delivers `variants` product variants
// (default 1). Admission (consumeAccountQuota) then, for Pro / Pro Max, the
// charge the catalog route makes. Mirrors routes/daas.js: nothing granted means
// 429. The variants are counted against the calling key's segment tag (Pro Max
// display counters). Free Trial calls have no charge and behave like admission.
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { chargeMonthlyProducts } from '../../../services/paid-monthly-quota.js';
import { normalizeSegment } from '../../../services/product-contract.js';
import { ApiSecurityError } from '../../../services/api-key-security.js';

export async function consumeAndDeliver(db, options, variants = 1) {
  const admitted = await consumeAccountQuota(db, options);
  if (!admitted.productCharge) return admitted;
  const segment = normalizeSegment((await db.collection('api_keys').doc(options.keyId).get()).data()?.segment) || 'Grocery';
  const charged = await chargeMonthlyProducts(db, { ...admitted.productCharge, items: [{ segment, cost: variants }], clock: options.clock });
  if (charged.granted === 0 && variants > 0) {
    throw new ApiSecurityError(429, 'Rate Limit Exceeded', 'Monthly product allowance is used up.', { quota: charged.usage });
  }
  return { ...admitted, usage: charged.usage, delivered: charged.granted };
}
