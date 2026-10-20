/** Product IDs already linked to each active API key, labelled by the key's name. */
export interface KeyProductUsage { id: string; name: string; productIds: Set<string> }

export type KeyUsageFilter = 'all' | 'unused' | 'used' | `key:${string}`;

export const ALL_CATEGORIES = 'All';

export function keyProductUsage(keys: unknown): KeyProductUsage[] {
  if (!Array.isArray(keys)) return [];
  return keys.flatMap(key => {
    if (!key || typeof key !== 'object' || typeof key.id !== 'string') return [];
    const full = Array.isArray(key.linkedProductIds) ? key.linkedProductIds : [];
    const partial = key.linkedVariantSelections && typeof key.linkedVariantSelections === 'object'
      ? Object.keys(key.linkedVariantSelections) : [];
    const productIds = new Set<string>([...full, ...partial].filter((id): id is string => typeof id === 'string'));
    const name = typeof key.name === 'string' && key.name.trim() ? key.name.trim() : 'Unnamed key';
    return [{ id: key.id, name, productIds }];
  });
}

/** Key names per product, in key order, for card badges. */
export function keyNamesByProduct(usage: KeyProductUsage[]): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const key of usage) for (const id of key.productIds) names.set(id, [...(names.get(id) ?? []), key.name]);
  return names;
}

export function productCategories(products: { category?: unknown }[]): string[] {
  const categories = new Set<string>();
  for (const product of products) {
    if (typeof product.category === 'string' && product.category.trim()) categories.add(product.category.trim());
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}

export function matchesCategory(product: { category?: unknown }, category: string): boolean {
  return category === ALL_CATEGORIES || (typeof product.category === 'string' && product.category.trim() === category);
}

export function matchesKeyUsage(productId: string, filter: KeyUsageFilter, usage: KeyProductUsage[],
  namesByProduct: Map<string, string[]>): boolean {
  if (filter === 'all') return true;
  if (filter === 'unused') return !namesByProduct.has(productId);
  if (filter === 'used') return namesByProduct.has(productId);
  const key = usage.find(entry => `key:${entry.id}` === filter);
  return key ? key.productIds.has(productId) : true;
}
