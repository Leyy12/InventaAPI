// Mirror the API's canonical ID union; embedded legacy names are never display authority.
export type ProductLink = {
  linkedProductIds?: unknown;
  linkedVariantSelections?: unknown;
  linkedProducts?: unknown;
};

const validId = (value: unknown): value is string =>
  typeof value === "string" && !!value.trim() && value !== "." && value !== ".." &&
  !value.includes("/") && !/[\u0000-\u001f\u007f]/u.test(value);

export function canonicalLinkedProductIds(key: ProductLink): string[] {
  const full = Array.isArray(key.linkedProductIds) ? key.linkedProductIds : [];
  const legacy = Array.isArray(key.linkedProducts)
    ? key.linkedProducts.map(value => value && typeof value === "object" ? value.id : null) : [];
  const partial = key.linkedVariantSelections && typeof key.linkedVariantSelections === "object" &&
    !Array.isArray(key.linkedVariantSelections) ? Object.keys(key.linkedVariantSelections) : [];
  return [...new Set([...full, ...legacy, ...partial].filter(validId).map(id => id.trim()))];
}

export function linkedProductLabels(ids: string[], names: Record<string, string>): string[] {
  return ids.map(id => Object.hasOwn(names, id) && typeof names[id] === "string" && names[id]
    ? names[id] : "Product unavailable");
}
