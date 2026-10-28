"use client";
import { TRIAL_MAX_ACTIVE_KEYS, TRIAL_MAX_PRODUCTS } from "../../../../../functions/entitlement-limits.mjs";
import { trialCapacityMessage, trialRemainingSlots } from '@/lib/trial-display.mjs';
import { trialSelectionState, toggleTrialPending, trialAdditionScope, type TrialCatalogKey } from '@/lib/trial-catalog-selection';
import { invalidateAccountUsage } from '@/lib/account-usage-events';
import type { TrialCatalog } from '@/lib/quota-refresh';
import { GENERATION_POLICY, generationErrorMessage } from '@/lib/api-key-generation';

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from 'react-dom';
import { useWorkspaceHeaderSlot } from '@/components/layout/WorkspaceHeaderSlot';
import { Database, ShoppingCart, Check, Copy, Package, Key, Sparkles, AlertTriangle, Minus, X, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductCatalogEmptyState from "@/components/product-request/ProductNotFound";
import { activeCustomerSegment, scopeCustomerProducts } from '../../../../../services/customer-segment.js';
import AddProductModal from "@/components/products/AddProductModal";
import { productImageSource, showProductImageFallback } from '@/lib/product-image-url';
import { useAuth } from "@/lib/supabase/auth-context";
import { getBaseSize, hasNearExpiry, type Product } from "@/lib/products-service";
import { selectedLinkedProducts } from "@/lib/linked-product-selection";
import { apiKeyRequest } from "@/lib/api-keys";
import { createCatalogRefresh, loadSegmentCatalog, searchCatalog, catalogSelectableIds, catalogPresentationState, type CatalogSource, type CatalogPage } from '@/lib/segment-catalog';
import { ALL_CATEGORIES, keyNamesByProduct, keyProductUsage, matchesCategory, matchesKeyUsage, playgroundHref, productCategories, type KeyProductUsage, type KeyUsageFilter } from '@/lib/product-filters';

// Product type now imported from products-service (matches new variants schema)
// CartSummary local type

interface CartSummary {
  totalProducts: number;
  bySegment: Record<string, number>;
  productIds: string[];
  linkedProducts: { id: string; name: string }[];
}

// ==================== CONSTANTS ====================

const COPY_REDIRECT_DELAY = 1500;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
const PRODUCT_GRID_STYLE = { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))' };

// Treat 'deleted', 'free', 'starter' all as Free plan.
// The DB may store 'deleted' for churned/reset free accounts — they still
// only have access to their selected segment, same as a normal Free user.
function isFreePlan(plan: string | undefined): boolean {
  if (!plan) return true; // no plan at all = Free-tier access
  const p = plan.toLowerCase();
  return !['pro', 'professional', 'pro max', 'enterprise', 'unlimited'].includes(p);
}


// ==================== MAIN COMPONENT ====================

// When only some sizes/flavors are picked and one has its own photo (kept from a merged
// product, e.g. "Adobo"), the card shows that photo instead of the product's.
// The card photo follows the flavor/size the customer last clicked: its own photo, or the
// product photo when it has none (the product photo is the first flavor's).
function variantPhoto(product: { image_url?: unknown; image?: unknown; variants?: unknown[] }, picked: Set<string>, clicked?: string) {
  const variants = (product.variants ?? []) as { flavor?: string; size?: string; image_url?: unknown }[];
  if (clicked) {
    const variant = variants.find(item => `${item.flavor || ''}|${item.size || ''}` === clicked);
    if (variant) {
      if (typeof variant.image_url === 'string' && variant.image_url) return { image_url: variant.image_url };
      // A size without its own photo shows its flavor's photo (e.g. Hot & Spicy 420g → Hot & Spicy 155g's).
      const sibling = variant.flavor && variants.find(item => item.flavor === variant.flavor && typeof item.image_url === 'string' && item.image_url);
      return sibling ? { image_url: sibling.image_url } : product;
    }
  }
  if (!picked.size || picked.size >= variants.length) return product;
  const variant = variants.find(item => picked.has(`${item.flavor || ''}|${item.size || ''}`) && typeof item.image_url === 'string' && item.image_url);
  return variant ? { image_url: variant.image_url } : product;
}

const PRODUCTS_PER_PAGE = 60;

export default function ProductCatalogPage() {
  const { user } = useAuth();
  return <CustomerCatalogSession key={user?.uid ?? 'unauthenticated'} />;
}

function CustomerCatalogSession() {
  const router = useRouter();
  const { user, appUser, entitlement } = useAuth();
  const [paywalledUserId, setPaywalledUserId] = useState<string | null>(null);
  const paidAccess = entitlement?.activePro === true || ['Enterprise', 'Unlimited'].includes(entitlement?.plan ?? '');
  const upgradeRequired = entitlement?.subscription_status === 'upgrade_required'
    || (paywalledUserId === user?.uid && !paidAccess);
  const canGenerate = !!entitlement && !upgradeRequired;
  const activeTrial = entitlement?.activeTrial === true;
  const headerSlot = useWorkspaceHeaderSlot()?.target ?? null;
  const [summaryElement, setSummaryElement] = useState<HTMLElement | null>(null);
  const [summaryViewport, setSummaryViewport] = useState<{ target: HTMLElement; above: boolean } | null>(null);
  const [trialSelection, setTrialSelection] = useState<{ uid: string; keys: TrialCatalogKey[]; catalog: TrialCatalog } | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const trialKeys = useMemo(() => trialSelection && trialSelection.uid === user?.uid ? trialSelection.keys : [], [trialSelection, user?.uid]);
  // "Add Selected Products" extends the only key; with several keys, selections always form a new key.
  const trialKey = trialKeys.length === 1 ? trialKeys[0] : null;
  const [trialNewKeyChoice, setTrialNewKey] = useState(false);
  const trialCatalog = trialSelection?.uid === user?.uid ? trialSelection?.catalog ?? null : null;
  
  // Core State
  // Retain paid selections across category switches; the grid uses only the
  // current verified response, never this accumulated selection lookup.
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogSource, setCatalogSource] = useState<CatalogSource | null>(null);
  const catalogRefresh = useRef<ReturnType<typeof createCatalogRefresh> | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Record<string, Set<string>>>({});
  // Last variant chip clicked on each card; the card photo shows that variant.
  const [clickedVariant, setClickedVariant] = useState<Record<string, string>>({});
  const [paidSegment, setActiveSegment] = useState<string>("All");
  const activeSegment = isFreePlan(appUser?.plan) ? activeCustomerSegment(appUser) || '' : paidSegment;
  const currentCatalog = catalogSource?.segment === activeSegment ? catalogSource : null;
  const productAvailable = currentCatalog?.status === 'ready' ? currentCatalog.total : null;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'selected' | 'not-selected'>('all');
  const [productCategory, setProductCategory] = useState(ALL_CATEGORIES);
  // Products already linked to a key stay listed with a quiet "In key" note and
  // remain selectable for another key; each key's name is its own filter.
  const [keyUsageFilter, setKeyUsageFilter] = useState<KeyUsageFilter>('all');
  const [keyUsage, setKeyUsage] = useState<KeyProductUsage[]>([]);
  const keyNames = useMemo(() => keyNamesByProduct(keyUsage), [keyUsage]);
  
  // API Key Generation State
  const [showGenModal, setShowGenModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedKeyName, setGeneratedKeyName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [generatedLinkedProducts, setGeneratedLinkedProducts] = useState<CartSummary['linkedProducts']>([]);

  // Add Product (to existing API key) Modal State
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const trialState = trialSelectionState(trialCatalog, trialKeys, selectedProducts);
  const trialReady = !activeTrial || trialState.mode !== 'blocked';
  // Another Trial key may reuse included products, so they become selectable like paid catalogs.
  const trialNewKey = activeTrial && trialState.mode === 'existing-key' && (trialNewKeyChoice || trialKeys.length > 1);
  const trialCanGenerate = trialNewKey ? trialState.canGenerateAnotherKey : trialState.canGenerateFirstKey;
  const trialAddMode = activeTrial && trialState.mode === 'existing-key' && !trialNewKey;
  const trialPendingCount = activeTrial && !trialNewKey ? trialState.pending.size : null;
  const hasPendingSelection = activeTrial && !trialNewKey ? trialState.pending.size > 0 : selectedProducts.size > 0;
  const includedVariants = useMemo(() => {
    const variants: Record<string, string[] | null> = {};
    for (const key of trialKeys) for (const id of key.productIds) {
      const partial = key.linkedVariantSelections[id];
      variants[id] = !partial || variants[id] === null ? null : [...new Set([...(variants[id] ?? []), ...partial])];
    }
    return variants;
  }, [trialKeys]);

  useEffect(() => {
    const summary = summaryElement;
    const main = summary?.closest('main');
    if (!hasPendingSelection || !headerSlot || !summary || !main) return;
    let active = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (active && entry.rootBounds) {
        // Below the viewport is not docked; partial visibility keeps inline controls.
        const above = entry.boundingClientRect.bottom <= entry.rootBounds.top;
        setSummaryViewport(previous => previous?.target === summary && previous.above === above ? previous : { target: summary, above });
      }
    // Extend only the lower observation boundary so a direct jump from below
    // the viewport to above it still crosses an observer boundary. The upper
    // boundary remains the actual main viewport used for the dock decision.
    }, { root: main, rootMargin: `0px 0px ${main.scrollHeight}px 0px`, threshold: [0, 1] });
    observer.observe(summary);
    return () => { active = false; observer.disconnect(); };
  }, [hasPendingSelection, headerSlot, summaryElement]);

  const receiveTrialCatalog = useCallback((data: { keys: TrialCatalogKey[]; trialCatalog?: TrialCatalog }, uid: string) => {
    setKeyUsage(keyProductUsage(data.keys));
    if (!data.trialCatalog || !Array.isArray(data.keys)) {
      setTrialSelection(null);
      throw new Error('Trial catalog verification unavailable.');
    }
    if (data.keys.length > TRIAL_MAX_ACTIVE_KEYS) {
      setTrialSelection(null);
      throw new Error(`Free Trial permits up to ${TRIAL_MAX_ACTIVE_KEYS} active keys. Revoke additional keys in API Keys first.`);
    }
    const verifiedKeys = data.keys.map(key => ({ ...key,
      productIds: [...new Set([...key.linkedProductIds, ...Object.keys(key.linkedVariantSelections)])] }));
    const productIds = verifiedKeys.flatMap(key => key.productIds);
    if (trialSelectionState(data.trialCatalog, verifiedKeys, new Set()).mode === 'blocked') {
      setTrialSelection(null);
      throw new Error('Trial catalog and API key state could not be verified. Reload Products to retry.');
    }
    setTrialSelection({ uid, catalog: data.trialCatalog, keys: verifiedKeys });
    setSelectedProducts(previous => new Set([...previous].filter(id => !productIds.includes(id))));
    setSelectedVariants(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !productIds.includes(id))));
  }, []);


  // ==================== EFFECTS ====================

  useEffect(() => {
    if (!user || !activeSegment) return;
    const refresh = createCatalogRefresh({ segment: activeSegment,
      read: signal => loadSegmentCatalog(async (offset, pageSignal) => {
        const query = new URLSearchParams({ businessSegment: activeSegment, limit: '1000', offset: String(offset) });
        const response = await fetch(`${API_URL}/api/v1/products?${query}`, { signal: pageSignal, cache: 'no-store' });
        if (!response.ok) throw new Error('Catalog unavailable.');
        return await response.json() as CatalogPage;
      }, activeSegment, signal),
      onState: source => {
        setCatalogSource(source);
        if (source.status === 'ready') setProducts(previous => {
          const retained = activeSegment === 'All' ? [] : previous.filter(product => product.segment !== activeSegment);
          return [...new Map([...retained, ...source.products].map(product => [product.id, product])).values()];
        });
      },
    });
    catalogRefresh.current = refresh;
    void Promise.resolve().then(refresh.refresh);
    return () => {
      refresh.stop();
      if (catalogRefresh.current === refresh) catalogRefresh.current = null;
    };
  }, [activeSegment, user]);

  const refreshKeyUsage = useCallback(async (signal?: AbortSignal) => {
    if (!user) return;
    try {
      const data = await apiKeyRequest(user, '', { signal });
      if (!signal?.aborted) setKeyUsage(keyProductUsage(data.keys));
    } catch { /* usage labels are presentation-only; keep the last verified list */ }
  }, [user]);

  useEffect(() => {
    // Trial accounts receive the same key list through the verified trial-catalog read below.
    if (activeTrial || !user) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => refreshKeyUsage(controller.signal));
    return () => controller.abort();
  }, [activeTrial, user, refreshKeyUsage]);

  useEffect(() => {
    if (!activeTrial || !user) return;
    const controller = new AbortController();
    void apiKeyRequest(user, '', { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      receiveTrialCatalog(data, user.uid);
      setSelectionError('');
    }).catch(error => { if (!controller.signal.aborted) setSelectionError(error instanceof Error ? error.message : 'Catalog verification unavailable.'); });
    return () => controller.abort();
  }, [activeTrial, user, receiveTrialCatalog]);

  // ==================== COMPUTED VALUES ====================

  const getFilteredProducts = useCallback(() => {
    const visibleIds = new Set(currentCatalog?.status === 'ready' ? currentCatalog.products.map(product => product.id) : []);
    return searchCatalog(scopeCustomerProducts(products, appUser).filter(product => visibleIds.has(product.id)), searchQuery);
  }, [products, currentCatalog, searchQuery, appUser]);

  const searchedProducts = useMemo(() => getFilteredProducts(), [getFilteredProducts]);
  const categoryOptions = useMemo(() => productCategories(searchedProducts), [searchedProducts]);
  const activeCategory = productCategory === ALL_CATEGORIES || categoryOptions.includes(productCategory) ? productCategory : ALL_CATEGORIES;
  const activeKeyUsageFilter: KeyUsageFilter = keyUsageFilter.startsWith('key:')
    && !keyUsage.some(key => `key:${key.id}` === keyUsageFilter) ? 'all' : keyUsageFilter;
  const filteredProducts = searchedProducts.filter(product => {
    // "Checked" means picked in this session. Picked products stay where they
    // are under the selection and API key filters so a click never hides them.
    const isPicked = selectedProducts.has(product.id!);
    if (selectionFilter === 'selected' && !isPicked) return false;
    return matchesCategory(product, activeCategory) && (isPicked
      || (selectionFilter !== 'selected' && matchesKeyUsage(product.id!, activeKeyUsageFilter, keyUsage, keyNames)));
  });
  // Only one page of cards is drawn; thousands of cards at once made the page lag.
  // Search, filters and Select All still cover every matching product.
  const [productPage, setProductPage] = useState(0);
  const productPageCount = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const currentProductPage = Math.min(productPage, productPageCount - 1);
  const pageStart = currentProductPage * PRODUCTS_PER_PAGE;
  const pageProducts = filteredProducts.slice(pageStart, pageStart + PRODUCTS_PER_PAGE);
  useEffect(() => { setProductPage(0); }, [searchQuery, selectionFilter, productCategory, keyUsageFilter, paidSegment]);
  const goToProductPage = (next: number) => {
    setProductPage(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const selectionPlaygroundHref = playgroundHref(products, selectedProducts, selectedVariants);
  const presentationFiltered = selectionFilter !== 'all' || activeCategory !== ALL_CATEGORIES || activeKeyUsageFilter !== 'all';
  const resetPresentationFilters = () => { setSelectionFilter('all'); setProductCategory(ALL_CATEGORIES); setKeyUsageFilter('all'); };
  // Search/segment emptiness is evaluated before the presentation-only selection filter.
  const catalogView = catalogPresentationState(currentCatalog, searchedProducts.length, searchQuery);
  const trialSelectionAllowed = trialState.canToggle && trialReady && !upgradeRequired && !generating;
  const selectableIds = useMemo(() => [
    // A new Trial key may reuse included products without consuming slots.
    ...(trialNewKey && trialSelectionAllowed ? filteredProducts.map(product => product.id!)
      .filter(id => trialState.included.has(id) && !selectedProducts.has(id)) : []),
    ...catalogSelectableIds(filteredProducts, selectedProducts, activeTrial ? {
      // Only products outside the shared Trial catalog consume remaining slots.
      included: trialState.included, remaining: trialState.remaining - trialState.pending.size + selectedProducts.size,
      allowed: trialSelectionAllowed,
    } : null),
  ], [trialNewKey, trialSelectionAllowed, filteredProducts, trialState, selectedProducts, activeTrial]);

  const cartSummary = useMemo((): CartSummary => {
    const selectedItems = selectedLinkedProducts(products, appUser, selectedProducts);
    const bySegment = selectedItems.reduce((acc, p) => {
      acc[p.segment] = (acc[p.segment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalProducts: selectedItems.length,
      bySegment,
      productIds: selectedItems.map(product => product.id!),
      linkedProducts: selectedItems.map(product => ({ id: product.id!, name: product.name || 'Product unavailable' }))
    };
  }, [products, selectedProducts, appUser]);

  // ==================== PRODUCT SELECTION ====================

  const toggleProduct = useCallback((product: Product) => {
    if (upgradeRequired || !trialReady || generating) return;
    const productId = product.id!;
    if (activeTrial) {
      if (!trialState.canToggle) return;
      const reused = [...selectedProducts].filter(id => trialState.included.has(id));
      let next: Set<string>;
      if (trialState.included.has(productId)) {
        if (!trialNewKey) return;
        next = new Set(selectedProducts);
        if (!next.delete(productId)) next.add(productId);
      } else {
        const pending = toggleTrialPending(trialState.pending, productId, trialState.included, trialState.remaining, trialState.canToggle);
        if (pending.has(productId) === trialState.pending.has(productId)) return;
        next = new Set([...reused, ...pending]);
      }
      setSelectedProducts(next);
      setSelectedVariants(previous => {
        const variants = { ...previous };
        if (!next.has(productId)) delete variants[productId];
        else if (product.variants?.length) variants[productId] = new Set(product.variants.map(v => `${v.flavor || ''}|${v.size || ''}`));
        return variants;
      });
      return;
    }
    setSelectedProducts((prevProds) => {
      const newProds = new Set(prevProds);
      const isCurrentlySelected = newProds.has(productId);
      
      if (isCurrentlySelected) {
        newProds.delete(productId);
      } else {
        newProds.add(productId);
      }
      
      setSelectedVariants((prevVars) => {
        const newVars = { ...prevVars };
        if (isCurrentlySelected) {
          delete newVars[productId];
        } else if (product.variants && product.variants.length > 0) {
          newVars[productId] = new Set(product.variants.map(v => `${v.flavor || ''}|${v.size || ''}`));
        }
        return newVars;
      });
      
      return newProds;
    });
  }, [activeTrial, trialReady, upgradeRequired, generating, trialState, trialNewKey, selectedProducts]);

  const toggleVariant = useCallback((e: React.MouseEvent, productId: string, variantId: string) => {
    e.stopPropagation();
    if (upgradeRequired || !trialReady || generating) return;
    if (activeTrial && (!trialState.canToggle || (trialState.included.has(productId)
      ? !trialNewKey : !trialState.pending.has(productId) && !trialState.canSelect))) return;
    setClickedVariant(previous => ({ ...previous, [productId]: variantId }));
    
    setSelectedVariants((prevVars) => {
      const newMap = { ...prevVars };
      const productVars = new Set(newMap[productId] || []);
      
      if (productVars.has(variantId)) {
        productVars.delete(variantId);
      } else {
        productVars.add(variantId);
      }
      
      const hasVariants = productVars.size > 0;
      if (hasVariants) {
        newMap[productId] = productVars;
      } else {
        delete newMap[productId];
      }
      
      // Sync selectedProducts
      setSelectedProducts((prevProds) => {
        const newProds = new Set(prevProds);
        if (hasVariants) newProds.add(productId);
        else newProds.delete(productId);
        return newProds;
      });
      
      return newMap;
    });
  }, [activeTrial, trialReady, upgradeRequired, generating, trialState, trialNewKey]);

  const selectAllInView = useCallback(() => {
    if (upgradeRequired || !trialReady || generating || (activeTrial && !trialState.canToggle)) return;
    const next = new Set(selectedProducts);
    for (const id of selectableIds) next.add(id);
    setSelectedProducts((prevProds) => {
      return next.size >= prevProds.size ? next : prevProds;
    });
    setSelectedVariants((prevVars) => {
      const newVars = { ...prevVars };
      const additions = new Set(selectableIds);
      filteredProducts.forEach(p => {
        if (additions.has(p.id!) && p.variants && p.variants.length > 0) {
          newVars[p.id!] = new Set(p.variants.map(v => `${v.flavor || ''}|${v.size || ''}`));
        }
      });
      return newVars;
    });
  }, [filteredProducts, selectedProducts, activeTrial, upgradeRequired, trialReady, trialState.canToggle, generating, selectableIds]);

  const clearSelection = useCallback(() => {
    if (upgradeRequired || !trialReady || generating) return;
    setSelectedProducts(new Set());
    setSelectedVariants({});
  }, [trialReady, upgradeRequired, generating]);

  // ==================== API KEY GENERATION ====================

  const handleGenerateApiKey = async () => {
    if (!canGenerate || !trialReady || (activeTrial && !trialCanGenerate)) return;
    if (!keyName.trim()) {
      alert("Please enter a name for your API key");
      return;
    }
    
    setGenerating(true);
    
    try {
      const { auth } = await import("@/lib/supabase/config");
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        alert("You must be logged in to generate an API key.");
        return;
      }
      const idToken = await currentUser.getIdToken();

      const selectedItems = selectedLinkedProducts(products, appUser, selectedProducts);
      const selectedProductsList = selectedItems
        .map(p => ({ id: p.id!, name: p.name, sku: p.sku || '', segment: p.segment }));

      const finalLinkedProductIds: string[] = [];
      const finalLinkedVariantSelections: Record<string, string[]> = {};

      selectedItems.forEach(product => {
        const productId = product.id!;
        
        const selectedVars = selectedVariants[productId];
        if (product.variants && product.variants.length > 0 && selectedVars && selectedVars.size > 0 && selectedVars.size < product.variants.length) {
          finalLinkedVariantSelections[productId] = Array.from(selectedVars);
        } else {
          finalLinkedProductIds.push(productId);
        }
      });

      const response = await fetch(`${API_URL}/api/v1/api-keys/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          userEmail: currentUser.email || "",
          keyName: keyName.trim(),
          // SECURITY: Do NOT send plan - let backend determine from user's stored account data
          linkedProducts: selectedProductsList,
          linkedProductIds: finalLinkedProductIds,
          linkedVariantSelections: finalLinkedVariantSelections
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'UPGRADE_REQUIRED') {
          setPaywalledUserId(user?.uid ?? null);
          setShowGenModal(false);
        }
        throw new Error(generationErrorMessage(data));
      }

      setGeneratedKeyName(typeof data.name === 'string' && data.name.trim() ? data.name : keyName.trim());
      setGeneratedKey(data.key);
      // Trial refresh clears selections that are now included; keep the success view's list.
      setGeneratedLinkedProducts(selectedItems.map(product => ({ id: product.id!, name: product.name || 'Product unavailable' })));
      setTrialNewKey(false);
      // The new key's products move to "Added to a key" and leave the default view.
      setSelectedProducts(new Set());
      setSelectedVariants({});
      if (activeTrial && user) {
        invalidateAccountUsage(user.uid);
        receiveTrialCatalog(await apiKeyRequest(user), user.uid);
      } else void refreshKeyUsage();
    } catch (error) {
      console.error("Error generating API key:", error);
      const message = error instanceof TypeError && error.message === "Failed to fetch"
        ? "Unable to connect to InventaAPI. Please check that the API server is running and try again."
        : error instanceof Error ? error.message : "Unable to create your API key. Please try again later.";
      alert(message);
    } finally {
      setGenerating(false);
    }
  };

  const addTrialProducts = async () => {
    if (!user || !trialKey || !canGenerate || generating || !trialState.canSubmit) return;
    setGenerating(true); setSelectionError('');
    try {
      const full: string[] = [];
      const partial: Record<string, string[]> = {};
      for (const product of selectedLinkedProducts(products, appUser, trialState.pending)) {
        const variants = selectedVariants[product.id!];
        if (variants?.size && product.variants && variants.size < product.variants.length) partial[product.id!] = [...variants];
        else full.push(product.id!);
      }
      await apiKeyRequest(user, `/${trialKey.id}/products`, { method: 'PATCH', body: JSON.stringify({
        ...trialAdditionScope(trialKey, full, partial),
      }) });
      invalidateAccountUsage(user.uid);
      receiveTrialCatalog(await apiKeyRequest(user), user.uid);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : 'Unable to add products.');
      // A version conflict or ambiguous network outcome must reload persisted scope,
      // not erase existing products or invent a successful projected count.
      try {
        receiveTrialCatalog(await apiKeyRequest(user), user.uid);
        invalidateAccountUsage(user.uid);
      } catch { /* keep the last verified persisted summary */ }
    }
    finally { setGenerating(false); }
  };

  const handleCopyAndClose = useCallback(async () => {
    if (generatedKey) {
      try { await navigator.clipboard.writeText(generatedKey); }
      catch { alert("Copy failed. Save the displayed API key manually before leaving."); return; }
      setCopied(true);
      setTimeout(() => {
        router.push('/dashboard/api-keys');
      }, COPY_REDIRECT_DELAY);
    }
  }, [generatedKey, router]);

  // Copies the one-time secret while keeping it on screen, unlike handleCopyAndClose.
  const copyGeneratedKey = useCallback(async () => {
    if (!generatedKey) return;
    try { await navigator.clipboard.writeText(generatedKey); }
    catch { alert("Copy failed. Select the displayed API key and copy it manually."); return; }
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), COPY_REDIRECT_DELAY);
  }, [generatedKey]);

  const handleDownloadEnv = useCallback(() => {
    if (!generatedKey) return;
    
    const content = `# DaaS API Configuration
NEXT_PUBLIC_DAAS_API_URL=${API_URL}
DAAS_API_KEY=${generatedKey}
`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ".env.local";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generatedKey]);

  const handleDownloadPostman = useCallback(() => {
    if (!generatedKey) return;
    
    const collection = {
      info: {
        name: "DaaS API Integration",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      item: [
        {
          name: "Get Catalog",
          request: {
            method: "GET",
            header: [{ key: "x-api-key", value: generatedKey }],
            url: `${API_URL}/daas/v1/catalog`
          }
        }
      ]
    };
    
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "daas-api-postman.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generatedKey]);



  // ==================== RENDER ====================

  const openGenerationModal = () => {
    setShowGenModal(true);
    setGeneratedKey(null);
    setGeneratedKeyName(null);
    setKeyName("");
    setCopied(false);
    setKeyCopied(false);
  };
  const addSelectionDisabled = !canGenerate || generating || !trialState.canSubmit || cartSummary.totalProducts === 0;
  const generateSelectionDisabled = !canGenerate || !trialReady || generating || (activeTrial && !trialCanGenerate);
  const returnToSummary = () => summaryElement?.scrollIntoView({ block: 'center' });

  return (
    <div className="w-full px-6 max-sm:px-0 lg:px-8 min-w-0 space-y-4 pb-10">
      {hasPendingSelection && summaryViewport?.target === summaryElement && summaryViewport?.above && headerSlot && createPortal(
        <div role="group" aria-label="Docked product selections" className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={returnToSummary}
            aria-label={`Return to product selections, ${trialPendingCount ?? cartSummary.totalProducts} selected${trialPendingCount !== null ? ' to add' : ''}`}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/25">
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            {trialPendingCount ?? cartSummary.totalProducts} selected
          </button>
          <div className="hidden xl:flex items-center gap-2">
            {trialAddMode ? <button type="button" onClick={addTrialProducts}
              disabled={addSelectionDisabled}
              className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Add Selected Products</button>
              : !upgradeRequired && <button type="button" onClick={openGenerationModal} disabled={generateSelectionDisabled}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Generate API Key</button>}
            <button type="button" onClick={clearSelection} disabled={generating}
              aria-label={activeTrial ? 'Clear new selections' : 'Clear all selected products'}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50">Clear</button>
            <Link href={selectionPlaygroundHref}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700">Playground</Link>
          </div>
        </div>, headerSlot)}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-[16rem] flex-1 space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-white">Product Catalog</h1>
          <p className="text-sm text-slate-400">Select products to include in your custom API endpoint</p>
          {activeTrial && <p role="status" aria-label="Free Trial status" className="text-xs leading-5 text-slate-400">
            {trialCatalog ? <>Free Trial · 7 days · Included: {trialCatalog.productsIncluded}/{TRIAL_MAX_PRODUCTS} · Slots left: {trialRemainingSlots(trialCatalog.productsIncluded)} · Active keys: {trialCatalog.activeKeys}/{TRIAL_MAX_ACTIVE_KEYS}</>
              : 'Verifying persisted Trial catalog…'}
          </p>}
        </div>
        {/* Page actions. When they scroll out of view with products selected, a compact
            copy docks into the top bar (above). */}
        {/* Main buttons stay on the first row in the same place; the selection actions
            (count, Clear, Playground) appear on a row below them while products are picked.
            When this group scrolls out of view a compact copy docks into the top bar. */}
        <div ref={setSummaryElement} role="group" aria-label="Catalog actions" className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-3 [&>*]:whitespace-nowrap">
            {trialAddMode ? <button onClick={addTrialProducts}
              disabled={!canGenerate || generating || !trialState.canSubmit || cartSummary.totalProducts === 0}
              className="px-6 py-3 rounded-xl bg-indigo-500 text-white disabled:opacity-50">Add Selected Products</button> : !upgradeRequired && (selectedProducts.size > 0 || activeTrial) && (
              <button
                disabled={!canGenerate || !trialReady || generating || (activeTrial && !trialCanGenerate)}
                onClick={openGenerationModal}
                className="px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                aria-label={`Generate API Key for ${selectedProducts.size} selected products`}
              >
                <Key className="w-4 h-4" />
                Generate API Key ({selectedProducts.size} products)
              </button>
            )}
            {activeTrial && trialState.mode === 'existing-key' && trialKeys.length === 1 && !upgradeRequired && <button type="button"
              onClick={() => { setTrialNewKey(!trialNewKey); setSelectedProducts(new Set()); setSelectedVariants({}); }}
              disabled={generating || (!trialNewKey && trialKeys.length >= TRIAL_MAX_ACTIVE_KEYS)}
              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium text-slate-200 disabled:opacity-50">
              {trialNewKey ? 'Add to existing key instead' : 'Create another API key'}
            </button>}
            {upgradeRequired && <Link href="/dashboard/settings#subscription" className="text-sm font-semibold text-cyan-300">Free Trial Ended — Upgrade to Pro to generate a key</Link>}
            <button
              onClick={() => setShowAddProductModal(true)}
              className="px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              aria-label="Add a new product (submit it for review)"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          </div>
          {hasPendingSelection && <div className="flex flex-wrap items-center justify-end gap-2 [&>*]:whitespace-nowrap">
            {hasPendingSelection && <span role="status" className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShoppingCart className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              {trialPendingCount !== null ? `${trialPendingCount} selected to add` : `${cartSummary.totalProducts} selected`}
            </span>}
            {hasPendingSelection && <>
              <button
                onClick={clearSelection}
                disabled={generating}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium text-slate-200 transition-colors disabled:opacity-50"
                aria-label={activeTrial ? 'Clear new selections' : 'Clear all selected products'}
              >
                {activeTrial ? 'Clear New Selections' : 'Clear All'}
              </button>
              <Link
                href={selectionPlaygroundHref}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium text-slate-200 transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Test in Playground
              </Link>
            </>}
          </div>}
        </div>
      </div>

      {activeTrial && trialCatalog && trialCapacityMessage(trialCatalog.productsIncluded) &&
        <p role="status" className="text-sm text-slate-300">{trialCapacityMessage(trialCatalog.productsIncluded)}</p>}
      {selectionError && <p role="alert" className="text-red-300">{selectionError}</p>}

      {/* Controls, summary, and product cards share the normal page scroll. */}
      <section aria-label="Product catalog workspace" className="min-w-0 space-y-4">
      {/* Filter Row */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {/* Search Bar */}
        <div className="relative min-w-0 basis-full xl:basis-auto xl:flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </div>
          <input
            id="product-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products, SKU..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 hover:bg-slate-700/80 hover:border-slate-600 transition-all"
            aria-label="Search products by name or SKU"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* One authoritative availability badge for the current catalog scope. */}
          <span role="status" aria-label="Catalog availability" className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            activeSegment === "All" ? "bg-slate-800 text-slate-300 border-slate-700" :
            activeSegment === "Pharmacy" ? "bg-green-500/15 text-green-400 border-green-500/30" :
            activeSegment === "Hardware" ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
            "bg-blue-500/15 text-blue-400 border-blue-500/30"
          }`}>
            {activeSegment === "All" ? <>Product Available: {productAvailable ?? '—'}</> : <>{productAvailable ?? '—'} {activeSegment}</>}
            {searchQuery.trim() && currentCatalog?.status === 'ready' ? ` · ${filteredProducts.length} results` : ''}
          </span>

        {/* Category Dropdown */}
        <div className="relative">
          <select
            id="category-filter"
            value={activeSegment}
            onChange={(e) => setActiveSegment(e.target.value)}
            disabled={isFreePlan(appUser?.plan)}
            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm font-medium text-slate-200 focus:outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 hover:bg-slate-700/80 hover:border-slate-600 transition-all cursor-pointer min-w-[170px] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Filter products by industry"
          >
            {isFreePlan(appUser?.plan) ? (
              <option value={activeSegment}>Industry: {activeSegment}</option>
            ) : (
              <>
                <option value="All">Industry: All</option>
                <option value="Hardware">Industry: Hardware</option>
                <option value="Grocery">Industry: Grocery</option>
                <option value="Pharmacy">Industry: Pharmacy</option>
              </>
            )}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="min-w-0">
          <label htmlFor="selection-filter" className="sr-only">Filter products by selection</label>
          <select id="selection-filter" value={selectionFilter}
            onChange={event => setSelectionFilter(event.target.value as typeof selectionFilter)}
            className="max-w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
            <option value="all">Selection: All</option>
            <option value="selected">Selection: Checked</option>
            <option value="not-selected">Selection: Not checked</option>
          </select>
        </div>

        <div className="min-w-0">
          <label htmlFor="product-category-filter" className="sr-only">Filter products by product category</label>
          <select id="product-category-filter" value={activeCategory}
            onChange={event => setProductCategory(event.target.value)}
            disabled={categoryOptions.length === 0}
            className="max-w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50">
            <option value={ALL_CATEGORIES}>Category: All</option>
            {categoryOptions.map(category => <option key={category} value={category}>Category: {category}</option>)}
          </select>
        </div>

        <div className="min-w-0">
          <label htmlFor="key-usage-filter" className="sr-only">Filter products by API key</label>
          <select id="key-usage-filter" value={activeKeyUsageFilter}
            onChange={event => setKeyUsageFilter(event.target.value as KeyUsageFilter)}
            className="max-w-full rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
            <option value="all">API key: All</option>
            {keyUsage.map(key => <option key={key.id} value={`key:${key.id}`}>API key: {key.name}</option>)}
          </select>
        </div>

        {/* Select All button */}
        {filteredProducts.length > 0 && (
          <button
            onClick={selectAllInView}
            disabled={selectableIds.length === 0 || upgradeRequired || !trialReady || generating}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-sm font-medium text-slate-300 transition-all whitespace-nowrap"
            aria-label={`Select ${selectableIds.length} new products in view`}
            title="Checks every product currently shown by the filters above"
          >
            Select All ({selectableIds.length})
          </button>
        )}
      </div>

      <div role="region" aria-label="Product list" className="min-w-0 lg:p-1">
      {/* Product Grid */}
      {catalogView === 'loading' ? (
        <div className="grid gap-4" style={PRODUCT_GRID_STYLE}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-6 animate-pulse">
              <div className="w-full h-32 bg-slate-800 rounded-lg mb-4" />
              <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : catalogView === 'error' ? (
        <div role="alert" className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
            <Package className="w-8 h-8 text-amber-300" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Catalog unavailable</h2>
          <p className="text-sm text-slate-400">We couldn&apos;t load the verified product catalog right now.</p>
          <button type="button" onClick={() => catalogRefresh.current?.refresh()} className="text-sm text-indigo-300 mt-2">Retry catalog</button>
        </div>
      ) : catalogView === 'empty-segment' || catalogView === 'empty-search' ? (
        <ProductCatalogEmptyState
          kind={catalogView === 'empty-search' ? 'search' : 'segment'}
          segment={activeSegment}
          searchQuery={searchQuery}
          onClearSearch={() => setSearchQuery("")}
        />
      ) : filteredProducts.length === 0 && presentationFiltered ? (
        <div role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
          <h2 className="text-lg font-semibold text-white">{selectionFilter === 'selected' ? 'No selected products.'
            : selectionFilter === 'not-selected' ? 'No unselected products.'
              : activeKeyUsageFilter === 'unused' ? 'Every product here is already in an API key.' : 'No products match these filters.'}</h2>
          <p className="mt-2 text-sm text-slate-400">{searchQuery.trim() ? 'Within your current search and business segment.' : 'Within your current business segment.'}</p>
          <button type="button" onClick={resetPresentationFilters} className="mt-3 text-sm text-indigo-300">View All Products</button>
        </div>
      ) : (
        <div className="grid gap-4" style={PRODUCT_GRID_STYLE}>
          {pageProducts.map((product) => {
            const isIncluded = activeTrial && trialState.included.has(product.id!);
            // A new Trial key may reuse included products; only new products need a free slot.
            const selectionDisabled = upgradeRequired || !trialReady || generating || (activeTrial && (!trialState.canToggle
              || (isIncluded ? !trialNewKey : !trialState.pending.has(product.id!) && !trialState.canSelect)));
            // Only products picked in this session are highlighted; products
            // already in a key carry a quiet note instead.
            const isSelected = selectedProducts.has(product.id!);
            const showIncludedScope = isIncluded && !selectedProducts.has(product.id!);
            const productVars = showIncludedScope ? new Set(includedVariants[product.id!] ?? product.variants?.map(v => `${v.flavor || ''}|${v.size || ''}`)) : selectedVariants[product.id!] || new Set();
            const totalVars = product.variants ? product.variants.length : 0;
            const isPartial = isSelected && totalVars > 0 && productVars.size > 0 && productVars.size < totalVars;
            
            return (
              <div
                key={product.id}
                onClick={() => toggleProduct(product)}
                aria-disabled={selectionDisabled || undefined}
                aria-label={`${product.name}${isIncluded ? ', Included' : isSelected ? ', Selected' : ''}`}
                style={{ borderWidth: isSelected ? 2 : 1, borderColor: isSelected ? '#6366f1' : 'var(--color-slate-700)',
                  boxShadow: isSelected ? '0 0 0 1px #818cf8, 0 4px 20px rgb(99 102 241 / 0.2)' : undefined }}
                className={`glass-card rounded-xl transition-all overflow-hidden flex h-[24rem] flex-col ${selectionDisabled ? 'cursor-default' : 'cursor-pointer hover:scale-[1.02]'} ${
                  isSelected
                    ? "border-2 border-indigo-500 shadow-lg shadow-indigo-500/20"
                    : "border border-slate-700 hover:border-slate-600"
                }`}
              >
                {/* Image Area */}
                <div key={productImageSource(variantPhoto(product, productVars, clickedVariant[product.id!]))} className="relative w-full h-44 shrink-0 bg-slate-800 overflow-hidden">
                  {productImageSource(variantPhoto(product, productVars, clickedVariant[product.id!])) ? (
                    <img
                      src={productImageSource(variantPhoto(product, productVars, clickedVariant[product.id!]))}
                      alt={product.name}
                      className="w-full h-full object-contain p-5 pt-9"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={showProductImageFallback}
                    />
                  ) : null}
                  {/* Fallback icon (shown if image fails or missing) */}
                  <div className={`absolute inset-0 flex items-center justify-center ${productImageSource(variantPhoto(product, productVars, clickedVariant[product.id!])) ? 'hidden' : ''}`}>
                    <Database className="w-14 h-14 text-slate-600" />
                  </div>

                  {/* Top overlay row: segment badge only */}
                  <div className="absolute top-0 left-0 right-0 flex items-start justify-end p-3">
                    {/* Segment badge */}
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold backdrop-blur-sm shadow-md ${
                      product.segment === "Pharmacy" ? "bg-green-500/80 text-white" :
                      product.segment === "Hardware" ? "bg-orange-500/80 text-white" :
                      "bg-blue-500/80 text-white"
                    }`}>
                      {product.segment}
                    </span>
                  </div>

                  {/* Selected overlay tint */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none" />
                  )}
                </div>

                {/* Card Body: every card has the same height; a long variant list scrolls
                    inside its card instead of stretching the whole row. */}
                <div className="p-4 flex flex-1 flex-col min-w-0 min-h-0">
                  <h3 className="text-sm font-bold text-white mb-1 line-clamp-1">{product.name}</h3>
                  {isIncluded && <span className="inline-flex items-center gap-1 text-xs text-slate-400 mb-1"><Check className="w-3 h-3" aria-hidden="true" />Included</span>}
                  {keyNames.has(product.id!) && <p className="flex items-center gap-1 text-xs text-emerald-300 mb-1 min-w-0">
                    <Key className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">In key: {keyNames.get(product.id!)!.join(', ')}</span>
                  </p>}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{product.description}</p>

                  {/* Variant chips */}
                  {product.variants && product.variants.length > 0 ? (
                    <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 mt-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onClick={e => e.stopPropagation() /* Prevent double toggle if clicking container */}>
                      {product.variants.map((v, i) => {
                        const variantId = `${v.flavor || ''}|${v.size || ''}`;
                        const isVarSelected = productVars.has(variantId);
                        const isVarIncluded = isVarSelected && showIncludedScope;
                        return (
                          <button
                            key={i}
                            onClick={(e) => toggleVariant(e, product.id!, variantId)}
                            disabled={selectionDisabled}
                            title={[v.flavor, v.size].filter(Boolean).join(' · ') || 'Variant'}
                            className={`inline-flex h-5 max-w-full items-center gap-1 px-2 rounded text-[10px] leading-none font-medium whitespace-nowrap transition-colors ${
                              isVarIncluded
                                ? 'bg-slate-800/80 text-emerald-300/90 border border-emerald-700/40'
                                : isVarSelected
                                ? 'bg-indigo-500 text-white border border-indigo-600'
                                : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-300'
                            }`}
                          >
                            {isVarSelected && <Check className="w-2.5 h-2.5 shrink-0" />}
                            <span className="truncate">{[v.flavor, v.size].filter(Boolean).join(' · ') || 'Variant'}</span>
                          </button>
                        );
                      })}
                      {hasNearExpiry(product) && (
                        <span className="inline-flex h-5 items-center gap-1 px-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] leading-none text-amber-400 font-medium">
                          <AlertTriangle className="w-2.5 h-2.5" /> Expiring soon
                        </span>
                      )}
                    </div>
                  ) : (
                    getBaseSize(product) ? (
                      <div className="mt-2">
                        <span className="px-2 py-0.5 rounded bg-slate-700/50 border border-slate-600/50 text-[10px] text-slate-300 font-medium">
                          Size: {getBaseSize(product)}
                        </span>
                      </div>
                    ) : null
                  )}

                  <div aria-hidden="true" className="h-3 shrink-0" />
                  <div className="flex shrink-0 items-center justify-between mt-auto pt-3 border-t border-slate-700/60">
                    <span className="text-xs text-slate-500">
                      {product.variants && product.variants.length > 0
                        ? `${product.variants.length} variant${product.variants.length !== 1 ? 's' : ''}`
                        : <span className="font-mono">{product.sku || '—'}</span>
                      }
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {productPageCount > 1 && (
        <nav aria-label="Product pages" className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>Showing {(pageStart + 1).toLocaleString()}–{(pageStart + pageProducts.length).toLocaleString()} of {filteredProducts.length.toLocaleString()} products</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => goToProductPage(currentProductPage - 1)} disabled={currentProductPage === 0}
              className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 disabled:opacity-40">Previous</button>
            <span>Page {currentProductPage + 1} of {productPageCount}</span>
            <button type="button" onClick={() => goToProductPage(currentProductPage + 1)} disabled={currentProductPage >= productPageCount - 1}
              className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 disabled:opacity-40">Next</button>
          </span>
        </nav>
      )}
      </div>
      </section>

      {/* Generate API Key Modal */}
      {showGenModal && canGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl border border-slate-700 shadow-2xl p-8 animate-in fade-in zoom-in duration-200 relative">
            <button
              onClick={() => {
                setShowGenModal(false);
                setGeneratedKey(null);
                setGeneratedKeyName(null);
                setCopied(false);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            {!generatedKey ? (
              <>
                <div className="w-14 h-14 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-5">
                  <Key className="w-7 h-7 text-indigo-400" />
                </div>
                <h3 className="text-2xl font-bold text-white text-center mb-1">Generate API Key</h3>
                <p className="text-sm text-slate-400 text-center mb-3">{GENERATION_POLICY} API request quotas are separate.</p>
                <p className="text-sm text-slate-400 text-center mb-6">
                  This key will be linked to <span className="text-indigo-400 font-semibold">{cartSummary.totalProducts} selected product{cartSummary.totalProducts !== 1 ? 's' : ''}</span>.
                </p>
                <div className="mb-6">
                  <label className="text-sm font-medium text-slate-300 mb-2 block">KEY NAME <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g., Production POS, Dev Server"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-500"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerateApiKey()}
                  />
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 mb-6">
                  <p className="text-xs text-slate-400 mb-2 font-medium">LINKED PRODUCTS</p>
                  {cartSummary.linkedProducts.length === 0 ? (
                    <p className="text-sm text-slate-500">No products selected. This key will not be linked to a specific product.</p>
                  ) : (
                    <ul className="max-h-36 overflow-y-auto space-y-1 text-sm text-slate-200" aria-label="Selected linked products">
                      {cartSummary.linkedProducts.map(product => <li key={product.id} className="truncate">{product.name}</li>)}
                    </ul>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowGenModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerateApiKey}
                    disabled={!keyName.trim() || generating || !trialReady || (activeTrial && !trialCanGenerate)}
                    className="flex-[2] px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {generating ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Generating...</>
                    ) : (
                      <><Key className="w-4 h-4" />Generate Key</>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                  <Check className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-2xl font-bold text-white text-center mb-2">API Key Generated!</h3>
                <div className="bg-slate-950 border border-indigo-500/40 rounded-xl p-4 mb-4">
                  <p className="text-xs font-semibold text-indigo-300 mb-2">Key Name</p>
                  <p className="text-xl font-bold text-white break-words">{generatedKeyName}</p>
                </div>
                <p className="text-sm text-slate-400 text-center mb-6">
                  Your key is active and linked to the products shown above. <strong className="text-amber-400">Copy it now</strong> — you won't see it again.
                </p>
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 mb-4">
                  <p className="text-xs text-slate-400 mb-2 font-medium">LINKED PRODUCTS</p>
                  {generatedLinkedProducts.length === 0 ? (
                    <p className="text-sm text-slate-500">No products selected.</p>
                  ) : (
                    <ul className="max-h-28 overflow-y-auto space-y-1 text-sm text-slate-200">
                      {generatedLinkedProducts.map(product => <li key={product.id} className="truncate">{product.name}</li>)}
                    </ul>
                  )}
                </div>
                <div className="bg-slate-950 border-2 border-emerald-500/30 rounded-xl p-4 mb-6">
                  <p className="text-xs font-medium text-emerald-400 mb-2">API Key — copy it now (you can copy it again later from API Keys)</p>
                  <div className="flex items-start gap-2 bg-slate-900 rounded-lg p-3 mb-3">
                    <span className="min-w-0 flex-1 break-all font-mono text-sm text-emerald-300 select-all">{generatedKey}</span>
                    <button type="button" onClick={() => void copyGeneratedKey()}
                      aria-label={keyCopied ? 'API key copied' : 'Copy API key'} title="Copy API key"
                      className="shrink-0 rounded-md border border-emerald-500/30 p-1.5 text-emerald-300 hover:bg-emerald-500/10">
                      {keyCopied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                <button
                  onClick={handleCopyAndClose}
                  className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 mb-3"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {copied ? "Copied" : "Copy API Key"}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleDownloadEnv}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all text-sm border border-slate-700"
                  >
                    Download .env
                  </button>
                  <button
                    onClick={handleDownloadPostman}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-all text-sm border border-slate-700"
                  >
                    Download Postman
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Product to existing API key modal */}
      <AddProductModal
        open={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
      />
    </div>
  );
}
