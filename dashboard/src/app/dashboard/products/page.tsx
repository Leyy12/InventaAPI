"use client";
import { TRIAL_MAX_PRODUCTS } from "../../../../../functions/entitlement-limits.mjs";
import { trialCapacityMessage, trialRemainingSlots } from '@/lib/trial-display.mjs';
import { trialSelectionState, toggleTrialPending, trialAdditionScope, type TrialCatalogKey } from '@/lib/trial-catalog-selection';
import { invalidateAccountUsage } from '@/lib/account-usage-events';
import type { TrialCatalog } from '@/lib/quota-refresh';
import { GENERATION_POLICY, generationErrorMessage } from '@/lib/api-key-generation';

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Database, ShoppingCart, Check, Copy, Package, Key, Sparkles, AlertTriangle, Minus, X, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProductCatalogEmptyState from "@/components/product-request/ProductNotFound";
import { activeCustomerSegment, scopeCustomerProducts } from '../../../../../services/customer-segment.js';
import AddProductModal from "@/components/products/AddProductModal";
import { productImageSource, showProductImageFallback } from '@/lib/product-image-url';
import { useAuth } from "@/lib/firebase/auth-context";
import { getBasePrice, getBaseSize, hasNearExpiry, type Product } from "@/lib/firebase/products-service";
import { selectedLinkedProducts } from "@/lib/linked-product-selection";
import { apiKeyRequest } from "@/lib/api-keys";
import { createCatalogRefresh, loadSegmentCatalog, searchCatalog, catalogSelectableIds, catalogPresentationState, type CatalogSource, type CatalogPage } from '@/lib/segment-catalog';

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
  const [trialSelection, setTrialSelection] = useState<{ uid: string; key: TrialCatalogKey | null; catalog: TrialCatalog } | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const trialKey = trialSelection && trialSelection.uid === user?.uid ? trialSelection.key : null;
  const trialCatalog = trialSelection?.uid === user?.uid ? trialSelection?.catalog ?? null : null;
  
  // Core State
  // Retain paid selections across category switches; the grid uses only the
  // current verified response, never this accumulated selection lookup.
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogSource, setCatalogSource] = useState<CatalogSource | null>(null);
  const catalogRefresh = useRef<ReturnType<typeof createCatalogRefresh> | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Record<string, Set<string>>>({});
  const [paidSegment, setActiveSegment] = useState<string>("All");
  const activeSegment = isFreePlan(appUser?.plan) ? activeCustomerSegment(appUser) || '' : paidSegment;
  const currentCatalog = catalogSource?.segment === activeSegment ? catalogSource : null;
  const productAvailable = currentCatalog?.status === 'ready' ? currentCatalog.total : null;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionFilter, setSelectionFilter] = useState<'all' | 'selected' | 'not-selected'>('all');
  
  // API Key Generation State
  const [showGenModal, setShowGenModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedKeyName, setGeneratedKeyName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Add Product (to existing API key) Modal State
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const trialState = trialSelectionState(trialCatalog, trialKey, selectedProducts);
  const trialReady = !activeTrial || trialState.mode !== 'blocked';

  const receiveTrialCatalog = useCallback((data: { keys: TrialCatalogKey[]; trialCatalog?: TrialCatalog }, uid: string) => {
    if (!data.trialCatalog || !Array.isArray(data.keys)) {
      setTrialSelection(null);
      throw new Error('Trial catalog verification unavailable.');
    }
    if (data.keys.length > 1) {
      setTrialSelection(null);
      throw new Error('Free Trial permits one active key. Revoke additional legacy keys in API Keys first.');
    }
    const key = data.keys[0];
    const productIds = key ? [...new Set([...key.linkedProductIds, ...Object.keys(key.linkedVariantSelections)])] : [];
    const verifiedKey = key ? { ...key, productIds } : null;
    if (trialSelectionState(data.trialCatalog, verifiedKey, new Set()).mode === 'blocked') {
      setTrialSelection(null);
      throw new Error('Trial catalog and API key state could not be verified. Reload Products to retry.');
    }
    setTrialSelection({ uid, catalog: data.trialCatalog, key: verifiedKey });
    setSelectedProducts(previous => new Set([...previous].filter(id => !productIds.includes(id))));
    setSelectedVariants(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !productIds.includes(id))));
  }, []);


  // ==================== EFFECTS ====================

  useEffect(() => {
    if (!user || !activeSegment) return;
    const refresh = createCatalogRefresh({ segment: activeSegment,
      read: signal => loadSegmentCatalog(async (offset, pageSignal) => {
        const query = new URLSearchParams({ businessSegment: activeSegment, limit: '200', offset: String(offset) });
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
  const filteredProducts = searchedProducts.filter(product => {
    const isSelected = selectedProducts.has(product.id!) || (activeTrial && trialState.included.has(product.id!));
    return selectionFilter === 'all' || (selectionFilter === 'selected' ? isSelected : !isSelected);
  });
  // Search/segment emptiness is evaluated before the presentation-only selection filter.
  const catalogView = catalogPresentationState(currentCatalog, searchedProducts.length, searchQuery);
  const selectableIds = catalogSelectableIds(filteredProducts, selectedProducts, activeTrial ? {
    included: trialState.included, remaining: trialState.remaining,
    allowed: trialState.canToggle && trialReady && !upgradeRequired && !generating,
  } : null);

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
      if (trialState.included.has(productId) || !trialState.canToggle) return;
      const next = toggleTrialPending(trialState.pending, productId, trialState.included, trialState.remaining, trialState.canToggle);
      if (next.has(productId) === trialState.pending.has(productId)) return;
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
  }, [activeTrial, trialReady, upgradeRequired, generating, trialState]);

  const toggleVariant = useCallback((e: React.MouseEvent, productId: string, variantId: string) => {
    e.stopPropagation();
    if (upgradeRequired || !trialReady || generating) return;
    if (activeTrial && (trialState.included.has(productId) || !trialState.canToggle
      || (!trialState.pending.has(productId) && !trialState.canSelect))) return;
    
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
  }, [activeTrial, trialReady, upgradeRequired, generating, trialState]);

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
    if (!canGenerate || !trialReady || (activeTrial && !trialState.canGenerateFirstKey)) return;
    if (!keyName.trim()) {
      alert("Please enter a name for your API key");
      return;
    }
    
    setGenerating(true);
    
    try {
      const { auth } = await import("@/lib/firebase/config");
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
          // SECURITY: Do NOT send plan - let backend determine from user's actual Firestore data
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
      if (activeTrial && user) {
        invalidateAccountUsage(user.uid);
        receiveTrialCatalog(await apiKeyRequest(user), user.uid);
      }
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
  };

  return (
    <div className="w-full px-6 lg:px-8 min-w-0 space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Product Catalog</h1>
          <p className="text-slate-400">Select products to include in your custom API endpoint</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {trialState.mode === 'existing-key' && activeTrial ? <button onClick={addTrialProducts}
            disabled={!canGenerate || generating || !trialState.canSubmit || cartSummary.totalProducts === 0}
            className="px-6 py-3 rounded-xl bg-indigo-500 text-white disabled:opacity-50">Add Selected Products</button> : !upgradeRequired && (selectedProducts.size > 0 || activeTrial) && (
            <button
              disabled={!canGenerate || !trialReady || generating || (activeTrial && !trialState.canGenerateFirstKey)}
              onClick={openGenerationModal}
              className="px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              aria-label={`Generate API Key for ${selectedProducts.size} selected products`}
            >
              <Key className="w-4 h-4" />
              Generate API Key ({selectedProducts.size} products)
            </button>
          )}
          {upgradeRequired && <Link href="/dashboard/settings#subscription" className="text-sm font-semibold text-cyan-300">Free Trial Ended — Upgrade to Pro to generate a key</Link>}
          <button
            onClick={() => setShowAddProductModal(true)}
            className="px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            aria-label="Add existing products to an API key"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {activeTrial && (trialCatalog ? <p role="status" className="text-sm text-slate-300">Free Trial · 7 days · Products: {trialCatalog.productsIncluded} of {TRIAL_MAX_PRODUCTS} · Remaining slots: {trialRemainingSlots(trialCatalog.productsIncluded)} · Active API keys: {trialCatalog.activeKeys} of 1. {trialCapacityMessage(trialCatalog.productsIncluded) ?? 'Products are managed under one account allowance and one active API key.'}</p>
        : <p role="status" className="text-sm text-slate-300">Verifying persisted Trial catalog…</p>)}
      {activeTrial && trialState.mode === 'first-key' && <p className="text-sm text-slate-300">Select products to link to your first API key, then generate the key.</p>}
      {selectionError && <p role="alert" className="text-red-300">{selectionError}</p>}
      <p role="status" className="text-sm text-slate-300">Product Available: {productAvailable ?? '—'}
        {searchQuery.trim() && currentCatalog?.status === 'ready' ? ` · ${filteredProducts.length} results` : ''}</p>

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

        {/* Active filter badge */}
        {activeSegment !== "All" && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            activeSegment === "Pharmacy" ? "bg-green-500/15 text-green-400 border-green-500/30" :
            activeSegment === "Hardware" ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
            "bg-blue-500/15 text-blue-400 border-blue-500/30"
          }`}>
            {productAvailable ?? '—'} {activeSegment}
          </span>
        )}

        {/* Category Dropdown */}
        <div className="relative">
          <select
            id="category-filter"
            value={activeSegment}
            onChange={(e) => setActiveSegment(e.target.value)}
            disabled={isFreePlan(appUser?.plan)}
            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm font-medium text-slate-200 focus:outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 hover:bg-slate-700/80 hover:border-slate-600 transition-all cursor-pointer min-w-[170px] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Filter products by category"
          >
            {isFreePlan(appUser?.plan) ? (
              <option value={activeSegment}>{activeSegment}</option>
            ) : (
              <>
                <option value="All">All Categories</option>
                <option value="Hardware">Hardware</option>
                <option value="Grocery">Grocery</option>
                <option value="Pharmacy">Pharmacy</option>
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
            <option value="all">All Products</option>
            <option value="selected">Selected</option>
            <option value="not-selected">Not Selected</option>
          </select>
        </div>

        {/* Select All button */}
        {filteredProducts.length > 0 && (
          <button
            onClick={selectAllInView}
            disabled={selectableIds.length === 0 || upgradeRequired || !trialReady || generating}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-sm font-medium text-slate-300 transition-all whitespace-nowrap"
            aria-label={`Select ${selectableIds.length} new products in view`}
          >
            Select All ({selectableIds.length})
          </button>
        )}
      </div>

      {selectedProducts.size > 0 && (
        <section aria-label="Product selection summary" className="shrink-0 rounded-xl bg-slate-900 px-4 py-3 border border-indigo-500/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">{activeTrial ? 'New Product Selections' : 'Selected Products'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{activeTrial ? `${trialState.pending.size} selected to add` : `${cartSummary.totalProducts} selected`}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(cartSummary.bySegment).map(([segment, count]) => (
                  <span
                    key={segment}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300"
                  >
                    {segment}: {count}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeTrial && trialState.mode === 'existing-key' ? <button onClick={addTrialProducts}
                disabled={!canGenerate || generating || !trialState.canSubmit || cartSummary.totalProducts === 0}
                className="px-3 py-2 rounded-lg bg-indigo-500 text-sm font-medium text-white disabled:opacity-50">Add Selected Products</button>
                : !upgradeRequired && <button onClick={openGenerationModal}
                  disabled={!canGenerate || !trialReady || generating || (activeTrial && !trialState.canGenerateFirstKey)}
                  className="px-3 py-2 rounded-lg bg-indigo-500 text-sm font-medium text-white disabled:opacity-50">Generate API Key</button>}
              <button
                onClick={clearSelection}
                disabled={generating}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors"
                aria-label={activeTrial ? 'Clear new selections' : 'Clear all selected products'}
              >
                {activeTrial ? 'Clear New Selections' : 'Clear All'}
              </button>
              <Link
                href={`/dashboard/api-playground?products=${Array.from(selectedProducts).join(',')}`}
                className="px-3 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Test in Playground
              </Link>
            </div>
          </div>
        </section>
      )}

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
      ) : filteredProducts.length === 0 && selectionFilter !== 'all' ? (
        <div role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
          <h2 className="text-lg font-semibold text-white">{selectionFilter === 'selected' ? 'No selected products.' : 'No unselected products.'}</h2>
          <p className="mt-2 text-sm text-slate-400">{searchQuery.trim() ? 'Within your current search and business segment.' : 'Within your current business segment.'}</p>
          <button type="button" onClick={() => setSelectionFilter('all')} className="mt-3 text-sm text-indigo-300">View All Products</button>
        </div>
      ) : (
        <div className="grid gap-4" style={PRODUCT_GRID_STYLE}>
          {filteredProducts.map((product) => {
            const isIncluded = activeTrial && trialState.included.has(product.id!);
            const selectionDisabled = upgradeRequired || !trialReady || generating || (activeTrial && (isIncluded
              || !trialState.canToggle || (!trialState.pending.has(product.id!) && !trialState.canSelect)));
            const isSelected = isIncluded || selectedProducts.has(product.id!);
            const includedVariants = trialKey?.linkedVariantSelections[product.id!];
            const productVars = isIncluded ? new Set(includedVariants ?? product.variants?.map(v => `${v.flavor || ''}|${v.size || ''}`)) : selectedVariants[product.id!] || new Set();
            const totalVars = product.variants ? product.variants.length : 0;
            const isPartial = isSelected && totalVars > 0 && productVars.size > 0 && productVars.size < totalVars;
            
            return (
              <div
                key={product.id}
                onClick={() => toggleProduct(product)}
                aria-disabled={selectionDisabled || undefined}
                aria-label={`${product.name}${isIncluded ? ', Included' : isSelected ? ', Selected' : ''}`}
                style={{ borderWidth: isSelected ? 2 : 1, borderColor: isSelected ? '#6366f1' : '#334155',
                  boxShadow: isSelected ? '0 0 0 1px #818cf8, 0 4px 20px rgb(99 102 241 / 0.2)' : undefined }}
                className={`glass-card rounded-xl transition-all overflow-hidden ${selectionDisabled ? 'cursor-default' : 'cursor-pointer hover:scale-[1.02]'} ${
                  isSelected
                    ? "border-2 border-indigo-500 shadow-lg shadow-indigo-500/20"
                    : "border border-slate-700 hover:border-slate-600"
                }`}
              >
                {/* Image Area */}
                <div key={productImageSource(product)} className="relative w-full h-44 bg-slate-800 overflow-hidden">
                  {productImageSource(product) ? (
                    <img
                      src={productImageSource(product)}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      referrerPolicy="no-referrer"
                      onError={showProductImageFallback}
                    />
                  ) : null}
                  {/* Fallback icon (shown if image fails or missing) */}
                  <div className={`absolute inset-0 flex items-center justify-center ${productImageSource(product) ? 'hidden' : ''}`}>
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

                {/* Card Body */}
                <div className="p-4">
                  <h3 className="text-sm font-bold text-white mb-1 line-clamp-1">{product.name}</h3>
                  {isIncluded && <span className="inline-flex items-center gap-1 text-xs text-indigo-300 mb-1"><Check className="w-3 h-3" aria-hidden="true" />Included</span>}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{product.description}</p>

                  {/* Variant chips */}
                  {product.variants && product.variants.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation() /* Prevent double toggle if clicking container */}>
                      {product.variants.map((v, i) => {
                        const variantId = `${v.flavor || ''}|${v.size || ''}`;
                        const isVarSelected = productVars.has(variantId);
                        return (
                          <button
                            key={i}
                            onClick={(e) => toggleVariant(e, product.id!, variantId)}
                            disabled={selectionDisabled}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                              isVarSelected 
                                ? 'bg-indigo-500 text-white border border-indigo-600'
                                : 'bg-slate-800/80 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-slate-300'
                            }`}
                          >
                            {isVarSelected && <Check className="w-2.5 h-2.5" />}
                            {[v.flavor, v.size].filter(Boolean).join(' · ') || 'Variant'}
                          </button>
                        );
                      })}
                      {hasNearExpiry(product) && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-medium flex items-center gap-1">
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

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/60">
                    <span className="text-xs text-slate-500">
                      {product.variants && product.variants.length > 0
                        ? `${product.variants.length} variant${product.variants.length !== 1 ? 's' : ''}`
                        : <span className="font-mono">{product.sku || '—'}</span>
                      }
                    </span>
                    <span className="text-sm font-bold text-white">
                      {getBasePrice(product) > 0 ? `from ₱${getBasePrice(product).toFixed(2)}` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
                    disabled={!keyName.trim() || generating || !trialReady || (activeTrial && !trialState.canGenerateFirstKey)}
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
                  {cartSummary.linkedProducts.length === 0 ? (
                    <p className="text-sm text-slate-500">No products selected.</p>
                  ) : (
                    <ul className="max-h-28 overflow-y-auto space-y-1 text-sm text-slate-200">
                      {cartSummary.linkedProducts.map(product => <li key={product.id} className="truncate">{product.name}</li>)}
                    </ul>
                  )}
                </div>
                <div className="bg-slate-950 border-2 border-emerald-500/30 rounded-xl p-4 mb-6">
                  <p className="text-xs font-medium text-emerald-400 mb-2">API Key — shown once</p>
                  <div className="bg-slate-900 rounded-lg p-3 mb-3 break-all font-mono text-sm text-emerald-300 select-all">
                    {generatedKey}
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
