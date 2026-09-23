import { scopeCustomerProducts } from '../../../services/customer-segment.js';

/** The displayed/generation list is the current canonical selection inside account scope. */
export function selectedLinkedProducts<T extends { id?: string; segment?: unknown }>(
  products: T[], account: { plan?: unknown; businessSegment?: unknown; selectedSegment?: unknown } | null | undefined,
  selectedIds: Set<string>,
): T[] {
  return scopeCustomerProducts(products, account)
    .filter(product => typeof product.id === 'string' && selectedIds.has(product.id));
}
