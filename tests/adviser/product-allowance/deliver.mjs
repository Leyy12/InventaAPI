// Test helper: one catalog call that delivers `products` variants (default 1).
// Admission (consumeAccountQuota) then, for Pro / Pro Max, the charge the catalog
// route makes. Mirrors routes/daas.js: nothing granted means 429.
// Pro charges its account allowance. Pro Max charges each product's segment; here a
// number is charged to the calling key's segment tag (older per-segment keys), or
// pass { Grocery: 2, Pharmacy: 1 } to say which segments the variants belong to.
// Free Trial calls have no charge and behave exactly like admission.
import { consumeAccountQuota } from '../../../services/account-quota.js';
import { chargeMonthlyBuckets } from '../../../services/paid-monthly-quota.js';
import { normalizeSegment } from '../../../services/product-contract.js';
import { ApiSecurityError } from '../../../services/api-key-security.js';

export async function consumeAndDeliver(db, options, products = 1) {
  const admitted = await consumeAccountQuota(db, options);
  const charge = admitted.productCharge;
  if (!charge) return admitted;
  let requested = products;
  if (typeof products === 'number') {
    const bucket = charge.plan === 'pro' ? 'account'
      : normalizeSegment((await db.collection('api_keys').doc(options.keyId).get()).data()?.segment) || 'general';
    requested = { [bucket]: products };
  }
  const charged = await chargeMonthlyBuckets(db, { ...charge, requested, clock: options.clock });
  const granted = Object.values(charged.granted).reduce((a, b) => a + b, 0);
  const wanted = Object.values(requested).reduce((a, b) => a + b, 0);
  const [onlyBucket] = Object.keys(requested);
  const usage = Object.keys(requested).length === 1 ? charged.usage[onlyBucket] : charged.usage;
  if (granted === 0 && wanted > 0) {
    throw new ApiSecurityError(429, 'Rate Limit Exceeded', 'Monthly product allowance is used up.', { quota: usage });
  }
  return { ...admitted, usage, delivered: granted };
}
