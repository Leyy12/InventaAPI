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

// Paid plans count PRODUCTS DELIVERED per UTC calendar month: every product
// variant a catalog response sends uses one (a product without variants uses one). Pro shares one allowance across the account;
// Pro Max has a separate allowance for each Business Segment.
export const PAID_MONTHLY_PRODUCT_LIMIT = 15000;
// Older name kept so existing imports keep working; it is the same product allowance.
export const PAID_MONTHLY_REQUEST_LIMIT = PAID_MONTHLY_PRODUCT_LIMIT;
// Pro adds products to one API key in its own segment. Pro Max also has ONE API
// key, holding products from all three segments (Grocery, Pharmacy, Hardware);
// each segment keeps its own monthly allowance.
export const PRO_MAX_SEGMENT_KEYS = 3; // segments covered by the one Pro Max key
export const PRO_KEY_PRODUCT_LIMIT = 500;
export const PRO_MAX_KEY_PRODUCT_LIMIT = 1500;
