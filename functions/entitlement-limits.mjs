// Pure shared contract: Express, scheduled Functions and Customer presentation.
export const TRIAL_MIN_PRODUCTS = 0;
export const TRIAL_MAX_PRODUCTS = 50;
// Trial keys share one 50-product catalog: the union across active keys is capped.
export const TRIAL_MAX_ACTIVE_KEYS = 5;
export const PRO_DAILY_REQUEST_LIMIT = 500;

// Count unique product IDs, not variants. Legacy over-cap catalogs can retain
// or remove existing IDs, but cannot add even when the resulting count is lower.
export function trialCatalogChangeAllowed(previousIds, nextIds) {
  const previous = new Set(previousIds);
  const next = new Set(nextIds);
  if (previous.size > TRIAL_MAX_PRODUCTS) return [...next].every(id => previous.has(id));
  return next.size <= TRIAL_MAX_PRODUCTS;
}

// Paid plans count API requests per UTC calendar month. Pro shares one allowance
// across the account; Pro Max has a separate allowance for each Business Segment.
export const PAID_MONTHLY_REQUEST_LIMIT = 15000;
// Pro adds products to one API key in its own segment; Pro Max keeps one key
// per segment (Grocery, Pharmacy, Hardware), so at most three.
export const PRO_MAX_SEGMENT_KEYS = 3;
