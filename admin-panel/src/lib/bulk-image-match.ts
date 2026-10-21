// Matches photo file names (or CSV identifiers) to catalog products for bulk image updates.
// Order of trust: exact product ID, then SKU, then brand + name, then every name word present.
export type MatchableProduct = {
  id: string; name?: string; product?: string; brand?: string; sku?: string;
  attributes?: { brand?: string }; variants?: { sku?: string }[];
};
export type ImageMatch = { productIds: string[]; by: 'id' | 'sku' | 'name' | 'words' | 'none' };

export function normalizeKey(value: string = ''): string {
  return value.normalize('NFKC').toLowerCase().replace(/&/gu, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function fileStem(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{2,5}$/iu, '');
}
const words = (value: string) => normalizeKey(value).split(' ').filter(Boolean);
const productName = (p: MatchableProduct) => p.name || p.product || '';
const productBrand = (p: MatchableProduct) => p.brand || p.attributes?.brand || '';

export function createImageMatcher(products: MatchableProduct[]) {
  const byId = new Map<string, string>(), bySku = new Map<string, Set<string>>(), byName = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, id: string) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(id);
  };
  const tokens = products.map(p => {
    byId.set(p.id, p.id);
    add(bySku, normalizeKey(p.sku), p.id);
    for (const variant of p.variants || []) add(bySku, normalizeKey(variant.sku), p.id);
    const name = normalizeKey(productName(p)), brand = normalizeKey(productBrand(p));
    add(byName, name, p.id);
    if (brand) { add(byName, `${brand} ${name}`, p.id); add(byName, `${name} ${brand}`, p.id); }
    return { id: p.id, words: [...new Set([...words(productBrand(p)), ...words(productName(p))])] };
  });
  return function match(label: string): ImageMatch {
    const raw = fileStem(label.trim());
    if (byId.has(raw)) return { productIds: [raw], by: 'id' };
    const key = normalizeKey(raw);
    if (!key) return { productIds: [], by: 'none' };
    const sku = bySku.get(key);
    if (sku) return { productIds: [...sku].sort(), by: 'sku' };
    const name = byName.get(key);
    if (name) return { productIds: [...name].sort(), by: 'name' };
    // Every brand and name word must appear in the label (size or extra words may follow).
    // The most specific product wins; equally specific products are left for the admin to choose.
    const present = new Set(key.split(' '));
    let best = 0, ids: string[] = [];
    for (const candidate of tokens) {
      if (!candidate.words.length || !candidate.words.every(word => present.has(word))) continue;
      if (candidate.words.length > best) { best = candidate.words.length; ids = [candidate.id]; }
      else if (candidate.words.length === best) ids.push(candidate.id);
    }
    return ids.length ? { productIds: ids.sort(), by: 'words' } : { productIds: [], by: 'none' };
  };
}

// A short description of how a row was matched, shown next to each photo.
export const matchLabels: Record<ImageMatch['by'], string> = {
  id: 'Product ID', sku: 'SKU', name: 'Brand + name', words: 'Name words', none: 'No match',
};
