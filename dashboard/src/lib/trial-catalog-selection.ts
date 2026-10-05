import { trialRemainingSlots } from './trial-display.mjs';
import type { TrialCatalog } from './quota-refresh';

export interface TrialCatalogKey {
  id: string;
  scopeVersion: number;
  linkedProductIds: string[];
  linkedVariantSelections: Record<string, string[]>;
  productIds: string[];
}

// The summary is measured by the server, never by visible/search-filtered cards.
export function trialSelectionState(catalog: TrialCatalog | null, key: TrialCatalogKey | null, selected: Set<string>) {
  const included = new Set(key?.productIds ?? []);
  const pending = new Set([...selected].filter(id => !included.has(id)));
  const remaining = catalog ? trialRemainingSlots(catalog.productsIncluded) : 0;
  const canSelect = !!catalog && catalog.activeKeys === 1 && !!key
    && remaining > 0 && pending.size < remaining;
  return { included, pending, remaining, canSelect,
    canSubmit: !!catalog && catalog.activeKeys === 1 && !!key && pending.size > 0 && pending.size <= remaining };
}

export function toggleTrialPending(pending: Set<string>, id: string, included: Set<string>, remaining: number, activeKey: boolean) {
  if (included.has(id) || !activeKey) return pending;
  const next = new Set(pending);
  if (next.has(id)) next.delete(id);
  else if (next.size < remaining) next.add(id);
  return next;
}

// Preserve even unavailable/filtered legacy IDs and their exact variant scope.
export function trialAdditionScope(key: TrialCatalogKey, full: string[], partial: Record<string, string[]>) {
  return {
    linkedProductIds: [...new Set([...key.linkedProductIds, ...full.filter(id => !key.productIds.includes(id))])],
    linkedVariantSelections: { ...Object.fromEntries(Object.entries(partial).filter(([id]) => !key.productIds.includes(id))), ...key.linkedVariantSelections },
    expectedScopeVersion: key.scopeVersion,
  };
}
