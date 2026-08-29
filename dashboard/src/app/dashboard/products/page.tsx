"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Database, ShoppingCart, Check, Package, Key, Sparkles, AlertTriangle, Minus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProductNotFound, ProductRequestModal, ConfirmationModal } from "@/components/product-request";
import { useAuth } from "@/lib/firebase/auth-context";
import { getBasePrice, getBaseSize, hasNearExpiry, type Product } from "@/lib/firebase/products-service";

// Product type now imported from products-service (matches new variants schema)
// CartSummary local type

interface CartSummary {
  totalProducts: number;
  bySegment: Record<string, number>;
  productIds: string[];
}

// ==================== CONSTANTS ====================

const SEGMENTS = ["All", "Pharmacy", "Hardware", "Grocery"] as const;
const COPY_REDIRECT_DELAY = 1500;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';

// ==================== MAIN COMPONENT ====================

export default function ProductCatalogPage() {
  const router = useRouter();
  const { appUser } = useAuth();
  
  // Core State
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [activeSegment, setActiveSegment] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  
  // API Key Generation State
  const [showGenModal, setShowGenModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Product Request State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);

  // ==================== EFFECTS ====================

  useEffect(() => {
    fetchProducts();
  }, []);

  // Sync segment for Free users
  useEffect(() => {
    if (appUser?.plan === "Free" && appUser?.selectedSegment) {
      setActiveSegment(appUser.selectedSegment);
    }
  }, [appUser]);

  // ==================== DATA FETCHING ====================

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { getAllProducts } = await import('@/lib/firebase/products-service');
      const productsData = await getAllProducts();
      setProducts(productsData as unknown as Product[]);
      setLoading(false);
    } catch (error) {
      console.error("[Products] Error fetching:", error);
      setLoading(false);
    }
  };

  // ==================== COMPUTED VALUES ====================

  const getFilteredProducts = useCallback(() => {
    let filtered = products;
    
    // Strict segment filter for Free users
    if (appUser?.plan === "Free" && appUser?.selectedSegment) {
      filtered = filtered.filter(p => p.segment === appUser.selectedSegment);
    } else if (activeSegment !== "All") {
      filtered = filtered.filter(p => p.segment === activeSegment);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      );
    }
    
    return filtered;
  }, [products, activeSegment, searchQuery, appUser]);

  const filteredProducts = useMemo(() => getFilteredProducts(), [getFilteredProducts]);

  const cartSummary = useMemo((): CartSummary => {
    const selectedItems = products.filter(p => selectedProducts.has(p.id!));
    const bySegment = selectedItems.reduce((acc, p) => {
      acc[p.segment] = (acc[p.segment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalProducts: selectedProducts.size,
      bySegment,
      productIds: Array.from(selectedProducts)
    };
  }, [products, selectedProducts]);

  // ==================== PRODUCT SELECTION ====================

  const toggleProduct = useCallback((product: Product) => {
    const productId = product.id!;
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
  }, []);

  const toggleVariant = useCallback((e: React.MouseEvent, productId: string, variantId: string) => {
    e.stopPropagation();
    
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
  }, []);

  const selectAllInView = useCallback(() => {
    setSelectedProducts((prevProds) => {
      const newProds = new Set(prevProds);
      filteredProducts.forEach(p => newProds.add(p.id!));
      return newProds;
    });
    setSelectedVariants((prevVars) => {
      const newVars = { ...prevVars };
      filteredProducts.forEach(p => {
        if (p.variants && p.variants.length > 0) {
          newVars[p.id!] = new Set(p.variants.map(v => `${v.flavor || ''}|${v.size || ''}`));
        }
      });
      return newVars;
    });
  }, [filteredProducts]);

  const clearSelection = useCallback(() => {
    setSelectedProducts(new Set());
    setSelectedVariants({});
  }, []);

  // ==================== API KEY GENERATION ====================

  const handleGenerateApiKey = async () => {
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

      const selectedProductsList = products
        .filter(p => selectedProducts.has(p.id!))
        .map(p => ({ id: p.id!, name: p.name, sku: p.sku || '', segment: p.segment }));

      const finalLinkedProductIds: string[] = [];
      const finalLinkedVariantSelections: Record<string, string[]> = {};

      selectedProducts.forEach(productId => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        
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
        throw new Error(data.message || data.error || "Unable to create your API key. Please try again later.");
      }

      setGeneratedKey(data.key);
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

  const handleCopyAndClose = useCallback(() => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
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
            url: {
              raw: `${API_URL}/daas/v1/catalog`,
              host: [API_URL.replace('http://', '')],
              path: ["daas", "v1", "catalog"]
            }
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

  // ==================== PRODUCT REQUEST ====================

  const handleOpenRequestModal = () => {
    setShowRequestModal(true);
  };

  const handleRequestSuccess = () => {
    // Optionally store request ID here if returned from modal
    setShowRequestModal(false);
    setShowConfirmationModal(true);
    // Optionally refetch products
    fetchProducts();
  };

  const handleCancelRequest = async () => {
    if (!lastRequestId) return;
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/v1/product-requests/${lastRequestId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to cancel request');
      }
      
      setShowConfirmationModal(false);
      setLastRequestId(null);
    } catch (error) {
      console.error('Error cancelling request:', error);
      throw error;
    }
  };

  const handleReturnToCatalog = () => {
    setShowConfirmationModal(false);
    setSearchQuery("");
  };

  // ==================== RENDER ====================

  return (
    <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Product Catalog</h1>
          <p className="text-slate-400">Select products to include in your custom API endpoint</p>
        </div>
        {selectedProducts.size > 0 && (
          <button
            onClick={() => { 
              setShowGenModal(true); 
              setGeneratedKey(null); 
              setKeyName(""); 
              setCopied(false); 
            }}
            className="px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
            aria-label={`Generate API Key for ${selectedProducts.size} selected products`}
          >
            <Key className="w-4 h-4" />
            Generate API Key ({selectedProducts.size} products)
          </button>
        )}
      </div>

      {/* Shopping Cart Summary - Sticky */}
      {selectedProducts.size > 0 && (
        <div className="glass-card rounded-xl p-6 border-2 border-indigo-500/30 sticky top-4 z-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Selected Products</h3>
                <p className="text-sm text-slate-400 mb-3">Your custom API will return these {cartSummary.totalProducts} products</p>
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
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearSelection}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors"
                aria-label="Clear all selected products"
              >
                Clear All
              </button>
              <Link
                href={`/dashboard/api-playground?products=${Array.from(selectedProducts).join(',')}`}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-sm font-medium text-white transition-colors flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Test in Playground
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Filter Row */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
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

        <div className="flex-1" />

        {/* Active filter badge */}
        {activeSegment !== "All" && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            activeSegment === "Pharmacy" ? "bg-green-500/15 text-green-400 border-green-500/30" :
            activeSegment === "Hardware" ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
            "bg-blue-500/15 text-blue-400 border-blue-500/30"
          }`}>
            {filteredProducts.length} {activeSegment}
          </span>
        )}

        {/* Category Dropdown */}
        <div className="relative">
          <select
            id="category-filter"
            value={activeSegment}
            onChange={(e) => setActiveSegment(e.target.value)}
            disabled={appUser?.plan === "Free"}
            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm font-medium text-slate-200 focus:outline-none focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 hover:bg-slate-700/80 hover:border-slate-600 transition-all cursor-pointer min-w-[170px] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Filter products by category"
          >
            {appUser?.plan === "Free" ? (
              <option value={appUser.selectedSegment}>{appUser.selectedSegment}</option>
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

        {/* Select All button */}
        {filteredProducts.length > 0 && (
          <button
            onClick={selectAllInView}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-sm font-medium text-slate-300 transition-all whitespace-nowrap"
            aria-label={`Select all ${filteredProducts.length} filtered products`}
          >
            Select All ({filteredProducts.length})
          </button>
        )}
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2048px]:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-6 animate-pulse">
              <div className="w-full h-32 bg-slate-800 rounded-lg mb-4" />
              <div className="h-4 bg-slate-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <>
          {/* Product Not Found Component */}
          <ProductNotFound
            searchQuery={searchQuery}
            onRequestProduct={handleOpenRequestModal}
          />

          {/* Product Request Modal */}
          <ProductRequestModal
            isOpen={showRequestModal}
            onClose={() => setShowRequestModal(false)}
            productName={searchQuery}
            onSuccess={handleRequestSuccess}
          />

          {/* Confirmation Modal */}
          <ConfirmationModal
            isOpen={showConfirmationModal}
            onClose={() => setShowConfirmationModal(false)}
            productName={searchQuery}
            requestId={lastRequestId || undefined}
            onReturnToCatalog={handleReturnToCatalog}
            onCancelRequest={handleCancelRequest}
          />
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2048px]:grid-cols-6 gap-4">
          {filteredProducts.map((product) => {
            const isSelected = selectedProducts.has(product.id!);
            const productVars = selectedVariants[product.id!] || new Set();
            const totalVars = product.variants ? product.variants.length : 0;
            const isPartial = isSelected && totalVars > 0 && productVars.size > 0 && productVars.size < totalVars;
            
            return (
              <div
                key={product.id}
                onClick={() => toggleProduct(product)}
                className={`glass-card rounded-xl cursor-pointer transition-all hover:scale-[1.02] overflow-hidden ${
                  isSelected
                    ? "border-2 border-indigo-500 shadow-lg shadow-indigo-500/20"
                    : "border border-slate-700 hover:border-slate-600"
                }`}
              >
                {/* Image Area */}
                <div className="relative w-full h-44 bg-slate-800 overflow-hidden">
                  {product.image_url || product.image ? (
                    <img
                      src={product.image_url || product.image}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  {/* Fallback icon (shown if image fails or missing) */}
                  <div className={`absolute inset-0 flex items-center justify-center ${product.image_url || product.image ? 'hidden' : ''}`}>
                    <Database className="w-14 h-14 text-slate-600" />
                  </div>

                  {/* Top overlay row: checkbox + segment badge */}
                  <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-3">
                    {/* Checkbox */}
                    <div className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all shadow-md ${
                      isSelected
                        ? "bg-indigo-500 border-indigo-500"
                        : "bg-slate-900/70 border-slate-500 backdrop-blur-sm"
                    }`}>
                      {isPartial ? (
                        <Minus className="w-4 h-4 text-white" />
                      ) : isSelected ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : null}
                    </div>

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
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{product.description}</p>

                  {/* Variant chips */}
                  {product.variants && product.variants.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation() /* Prevent double toggle if clicking container */}>
                      {product.variants.map((v, i) => {
                        const variantId = `${v.flavor || ''}|${v.size || ''}`;
                        const isVarSelected = selectedVariants[product.id!]?.has(variantId);
                        return (
                          <button
                            key={i}
                            onClick={(e) => toggleVariant(e, product.id!, variantId)}
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

      {/* Generate API Key Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl border border-slate-700 shadow-2xl p-8 animate-in fade-in zoom-in duration-200 relative">
            <button
              onClick={() => setShowGenModal(false)}
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
                <p className="text-sm text-slate-400 text-center mb-6">
                  This key will be linked to <span className="text-indigo-400 font-semibold">{selectedProducts.size} selected product{selectedProducts.size !== 1 ? 's' : ''}</span>.
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
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(cartSummary.bySegment).map(([seg, cnt]) => (
                      <span key={seg} className="px-2 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                        {seg}: {cnt}
                      </span>
                    ))}
                  </div>
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
                    disabled={!keyName.trim() || generating}
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
                <p className="text-sm text-slate-400 text-center mb-6">
                  Your key is now active and linked to your selected products. <strong className="text-amber-400">Copy it now</strong> — you won't see it again.
                </p>
                <div className="bg-slate-950 border-2 border-emerald-500/30 rounded-xl p-4 mb-6">
                  <p className="text-xs font-medium text-emerald-400 mb-2">YOUR NEW API KEY</p>
                  <div className="bg-slate-900 rounded-lg p-3 mb-3 break-all font-mono text-sm text-emerald-300 select-all">
                    {generatedKey}
                  </div>
                </div>
                <button
                  onClick={handleCopyAndClose}
                  className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 mb-3"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Key className="w-5 h-5" />}
                  {copied ? "Copied! Going to API Keys..." : "Copy & Go to API Keys →"}
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
    </div>
  );
}
