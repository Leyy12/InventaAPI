// Pure shared contract: Express, scheduled Functions and Customer presentation.
export const TRIAL_MIN_PRODUCTS = 0;
export const TRIAL_MAX_PRODUCTS = 50;
// Free Trial: ONE API key (like Pro and Pro Max) holding up to 50 products. The
// key can be used in any number of projects; there is no per-project limit.
export const TRIAL_MAX_ACTIVE_KEYS = 1;
export const PRO_DAILY_REQUEST_LIMIT = 500;

// Count unique product IDs, not variants. Legacy over-cap catalogs can retain
// or remove existing IDs, but cannot add even when the resulting count is lower.
export function trialCatalogChangeAllowed(previousIds, nextIds) {
  const previous = new Set(previousIds);
  const next = new Set(nextIds);
  if (previous.size > TRIAL_MAX_PRODUCTS) return [...next].every(id => previous.has(id));
  return next.size <= TRIAL_MAX_PRODUCTS;
}

// Paid plans count PRODUCT VARIANTS DELIVERED per UTC calendar month: every
// variant a catalog response sends uses one (a product without variants uses one).
// One allowance for the whole account: Pro 15,000, Pro Max 20,000 (shared by its
// three segments; per-segment usage is only shown, not limited).
export const PRO_MONTHLY_PRODUCT_LIMIT = 15000;
export const PRO_MAX_MONTHLY_PRODUCT_LIMIT = 20000;
export const monthlyProductLimit = plan => (plan === 'pro_max' || plan === 'Pro Max') ? PRO_MAX_MONTHLY_PRODUCT_LIMIT : PRO_MONTHLY_PRODUCT_LIMIT;
// Older names kept for existing imports.
export const monthlyRequestLimit = monthlyProductLimit;
export const PRO_MONTHLY_REQUEST_LIMIT = PRO_MONTHLY_PRODUCT_LIMIT;
export const PRO_MAX_MONTHLY_REQUEST_LIMIT = PRO_MAX_MONTHLY_PRODUCT_LIMIT;
export const PAID_MONTHLY_REQUEST_LIMIT = PRO_MONTHLY_PRODUCT_LIMIT;
// Every plan has ONE API key. Pro's key holds products from its business segment;
// Pro Max's key holds products from all three segments (Grocery, Pharmacy, Hardware).
export const PRO_MAX_SEGMENT_KEYS = 3; // segments covered by the one Pro Max key
export const PRO_KEY_PRODUCT_LIMIT = 7500;
export const PRO_MAX_KEY_PRODUCT_LIMIT = 15000;
