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

// Paid plans have NO monthly request limit. Requests are still counted per UTC
// month (history and admin views), and the short-window per-IP rate limit still
// applies. null means unlimited everywhere a limit is reported.
export const PRO_MONTHLY_REQUEST_LIMIT = null;
export const PRO_MAX_MONTHLY_REQUEST_LIMIT = null;
export const monthlyRequestLimit = () => null;
// Older name kept for existing imports.
export const PAID_MONTHLY_REQUEST_LIMIT = null;
// Every plan has ONE API key. Pro's key holds products from its business segment;
// Pro Max's key holds products from all three segments (Grocery, Pharmacy, Hardware).
export const PRO_MAX_SEGMENT_KEYS = 3; // segments covered by the one Pro Max key
export const PRO_KEY_PRODUCT_LIMIT = 7500;
export const PRO_MAX_KEY_PRODUCT_LIMIT = 15000;
