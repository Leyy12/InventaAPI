// Pure shared contract: Express, scheduled Functions and Customer presentation.
export const TRIAL_MIN_PRODUCTS = 0;
export const TRIAL_MAX_PRODUCTS = 50;
export const PRO_DAILY_REQUEST_LIMIT = 500;

// Count unique product IDs, not variants. Legacy over-cap catalogs can retain
// or remove existing IDs, but cannot add even when the resulting count is lower.
export function trialCatalogChangeAllowed(previousIds, nextIds) {
  const previous = new Set(previousIds);
  const next = new Set(nextIds);
  if (previous.size > TRIAL_MAX_PRODUCTS) return [...next].every(id => previous.has(id));
  return next.size <= TRIAL_MAX_PRODUCTS;
}
