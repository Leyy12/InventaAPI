import { normalizeSegment, PRODUCT_SEGMENTS } from './product-contract.js';

// Ownership is independent of Pro Trial feature entitlement. Unknown plans fail closed.
export function restrictedSegmentAccount(account) {
  return !['pro', 'professional', 'enterprise', 'unlimited'].includes(String(account?.plan || '').toLowerCase());
}
export function activeCustomerSegment(account) {
  return normalizeSegment(restrictedSegmentAccount(account) ? account?.businessSegment : account?.selectedSegment);
}
export function loginSegmentAllowed(account, selection) {
  const selected = PRODUCT_SEGMENTS.includes(selection) ? selection : null;
  return !!selected && (!restrictedSegmentAccount(account) || selected === activeCustomerSegment(account));
}
export function scopeCustomerProducts(products, account) {
  if (!account) return [];
  if (!restrictedSegmentAccount(account)) return products;
  const segment = activeCustomerSegment(account);
  return segment ? products.filter(product => normalizeSegment(product.segment) === segment) : [];
}
