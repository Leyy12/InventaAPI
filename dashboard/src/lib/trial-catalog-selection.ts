import { trialRemainingSlots } from './trial-display.mjs';
import { TRIAL_MAX_ACTIVE_KEYS } from '../../../functions/entitlement-limits.mjs';
import type { TrialCatalog } from './quota-refresh';

export interface TrialCatalogKey {
  id: string;
  scopeVersion: number;
  linkedProductIds: string[];
  linkedVariantSelections: Record<string, string[]>;
  productIds: string[];
}

// The summary is measured by the server, never by visible/search-filtered cards.
// Active Trial keys share one catalog: `included` is the union of their products,
// and only products outside it (`pending`) consume remaining slots.
export function trialSelectionState(catalog: TrialCatalog | null, keyOrKeys: TrialCatalogKey | TrialCatalogKey[] | null, selected: Set<string>) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : keyOrKeys ? [keyOrKeys] : [];
  const included = new Set(keys.flatMap(key => key.productIds));
  const pending = new Set([...selected].filter(id => !included.has(id)));
  const remaining = catalog ? trialRemainingSlots(catalog.productsIncluded) : 0;
  // A missing key is selectable only when the server also confirms zero keys
  // and zero persisted products. A partial/mismatched response fails closed.
  let mode: 'first-key' | 'existing-key' | 'blocked' = 'blocked';
  if (catalog && Number.isInteger(catalog.productsIncluded) && catalog.productsIncluded >= 0) {
    if (catalog.activeKeys === 0 && keys.length === 0 && catalog.productsIncluded === 0) mode = 'first-key';
    else if (catalog.activeKeys >= 1 && catalog.activeKeys === keys.length && catalog.activeKeys <= TRIAL_MAX_ACTIVE_KEYS
      && included.size === catalog.productsIncluded) mode = 'existing-key';
  }
  const canToggle = mode !== 'blocked';
  const canSelect = canToggle && remaining > 0 && pending.size < remaining;
  return { mode, included, pending, remaining, canToggle, canSelect,
    canGenerateFirstKey: mode === 'first-key' && pending.size <= remaining,
    // Another key may reuse included products; new ones still need free slots.
    canGenerateAnotherKey: mode === 'existing-key' && keys.length < TRIAL_MAX_ACTIVE_KEYS
      && selected.size > 0 && pending.size <= remaining,
    canSubmit: mode === 'existing-key' && keys.length === 1 && pending.size > 0 && pending.size <= remaining };
}

export function toggleTrialPending(pending: Set<string>, id: string, included: Set<string>, remaining: number, selectionAllowed: boolean) {
  if (included.has(id) || !selectionAllowed) return pending;
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
