/** Product IDs already linked to each active API key, labelled by the key's name.
 * fullIds: products in the key with every variant; variantSelections: products in it
 * with only some variants (variant IDs are "flavor|size"). */
export interface KeyProductUsage { id: string; name: string; productIds: Set<string>;
  fullIds: Set<string>; variantSelections: Map<string, Set<string>> }

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
    const variantSelections = new Map<string, Set<string>>();
    for (const id of partial) {
      const values = key.linkedVariantSelections[id];
      if (Array.isArray(values)) variantSelections.set(id, new Set(values.filter((value: unknown): value is string => typeof value === 'string')));
    }
    const fullIds = new Set<string>(full.filter((id: unknown): id is string => typeof id === 'string' && !variantSelections.has(id)));
    const name = typeof key.name === 'string' && key.name.trim() ? key.name.trim() : 'Unnamed key';
    return [{ id: key.id, name, productIds, fullIds, variantSelections }];
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

/** Playground link carrying the current selection, including partial variant choices. */
export function playgroundHref(products: { id?: string; variants?: unknown[] }[], selectedIds: Set<string>,
  selectedVariants: Record<string, Set<string>>): string {
  const query = new URLSearchParams({ products: [...selectedIds].join(',') });
  const partial: Record<string, string[]> = {};
  for (const product of products) {
    const chosen = product.id && selectedIds.has(product.id) ? selectedVariants[product.id] : undefined;
    if (chosen?.size && product.variants?.length && chosen.size < product.variants.length) partial[product.id!] = [...chosen];
  }
  if (Object.keys(partial).length) query.set('variants', JSON.stringify(partial));
  return `/dashboard/api-playground?${query}`;
}

/** Reads the Products → Playground handoff back into a preview scope. */
export function previewScopeFromQuery(products: string | null, variants: string | null) {
  const ids = (products ?? '').split(',').map(id => id.trim()).filter(Boolean);
  let parsed: unknown = null;
  try { parsed = variants ? JSON.parse(variants) : null; } catch { parsed = null; }
  const linkedVariantSelections: Record<string, string[]> = {};
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [id, values] of Object.entries(parsed)) {
      if (ids.includes(id) && Array.isArray(values) && values.length && values.every(value => typeof value === 'string')) {
        linkedVariantSelections[id] = values;
      }
    }
  }
  return { linkedProductIds: ids.filter(id => !Object.hasOwn(linkedVariantSelections, id)), linkedVariantSelections };
}

const variantKey = (variant: { flavor?: string; size?: string }) => `${variant.flavor || ''}|${variant.size || ''}`;

/** What the customer's keys already hold for one product: every variant, some, or none. */
export function keyCoverage(usage: KeyProductUsage[], product: { id?: string; variants?: { flavor?: string; size?: string }[] }):
  { full: boolean; variants: Set<string> } {
  const id = product.id;
  const all = (product.variants ?? []).map(variantKey);
  if (!id) return { full: false, variants: new Set() };
  if (usage.some(key => key.fullIds.has(id))) return { full: true, variants: new Set(all) };
  const variants = new Set(usage.flatMap(key => [...(key.variantSelections.get(id) ?? [])]));
  return { full: all.length > 0 && all.every(value => variants.has(value)), variants };
}
