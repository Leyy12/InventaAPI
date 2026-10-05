import { TRIAL_MAX_PRODUCTS } from '../../../functions/entitlement-limits.mjs';

/** @param {number} productCount */
export function trialRemainingSlots(productCount) {
  return Math.max(TRIAL_MAX_PRODUCTS - productCount, 0);
}

/** @param {number} productCount */
export function trialCapacityMessage(productCount) {
  if (productCount === TRIAL_MAX_PRODUCTS) {
    return `Free Trial product limit reached — ${TRIAL_MAX_PRODUCTS} of ${TRIAL_MAX_PRODUCTS} products.`;
  }
  if (productCount > TRIAL_MAX_PRODUCTS) {
    return `Your Free Trial product limit is ${TRIAL_MAX_PRODUCTS} products.`;
  }
  return null;
}

/** @param {string | null | undefined} value @param {string} [locale] @param {string} [timeZone] */
export function formatTrialExpiry(value, locale, timeZone) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}
