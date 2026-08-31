"use client";

import { useState, useEffect, useMemo, useId } from "react";
import {
  Package, Pencil, Search, Download, Upload,
  Eye, RotateCcw, X, ShoppingCart, Wrench, Pill, Layers,
  FolderArchive, ChevronDown, Plus, Trash2, Save, Loader2, AlertTriangle, ChevronRight, Archive,
  type LucideIcon
} from "lucide-react";
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import ImportCsvModal from "@/components/admin/ImportCsvModal";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ProductVariant {
  flavor?: string;
  size?: string;
  dosage?: string;
  form?: string;
  specs?: string;
  dimensions?: string;
  price?: number | string;
  value?: string;
  sku?: string;
  expirationDate?: string; // YYYY-MM-DD
}

// Returns true if a variant expires within 30 days from today
const isExpiringSoon = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  const exp = new Date(dateStr);
  const now = new Date();
  const diff = exp.getTime() - now.getTime();
  return diff > 0 && diff <= 30 * 24 * 60 * 60 * 1000;
};

// Returns true if any variant of a product expires within 30 days
const hasExpiryWarning = (p: Product): boolean =>
  (p.variants ?? []).some(v => isExpiringSoon(v.expirationDate));

// Returns true if category should show expiry date field
const categoryNeedsExpiry = (cat: string): boolean => {
  const c = cat.toLowerCase();
  return c.includes("grocery") || c.includes("food") || c.includes("snack") ||
    c.includes("beverage") || c.includes("drink") || c.includes("dairy") ||
    c.includes("medicine") || c.includes("pharma") || c.includes("first aid") ||
    c.includes("cold") || c.includes("flu") || c.includes("pain") ||
    c.includes("canned") || c.includes("instant") || c.includes("milk");
};

export interface Product {
  id: string;
  name?: string;
  brand?: string;
  product?: string;
  category?: string;
  segment?: string;
  price?: number | string;
  size?: string;
  flavor?: string;
  dosage?: string;
  form?: string;
  specs?: string;
  dimensions?: string;
  variant?: string;
  image_url?: string;
  image?: string;
  description?: string;
  is_active?: boolean;
  status?: string;
  createdAt?: any;
  updatedAt?: any;
  variants?: ProductVariant[];
  sku?: string;
  attributes?: { brand?: string; flavor?: string; size?: string; variant?: string; price?: number | string };
}

type VariantFieldKey = "flavor" | "size" | "dosage" | "form" | "specs" | "dimensions";

const SEGMENT_FIELD_PAIRS: Record<string, [VariantFieldKey, VariantFieldKey]> = {
  Grocery: ["flavor", "size"],
  Pharmacy: ["dosage", "form"],
  Hardware: ["specs", "dimensions"],
};

const FIELD_META: Record<VariantFieldKey, { label: string; placeholder: string; tableLabel: string }> = {
  flavor: { label: "Flavor", placeholder: "e.g. Cheese", tableLabel: "FLAVOR" },
  size: { label: "Size", placeholder: "e.g. 85g", tableLabel: "SIZE" },
  dosage: { label: "Dosage", placeholder: "e.g. 500mg", tableLabel: "DOSAGE" },
  form: { label: "Form", placeholder: "e.g. Tablet", tableLabel: "FORM" },
  specs: { label: "Specs", placeholder: "e.g. 400W", tableLabel: "SPECS" },
  dimensions: { label: "Dimensions", placeholder: "e.g. 10x5x3 in", tableLabel: "DIMENSIONS" },
};

const SEGMENT_ATTR_KEYS: VariantFieldKey[] = ["flavor", "size", "dosage", "form", "specs", "dimensions"];

const getSegmentPair = (segment?: string): [VariantFieldKey, VariantFieldKey] =>
  SEGMENT_FIELD_PAIRS[segment || ""] || SEGMENT_FIELD_PAIRS.Grocery;

const getSegmentFields = (segment?: string) => {
  const [a, b] = getSegmentPair(segment);
  return { field1: { ...FIELD_META[a], key: a }, field2: { ...FIELD_META[b], key: b } };
};

const remapVariantForSegment = (v: ProductVariant, segment?: string): ProductVariant => {
  const next = { ...v };
  SEGMENT_ATTR_KEYS.forEach(k => { delete next[k]; });
  const [a, b] = getSegmentPair(segment);
  return { ...next, [a]: "", [b]: "" };
};

const variantHasData = (v: ProductVariant): boolean =>
  !!(v.flavor || v.size || v.dosage || v.form || v.specs || v.dimensions || parseNum(v.price) != null);

const getAttrValues = (p: Product, keys: VariantFieldKey[], legacy?: "value"): string[] => {
  const pick = (v: ProductVariant): string =>
    keys.map(k => (v[k] as string)).find(v2 => v2) || (legacy ? (v[legacy] || "") : "") || "";
  const list: string[] = [];
  if (p.variants?.length) {
    list.push(...p.variants.map(pick));
  } else {
    const root = keys.map(k => (p as any)[k]).find(Boolean) || (p.variant || p.attributes?.variant || "");
    if (root) list.push(String(root));
    const attrsRoot = keys.map(k => (p.attributes as any)?.[k]).find(Boolean);
    if (attrsRoot) list.push(String(attrsRoot));
  }
  return [...new Set(list.filter(Boolean))];
};

const getAttr2 = (p: Product): string[] => {
  const [, b] = getSegmentPair(p.segment);
  return getAttrValues(p, [b, "size"]);
};

const getAttr1 = (p: Product): string[] => {
  const [a] = getSegmentPair(p.segment);
  const values = getAttrValues(p, [a, "flavor"], "value");
  const sizes = getAttr2(p);
  return values.filter(v => !sizes.includes(v));
};

const getTableHeaders = (segment: string): [string, string] => {
  if (segment && segment !== "All") {
    const [a, b] = getSegmentPair(segment);
    return [FIELD_META[a].tableLabel, FIELD_META[b].tableLabel];
  }
  return ["VARIANT OPTION", "VARIANT DETAIL"];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getProductName = (p: Product) => p.name || p.product || "Unnamed Product";
const getBrand = (p: Product) => p.brand || p.attributes?.brand || "";
const getStatus = (p: Product) => p.status || (p.is_active === false ? "Archived" : "Active");

const getFlavors = (p: Product): string[] => {
  const list: string[] = [];
  if (p.variants?.length) {
    list.push(...p.variants.map(v => v.flavor || v.value || ""));
  } else {
    if (p.flavor) list.push(p.flavor);
    if (p.variant) list.push(p.variant);
    if (p.attributes?.flavor) list.push(p.attributes.flavor);
    if (p.attributes?.variant) list.push(p.attributes.variant);
  }
  const sizes = getSizes(p);
  return [...new Set(list.filter(Boolean).filter(f => !sizes.includes(f)))];
};

const getSizes = (p: Product): string[] => {
  const list: string[] = [];
  if (p.variants?.length) {
    list.push(...p.variants.map(v => v.size || ""));
  } else {
    if (p.size) list.push(p.size);
    if (p.attributes?.size) list.push(p.attributes.size);
  }
  return [...new Set(list.filter(Boolean))];
};

const parseNum = (val: any): number | null => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) return parsed;
  }
  return null;
};

const getPricing = (p: Product): string => {
  const prices: number[] = [];
  if (p.variants?.length) {
    p.variants.forEach(v => {
      const num = parseNum(v.price);
      if (num !== null) prices.push(num);
    });
  } else {
    const num = parseNum(p.price) ?? parseNum(p.attributes?.price);
    if (num !== null) prices.push(num);
  }

  if (prices.length) {
    const mn = Math.min(...prices);
    return `₱${mn.toFixed(2)}`;
  }
  return "—";
};

const categoryStyle = (cat?: string) => {
  if (!cat) return "bg-slate-700/60 text-slate-400 border-slate-600/60";
  const c = cat.toLowerCase();
  if (c.includes("noodle") || c.includes("instant")) return "bg-cyan-500/15 text-cyan-300 border-cyan-500/25";
  if (c.includes("canned") || c.includes("sardine") || c.includes("tuna") || c.includes("meat")) return "bg-red-500/15 text-red-300 border-red-500/25";
  if (c.includes("beverage") || c.includes("drink") || c.includes("water") || c.includes("juice") || c.includes("coffee") || c.includes("tea")) return "bg-teal-500/15 text-teal-300 border-teal-500/25";
  if (c.includes("dairy") || c.includes("milk") || c.includes("cream") || c.includes("cheese")) return "bg-pink-500/15 text-pink-300 border-pink-500/25";
  if (c.includes("snack") || c.includes("chip") || c.includes("cracker") || c.includes("cookie") || c.includes("candy") || c.includes("chocolate") || c.includes("gum")) return "bg-green-500/15 text-green-300 border-green-500/25";
  if (c.includes("condiment") || c.includes("sauce") || c.includes("seasoning") || c.includes("oil")) return "bg-yellow-500/15 text-yellow-300 border-yellow-500/25";
  if (c.includes("rice") || c.includes("grain") || c.includes("flour") || c.includes("sugar")) return "bg-amber-500/15 text-amber-300 border-amber-500/25";
  return "bg-indigo-500/15 text-indigo-300 border-indigo-500/25";
};

const segmentStyle = (seg?: string) => {
  if (seg === "Grocery") return "bg-blue-500/10 text-blue-400 border-blue-500/20";
  if (seg === "Hardware") return "bg-orange-500/10 text-orange-400 border-orange-500/20";
  if (seg === "Pharmacy") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  return "bg-slate-700/50 text-slate-400 border-slate-600/50";
};

const exportCSV = (data: Product[]) => {
  if (!data.length) return;
  const rows = data.map(p => [
    `"${(getProductName(p)).replace(/"/g, '""')}"`, `"${getBrand(p)}"`,
    `"${p.segment || ""}"`, `"${p.category || ""}"`,
    `"${getFlavors(p).join(", ")}"`, `"${getSizes(p).join(", ")}"`,
    `"${getPricing(p)}"`, `"${getStatus(p)}"`,
  ].join(","));
  const csv = ["Name,Brand,Segment,Category,Flavors,Specs,Pricing,Status", ...rows].join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: "master_catalog.csv"
  });
  a.click();
};

// ─── Expand More Button ───────────────────────────────────────────────────────
function ExpandMore({ items, label }: { items: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[12px] text-indigo-400/70 font-medium hover:text-indigo-300 transition-colors"
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-2 min-w-[120px] space-y-0.5">
          {items.map((item, i) => (
            <p key={i} className="text-[12px] text-slate-300 px-2 py-1 rounded hover:bg-slate-700 whitespace-nowrap">{item}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; dot: string }> = {
    Active: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
    Archived: { bg: "bg-slate-500/15 text-slate-400 border-slate-500/25", dot: "bg-slate-400" },
    Pending: { bg: "bg-amber-500/10 text-amber-400 border-amber-500/25", dot: "bg-amber-400" },
    Rejected: { bg: "bg-red-500/10 text-red-400 border-red-500/25", dot: "bg-red-400" },
  };
  const c = cfg[status] ?? cfg.Active;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider whitespace-nowrap ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}

// ─── View Detail Modal ────────────────────────────────────────────────────────
function ViewModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [attr1Key, attr2Key] = getSegmentPair(product.segment);
  const attr1 = getAttr1(product);
  const attr1Label = FIELD_META[attr1Key].label;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            {product.image_url || product.image ? (
              <img src={product.image_url || product.image} alt={product.name}
                className="w-14 h-14 rounded-xl object-cover border border-white/10" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center border border-white/10">
                <Package className="w-7 h-7 text-slate-600" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-white leading-snug">{getProductName(product)}</h2>
              {getBrand(product) && <p className="text-xs text-indigo-400 mt-0.5">{getBrand(product)}</p>}
              <div className="mt-1.5 flex gap-1.5">
                <StatusBadge status={getStatus(product)} />
                {product.segment && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${segmentStyle(product.segment)}`}>
                    {product.segment}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Key info */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ["Category", product.category, false],
              ["Pricing", getPricing(product), true],
              ["Variants", `${product.variants?.length ?? 0}`, false],
              ["SKU", product.sku, false],
            ].map(([l, v, green]) => (
              <div key={l as string} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{l as string}</p>
                {v && v !== "—" ? (
                  <p className={`text-sm font-semibold ${green ? "text-emerald-400" : "text-slate-200"}`}>{v as string}</p>
                ) : (
                  <p className="text-sm text-slate-600">—</p>
                )}
              </div>
            ))}
          </div>

          {/* Attributes */}
          {attr1.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">{attr1Label} / Variants</p>
              <div className="flex flex-wrap gap-1.5">
                {attr1.map((f, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Variant table with SKU + Expiry */}
          {product.variants && product.variants.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Variant Breakdown</p>
              <div className="rounded-lg overflow-hidden border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-800/70">
                    <tr>
                      <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider text-left">{FIELD_META[attr1Key].label}</th>
                      <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider text-left">{FIELD_META[attr2Key].label}</th>
                      <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider text-left">SKU</th>
                      <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider text-left">Exp. Date</th>
                      <th className="px-3 py-2 text-slate-500 font-semibold uppercase tracking-wider text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {product.variants.map((v, i) => {
                      const expiring = isExpiringSoon(v.expirationDate);
                      return (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-3 py-2 text-slate-300">{v[attr1Key] || v.flavor || v.value || <span className="text-slate-600">—</span>}</td>
                          <td className="px-3 py-2 text-slate-400 font-mono">{v[attr2Key] || v.size || <span className="text-slate-600">—</span>}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{v.sku || <span className="text-slate-600">—</span>}</td>
                          <td className="px-3 py-2">
                            {v.expirationDate ? (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${expiring
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-slate-700/60 text-slate-400 border border-slate-600/50"
                                }`}>
                                {expiring && <AlertTriangle className="w-2.5 h-2.5" />}
                                {v.expirationDate}
                              </span>
                            ) : <span className="text-slate-600">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-400 font-bold">
                            {parseNum(v.price) != null ? `₱${parseNum(v.price)!.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Product Modal ───────────────────────────────────────────────────────
function EditModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (updated: Product) => void;
}) {
  const seedVariants = (): ProductVariant[] => {
    if (product.variants?.length) return product.variants.map(v => ({ ...v }));
    if (product.flavor || product.size || product.dosage || product.form || product.specs || product.dimensions || product.price != null) {
      return [{
        flavor: product.flavor || "",
        size: product.size || "",
        dosage: product.dosage || "",
        form: product.form || "",
        specs: product.specs || "",
        dimensions: product.dimensions || "",
        price: parseNum(product.price) ?? 0,
      }];
    }
    return [{ flavor: "", size: "", price: 0 }];
  };

  const [name, setName] = useState(getProductName(product));
  const [brand, setBrand] = useState(getBrand(product));
  const [category, setCategory] = useState(product.category || "");
  const [segment, setSegment] = useState(product.segment || "");
  const [status, setStatus] = useState(getStatus(product));
  const [variants, setVariants] = useState<ProductVariant[]>(seedVariants);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCustomSegment, setIsCustomSegment] = useState(false);

  const segFields = getSegmentFields(segment);

  const handleSegmentChange = (next: string) => {
    if (next === "ADD_NEW") {
      setIsCustomSegment(true);
      setSegment("");
      return;
    }
    setIsCustomSegment(false);
    setSegment(next);
    setError("");
    setVariants(prev => prev.map(v => remapVariantForSegment(v, next)));
  };

  // Get unique segments from all products
  // Default segments: Pharmacy, Grocery, Hardware
  const uniqueSegments = Array.from(new Set([
    "Grocery", "Hardware", "Pharmacy",
    // product might not be in scope for AddProductModal? wait, existingProducts is not passed to EditModal.
    // EditModal doesn't have existingProducts, but it's fine. We'll just hardcode the 3 + current product's segment.
    product.segment || ""
  ])).filter(Boolean).sort();

  const updateVariant = (i: number, field: keyof ProductVariant, val: string) => {
    setVariants(prev => prev.map((v, idx) =>
      idx === i ? { ...v, [field]: field === "price" ? (val === "" ? "" : val) : val } : v
    ));
  };

  const addVariant = () => {
    const f = getSegmentFields(segment);
    setVariants(prev => [...prev, { [f.field1.key]: "", [f.field2.key]: "", price: 0 }]);
  };
  const removeVariant = (i: number) => setVariants(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { setError("Product name is required."); return; }
    setSaving(true); setError("");
    try {
      const cleaned = variants
        .filter(variantHasData)
        .map(v => ({
          ...(v.flavor ? { flavor: v.flavor.trim() } : {}),
          ...(v.size ? { size: v.size.trim() } : {}),
          ...(v.dosage ? { dosage: v.dosage.trim() } : {}),
          ...(v.form ? { form: v.form.trim() } : {}),
          ...(v.specs ? { specs: v.specs.trim() } : {}),
          ...(v.dimensions ? { dimensions: v.dimensions.trim() } : {}),
          price: parseNum(v.price) ?? 0,
          ...(v.sku ? { sku: v.sku.trim() } : {}),
          ...(v.expirationDate ? { expirationDate: v.expirationDate } : {}),
        }));

      const payload: Record<string, any> = {
        name: name.trim(),
        brand: brand.trim(),
        category: category.trim(),
        segment,
        status,
        is_active: status === "Active",
        variants: cleaned,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "products", product.id), payload);
      onSaved({ ...product, ...payload, updatedAt: undefined });
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const showExpiry = categoryNeedsExpiry(category);
  const inputCls = "w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/20 transition-colors";
  const labelCls = "block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              <Pencil className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-snug">Edit Product</h2>
              <p className="text-[11px] text-slate-500 truncate max-w-xs">{getProductName(product)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Base fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Product Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Product name" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Brand</label>
              <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Segment</label>
              {isCustomSegment ? (
                <div className="flex gap-2">
                  <input autoFocus value={segment} onChange={e => setSegment(e.target.value)} placeholder="Type new segment..." className={inputCls} />
                  <button onClick={() => setIsCustomSegment(false)} className="px-3 rounded-lg bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700 transition-colors text-xs">Cancel</button>
                </div>
              ) : (
                <select value={uniqueSegments.includes(segment) ? segment : ""} onChange={e => handleSegmentChange(e.target.value)} className={inputCls}>
                  <option value="">— Select Segment —</option>
                  {uniqueSegments.map(seg => <option key={seg} value={seg}>{seg}</option>)}
                  <option value="ADD_NEW" className="text-indigo-400 font-semibold">+ Add New Segment</option>
                </select>
              )}
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Canned Goods" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className={labelCls + " mb-0"}>Variants</p>
              <button onClick={addVariant}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors">
                <Plus className="w-3 h-3" /> Add Variant
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className={`grid bg-slate-800/60 px-3 py-2 gap-2 ${showExpiry ? "grid-cols-[1fr_90px_100px_110px_90px_32px]" : "grid-cols-[1fr_90px_100px_90px_32px]"}`}>
                {[segFields.field1.label, segFields.field2.label, "SKU", ...(showExpiry ? ["Exp. Date"] : []), "Price", ""].map(h => (
                  <p key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</p>
                ))}
              </div>

              <div className="divide-y divide-slate-800/60">
                {variants.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">No variants. Click "Add Variant" to begin.</p>
                )}
                {variants.map((v, i) => (
                  <div key={i} className={`grid px-3 py-2 gap-2 items-center hover:bg-slate-800/20 ${showExpiry ? "grid-cols-[1fr_90px_100px_110px_90px_32px]" : "grid-cols-[1fr_90px_100px_90px_32px]"}`}>
                    <input value={v[segFields.field1.key] || ""} onChange={e => updateVariant(i, segFields.field1.key, e.target.value)}
                      placeholder={segFields.field1.placeholder} className={inputCls + " py-1.5 text-xs"} />
                    <input value={v[segFields.field2.key] || ""} onChange={e => updateVariant(i, segFields.field2.key, e.target.value)}
                      placeholder={segFields.field2.placeholder} className={inputCls + " py-1.5 text-xs"} />
                    <input value={v.sku || ""} onChange={e => updateVariant(i, "sku", e.target.value)}
                      placeholder="e.g. ABC-001" className={inputCls + " py-1.5 text-xs"} />
                    {showExpiry && (
                      <input type="date" value={v.expirationDate || ""}
                        onChange={e => updateVariant(i, "expirationDate", e.target.value)}
                        className={inputCls + " py-1.5 text-xs"} />
                    )}
                    <input type="number" min="0" step="0.01"
                      value={v.price !== undefined && v.price !== "" ? v.price : ""}
                      onChange={e => updateVariant(i, "price", e.target.value)}
                      placeholder="0.00" className={inputCls + " py-1.5 text-xs"} />
                    <button onClick={() => removeVariant(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {showExpiry && (
              <p className="text-[10px] text-slate-600 mt-1.5 ml-0.5">* Expiration Date applies to perishable/medicine categories only.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-800 bg-slate-900/80 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Product Modal ───────────────────────────────────────────────────────
function AddProductModal({
  onClose,
  onAdded,
  existingProducts,
}: {
  onClose: () => void;
  onAdded: (result: { product: Product; isUpdate: boolean }) => void;
  existingProducts: Product[];
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [segment, setSegment] = useState("");
  const [variants, setVariants] = useState<ProductVariant[]>([{ flavor: "", size: "", price: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCustomSegment, setIsCustomSegment] = useState(false);

  // Dynamically pull all existing segments
  const uniqueSegments = Array.from(new Set([
    "Grocery", "Hardware", "Pharmacy",
    ...existingProducts.map(p => p.segment).filter(Boolean)
  ])).filter(s => s !== undefined) as string[];
  uniqueSegments.sort();

  const segFields = getSegmentFields(segment);

  const handleSegmentChange = (next: string) => {
    if (next === "ADD_NEW") {
      setIsCustomSegment(true);
      setSegment("");
      return;
    }
    setIsCustomSegment(false);
    setSegment(next);
    setError("");
    setVariants(prev => prev.map(v => remapVariantForSegment(v, next)));
  };

  const updateVariant = (i: number, field: keyof ProductVariant, val: string) => {
    setVariants(prev => prev.map((v, idx) =>
      idx === i ? { ...v, [field]: field === "price" ? (val === "" ? "" : val) : val } : v
    ));
  };

  const addVariant = () => {
    const f = getSegmentFields(segment);
    setVariants(prev => [...prev, { [f.field1.key]: "", [f.field2.key]: "", price: 0 }]);
  };
  const removeVariant = (i: number) => setVariants(prev => prev.filter((_, idx) => idx !== i));

  const handleAdd = async () => {
    if (!name.trim()) { setError("Product name is required."); return; }
    setSaving(true); setError("");
    try {
      const nameTrimmed = name.trim().toLowerCase();
      const brandTrimmed = brand.trim().toLowerCase();

      // Check for existing product with same Name + Brand (case-insensitive)
      const existing = existingProducts.find(p =>
        getProductName(p).trim().toLowerCase() === nameTrimmed &&
        getBrand(p).trim().toLowerCase() === brandTrimmed
      );

      const cleaned: ProductVariant[] = variants
        .filter(variantHasData)
        .map(v => ({
          ...(v.flavor ? { flavor: v.flavor.trim() } : {}),
          ...(v.size ? { size: v.size.trim() } : {}),
          ...(v.dosage ? { dosage: v.dosage.trim() } : {}),
          ...(v.form ? { form: v.form.trim() } : {}),
          ...(v.specs ? { specs: v.specs.trim() } : {}),
          ...(v.dimensions ? { dimensions: v.dimensions.trim() } : {}),
          price: parseNum(v.price) ?? 0,
          ...(v.sku ? { sku: v.sku.trim() } : {}),
          ...(v.expirationDate ? { expirationDate: v.expirationDate } : {}),
        }));

      if (existing) {
        // APPEND variants to existing product
        const mergedVariants = [...(existing.variants ?? []), ...cleaned];
        await updateDoc(doc(db, "products", existing.id), {
          variants: mergedVariants,
          updatedAt: serverTimestamp(),
        });
        const updatedProduct: Product = { ...existing, variants: mergedVariants };
        onAdded({ product: updatedProduct, isUpdate: true });
      } else {
        // CREATE new product document
        const payload = {
          name: name.trim(),
          brand: brand.trim(),
          category: category.trim(),
          segment,
          status: "Active",
          is_active: true,
          variants: cleaned,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, "products"), payload);
        onAdded({ product: { id: ref.id, ...payload }, isUpdate: false });
      }
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const showExpiry = categoryNeedsExpiry(category);
  const inputCls = "w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/20 transition-colors";
  const labelCls = "block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

  // Detect matching existing product for preview
  const matchedProduct = existingProducts.find(p =>
    getProductName(p).trim().toLowerCase() === name.trim().toLowerCase() &&
    getBrand(p).trim().toLowerCase() === brand.trim().toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <Plus className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Add New Product</h2>
              <p className="text-[11px] text-slate-500">Variants will be appended if Product + Brand already exists.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Duplicate warning */}
          {matchedProduct && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-300">Product already exists</p>
                <p className="text-[11px] text-amber-400/80 mt-0.5">
                  Saving will <strong>append</strong> new variant(s) to "{getProductName(matchedProduct)}" instead of creating a duplicate document.
                </p>
              </div>
            </div>
          )}

          {/* Base fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Product Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Piattos Cheese" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Brand</label>
              <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Jack 'n Jill" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Segment</label>
              {isCustomSegment ? (
                <div className="flex gap-2">
                  <input autoFocus value={segment} onChange={e => setSegment(e.target.value)} placeholder="Type new segment..." className={inputCls} />
                  <button onClick={() => setIsCustomSegment(false)} className="px-3 rounded-lg bg-slate-800 text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-700 transition-colors text-xs">Cancel</button>
                </div>
              ) : (
                <select value={segment} onChange={e => handleSegmentChange(e.target.value)} className={inputCls}>
                  <option value="">— Select Segment —</option>
                  {uniqueSegments.map(seg => <option key={seg} value={seg}>{seg}</option>)}
                  <option value="ADD_NEW" className="text-emerald-400 font-semibold">+ Add New Segment</option>
                </select>
              )}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Snacks" className={inputCls} />
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className={labelCls + " mb-0"}>Variants</p>
              <button onClick={addVariant}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors">
                <Plus className="w-3 h-3" /> Add Variant
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className={`grid bg-slate-800/60 px-3 py-2 gap-2 ${showExpiry ? "grid-cols-[1fr_90px_100px_110px_90px_32px]" : "grid-cols-[1fr_90px_100px_90px_32px]"}`}>
                {[segFields.field1.label, segFields.field2.label, "SKU", ...(showExpiry ? ["Exp. Date"] : []), "Price", ""].map(h => (
                  <p key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</p>
                ))}
              </div>
              <div className="divide-y divide-slate-800/60">
                {variants.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">No variants. Click "Add Variant" to begin.</p>
                )}
                {variants.map((v, i) => (
                  <div key={i} className={`grid px-3 py-2 gap-2 items-center hover:bg-slate-800/20 ${showExpiry ? "grid-cols-[1fr_90px_100px_110px_90px_32px]" : "grid-cols-[1fr_90px_100px_90px_32px]"}`}>
                    <input value={v[segFields.field1.key] || ""} onChange={e => updateVariant(i, segFields.field1.key, e.target.value)}
                      placeholder={segFields.field1.placeholder} className={inputCls + " py-1.5 text-xs"} />
                    <input value={v[segFields.field2.key] || ""} onChange={e => updateVariant(i, segFields.field2.key, e.target.value)}
                      placeholder={segFields.field2.placeholder} className={inputCls + " py-1.5 text-xs"} />
                    <input value={v.sku || ""} onChange={e => updateVariant(i, "sku", e.target.value)}
                      placeholder="e.g. ABC-001" className={inputCls + " py-1.5 text-xs"} />
                    {showExpiry && (
                      <input type="date" value={v.expirationDate || ""}
                        onChange={e => updateVariant(i, "expirationDate", e.target.value)}
                        className={inputCls + " py-1.5 text-xs"} />
                    )}
                    <input type="number" min="0" step="0.01"
                      value={v.price !== undefined && v.price !== "" ? v.price : ""}
                      onChange={e => updateVariant(i, "price", e.target.value)}
                      placeholder="0.00" className={inputCls + " py-1.5 text-xs"} />
                    <button onClick={() => removeVariant(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {showExpiry && (
              <p className="text-[10px] text-slate-600 mt-1.5 ml-0.5">* Expiration Date applies to perishable/medicine categories only.</p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/25 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-800 bg-slate-900/80 shrink-0">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/50 transition-colors">
            Cancel
          </button>
          <button onClick={handleAdd} disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Save Product"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Action Button (standardized) ─────────────────────────────────────────────
type ActionTone = "view" | "edit" | "archive" | "danger";

function TooltipButton({
  icon: Icon,
  label,
  tone = "view",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tone?: ActionTone;
  onClick: () => void;
}) {
  const tooltipId = useId();

  const variants = {
    view: "bg-blue-600/90 border-blue-400/80 text-white hover:bg-blue-500 hover:border-blue-300 shadow-[0_2px_10px_rgba(37,99,235,0.2)]",
    edit: "bg-emerald-700/90 border-emerald-400/80 text-white hover:bg-emerald-600 hover:border-emerald-300 shadow-[0_2px_10px_rgba(4,120,87,0.2)]",
    archive: "bg-slate-700/90 border-slate-500/80 text-white hover:bg-slate-600 hover:border-slate-400 shadow-[0_2px_10px_rgba(51,65,85,0.2)]",
    danger: "bg-red-800/90 border-red-500/80 text-white hover:bg-red-700 hover:border-red-400 shadow-[0_2px_10px_rgba(153,27,27,0.2)]"
  };

  const activeVariant = variants[tone];

  return (
    <span className="group/btn relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={tooltipId}
        onClick={onClick}
        className={`inline-flex select-none items-center justify-center rounded-[10px] w-8 h-8 border-[2px] outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-indigo-500 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 ${activeVariant}`}
      >
        <Icon className="w-4 h-4" strokeWidth={2.5} />
      </button>

      {/* Tooltip */}
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 opacity-0 shadow-xl shadow-black/50 transition-all duration-200 translate-y-1 group-hover/btn:translate-y-0 group-hover/btn:opacity-100"
      >
        {label}
        {/* Tooltip Arrow */}
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-slate-700" />
      </span>
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MasterProductCatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [segmentFilter, setSegmentFilter] = useState("All");
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "products"));
      const data: Product[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      data.sort((a, b) => (getProductName(a)).localeCompare(getProductName(b)));
      setProducts(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleArchive = async (p: Product) => {
    if (!confirm(`Are you sure you want to archive "${getProductName(p)}"? It will be hidden from the catalog.`)) return;
    await updateDoc(doc(db, "products", p.id), { status: "Archived", is_active: false, updatedAt: serverTimestamp() });
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: "Archived", is_active: false } : x));
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Are you sure you want to delete "${getProductName(p)}"? This action cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "products", p.id));
      setProducts(prev => prev.filter(x => x.id !== p.id));
    } catch (e) {
      alert("Failed to delete product. Please try again.");
    }
  };

  const handleRestore = async (p: Product) => {
    await updateDoc(doc(db, "products", p.id), { status: "Active", is_active: true, updatedAt: serverTimestamp() });
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: "Active", is_active: true } : x));
  };

  const handleSaved = (updated: Product) => {
    setProducts(prev => prev.map(x => x.id === updated.id ? updated : x));
  };

  const handleAdded = ({ product, isUpdate }: { product: Product; isUpdate: boolean }) => {
    if (isUpdate) {
      setProducts(prev => prev.map(p => p.id === product.id ? product : p));
    } else {
      setProducts(prev => [product, ...prev].sort((a, b) => getProductName(a).localeCompare(getProductName(b))));
    }
  };

  const filtered = useMemo(() => products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      getProductName(p).toLowerCase().includes(q) ||
      getBrand(p).toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || getStatus(p) === statusFilter;
    const matchSeg = segmentFilter === "All" || p.segment === segmentFilter;
    return matchSearch && matchStatus && matchSeg;
  }), [products, search, statusFilter, segmentFilter]);

  const total = products.length;
  const active = products.filter(p => getStatus(p) === "Active").length;
  const archived = products.filter(p => getStatus(p) === "Archived").length;
  const grocery = products.filter(p => getStatus(p) === "Active" && p.segment === "Grocery").length;
  const hardware = products.filter(p => getStatus(p) === "Active" && p.segment === "Hardware").length;
  const pharmacy = products.filter(p => getStatus(p) === "Active" && p.segment === "Pharmacy").length;
  const pct = (n: number) => total ? `${Math.round(n / total * 100)}% of total` : "0%";

  const tableHeaders = getTableHeaders(segmentFilter);

  return (
    <div className="w-full px-6 lg:px-8 space-y-5 pb-8">

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-indigo-400" />
            </div>
            Master Product Catalog
          </h1>
          <p className="text-xs text-slate-500 mt-1 ml-[42px]">Manage all products, variations, and approvals across all segments.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Add Product */}
          <button onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white border border-emerald-500/50 transition-colors shadow-sm shadow-emerald-900/30">
            <Plus className="w-3.5 h-3.5" /> Add Product
          </button>
          <button onClick={() => exportCSV(filtered)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white border border-blue-500/50 flex items-center gap-1.5 transition-colors shadow-sm shadow-blue-900/30">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { icon: <Package className="w-4 h-4 text-slate-300" />, bg: "bg-slate-700/70", label: "Total Products", value: total.toLocaleString(), sub: `${active} active · ${archived} archived`, color: "text-white" },
          { icon: <ShoppingCart className="w-4 h-4 text-blue-300" />, bg: "bg-blue-500/20", label: "Grocery", value: grocery.toLocaleString(), sub: pct(grocery), color: "text-blue-400" },
          { icon: <Wrench className="w-4 h-4 text-orange-300" />, bg: "bg-orange-500/20", label: "Hardware", value: hardware.toLocaleString(), sub: pct(hardware), color: "text-orange-400" },
          { icon: <Pill className="w-4 h-4 text-emerald-300" />, bg: "bg-emerald-500/20", label: "Pharmacy", value: pharmacy.toLocaleString(), sub: pct(pharmacy), color: "text-emerald-400" },
          { icon: <FolderArchive className="w-4 h-4 text-slate-400" />, bg: "bg-slate-600/40", label: "Archived", value: archived.toLocaleString(), sub: pct(archived), color: "text-slate-400" },
        ].map(c => (
          <div key={c.label} className="flex items-center gap-3 rounded-xl p-3.5 border border-white/5 bg-slate-800/40">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.bg}`}>{c.icon}</div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 mb-0.5 truncate">{c.label}</p>
              <p className={`text-xl font-bold leading-none ${c.color}`}>{c.value}</p>
              <p className="text-[10px] text-slate-600 mt-0.5 truncate">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table Card ── */}
      <div className="rounded-xl border border-slate-800/80 bg-[#111827] shadow-xl shadow-black/20 overflow-hidden">

        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-3 bg-[#111827]">
          {/* Search (Moved to left) */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Search by name, brand, SKU…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/15" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Segment selector */}
            <div className="relative">
              <select value={segmentFilter} onChange={e => setSegmentFilter(e.target.value)}
                className="appearance-none pl-3 pr-6 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:border-indigo-500/60 cursor-pointer">
                <option value="All">All Segments</option>
                <option value="Hardware">Hardware</option>
                <option value="Grocery">Grocery</option>
                <option value="Pharmacy">Pharmacy</option>
              </select>
              <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {/* Status pills */}
            {["All", "Active", "Archived"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${statusFilter === s
                  ? "bg-slate-700 text-white border border-slate-600"
                  : "text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700"
                  }`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[62vh] custom-scrollbar">
          <table className="w-full text-left table-fixed border-separate border-spacing-0" style={{ minWidth: "960px" }}>
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "21%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky top-0 z-20 bg-[#111827]/90 backdrop-blur-md pl-6 pr-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-left select-none">NO.</th>
                <th className="sticky top-0 z-20 bg-[#111827]/90 backdrop-blur-md px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-left select-none">PRODUCT</th>
                <th className="sticky top-0 z-20 bg-[#111827]/90 backdrop-blur-md px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-left select-none">{tableHeaders[0]}</th>
                <th className="sticky top-0 z-20 bg-[#111827]/90 backdrop-blur-md px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-left select-none">{tableHeaders[1]}</th>
                <th className="sticky top-0 z-20 bg-[#111827]/90 backdrop-blur-md px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-right select-none">PRICING</th>
                <th className="sticky top-0 z-20 bg-[#111827]/90 backdrop-blur-md px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-center select-none">VARIANTS</th>
                <th className="sticky top-0 z-20 bg-[#111827]/90 backdrop-blur-md px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-center select-none">STATUS</th>
                <th className="sticky top-0 right-0 z-30 bg-[#111827]/95 backdrop-blur-md pl-4 pr-6 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-center select-none border-l border-slate-800">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2.5" />
                    <p className="text-xs">Loading catalog…</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <Package className="w-10 h-10 text-slate-700 mx-auto mb-2.5" />
                    <p className="text-sm font-medium text-slate-400">No products match your criteria</p>
                    <p className="text-xs mt-1">Adjust filters or clear the search</p>
                  </td>
                </tr>
              ) : (
                filtered.map((product, index) => {
                  const globalIndex = index + 1;
                  const attrs1 = getAttr1(product);
                  const attrs2 = getAttr2(product);
                  const pricing = getPricing(product);
                  const status = getStatus(product);
                  const isArchived = status === "Archived";
                  const expiryWarn = hasExpiryWarning(product);
                  const variantCount = product.variants?.length
                    ?? ((attrs1.length || attrs2.length) || pricing !== "—" ? 1 : 0);

                  const ATTR1_MAX = 2;
                  const shownAttrs1 = attrs1.slice(0, ATTR1_MAX);
                  const extraAttrs1 = attrs1.length - ATTR1_MAX;

                  const ATTR2_MAX = 2;
                  const shownAttrs2 = attrs2.slice(0, ATTR2_MAX);
                  const extraAttrs2 = attrs2.length - ATTR2_MAX;

                  return (
                    <tr key={product.id}
                      className="group transition-colors duration-150 hover:bg-slate-800/40">

                      {/* Number Column */}
                      <td className={`pl-6 pr-4 py-3 align-middle text-[13px] font-medium text-slate-400 ${isArchived ? "opacity-50" : ""} ${expiryWarn ? "border-l-2 border-amber-500/60" : ""}`}>
                        {globalIndex}
                      </td>

                      {/* Product Column */}
                      <td className={`px-4 py-3 overflow-hidden align-middle ${isArchived ? "opacity-50" : ""}`}>
                        <div className="flex items-center gap-3">
                          {/* Thumbnail */}
                          <div className="w-9 h-9 rounded-lg bg-slate-800/80 border border-white/5 flex items-center justify-center shrink-0">
                            <Package className="w-4 h-4 text-slate-500" />
                          </div>
                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {expiryWarn && (
                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 border border-amber-500/30 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Expiring
                                </span>
                              )}
                              <p className="truncate text-[14px] font-semibold text-slate-100 leading-snug" title={getProductName(product)}>{getProductName(product)}</p>
                            </div>
                            <p className="mt-0.5 truncate text-xs font-medium text-slate-400" title={getBrand(product)}>{getBrand(product) || "—"}</p>
                            {product.category ? (
                              <div className="mt-1">
                                <span className={`inline-block truncate text-[11px] font-semibold px-2 py-0.5 rounded-full border ${categoryStyle(product.category)}`}>
                                  {product.category}
                                </span>
                              </div>
                            ) : (
                              <div className="mt-1"><span className="text-xs text-slate-600">—</span></div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Attributes */}
                      <td className={`px-4 py-3 overflow-hidden align-middle text-left ${isArchived ? "opacity-50" : ""}`}>
                        {attrs1.length > 0 ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="truncate text-[13px] text-slate-300 leading-snug" title={shownAttrs1.join(", ")}>
                              {shownAttrs1.join(", ")}
                            </p>
                            {extraAttrs1 > 0 && <ExpandMore items={attrs1.slice(ATTR1_MAX)} label={`+${extraAttrs1}`} />}
                          </div>
                        ) : (
                          <span className="text-[13px] text-slate-600">—</span>
                        )}
                      </td>

                      {/* Attribute details */}
                      <td className={`px-4 py-3 overflow-hidden align-middle text-left ${isArchived ? "opacity-50" : ""}`}>
                        {attrs2.length > 0 ? (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="truncate text-[13px] text-slate-400 font-mono leading-snug" title={shownAttrs2.join(", ")}>
                              {shownAttrs2.join(", ")}
                            </p>
                            {extraAttrs2 > 0 && <ExpandMore items={attrs2.slice(ATTR2_MAX)} label={`+${extraAttrs2}`} />}
                          </div>
                        ) : (
                          <span className="text-[13px] text-slate-600">—</span>
                        )}
                      </td>

                      {/* Pricing */}
                      <td className={`px-4 py-3 align-middle text-right ${isArchived ? "opacity-50" : ""}`}>
                        {pricing !== "—" ? (
                          <span className="whitespace-nowrap font-mono text-[13px] font-semibold text-emerald-400 tabular-nums">{pricing}</span>
                        ) : (
                          <span className="text-[13px] text-slate-600">—</span>
                        )}
                      </td>

                      {/* Variant Count Badge */}
                      <td className={`px-4 py-3 align-middle text-center ${isArchived ? "opacity-50" : ""}`}>
                        {variantCount > 0 ? (
                          <span title={`${variantCount} Total Variant${variantCount > 1 ? 's' : ''}`}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
                            <Layers className="w-3 h-3" /> {variantCount} {variantCount > 1 ? 'Variants' : 'Variant'}
                          </span>
                        ) : (
                          <span className="text-[13px] text-slate-600">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 align-middle text-center">
                        <StatusBadge status={status} />
                      </td>

                      {/* Actions — sticky, opaque bg to match card */}
                      <td className="sticky right-0 z-10 bg-[#111827] group-hover:bg-[#161f2f] pl-4 pr-6 py-3 align-middle border-l border-slate-800/60 transition-colors duration-150">
                        <div className="flex items-center justify-center gap-2">
                          <TooltipButton icon={Eye} label="View Details" tone="view" onClick={() => setViewProduct(product)} />
                          <TooltipButton icon={Pencil} label="Edit Product" tone="edit" onClick={() => setEditProduct(product)} />
                          {isArchived ? (
                            <TooltipButton icon={RotateCcw} label="Restore Product" tone="archive" onClick={() => handleRestore(product)} />
                          ) : (
                            <TooltipButton icon={Archive} label="Archive Product" tone="archive" onClick={() => handleArchive(product)} />
                          )}
                          <TooltipButton icon={Trash2} label="Delete Product" tone="danger" onClick={() => handleDelete(product)} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-800 bg-[#111827] flex items-center justify-between">
            <p className="text-[11px] text-slate-500">
              Showing <span className="text-slate-300 font-semibold">{filtered.length.toLocaleString()}</span>
              {filtered.length !== products.length && (
                <> of <span className="text-slate-300 font-semibold">{products.length.toLocaleString()}</span></>
              )}{" "}products
            </p>
          </div>
        )}
      </div>

      {/* View Modal */}
      {viewProduct && <ViewModal product={viewProduct} onClose={() => setViewProduct(null)} />}

      {/* Edit Modal */}
      {editProduct && (
        <EditModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <AddProductModal
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
          existingProducts={products}
        />
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <ImportCsvModal
          existingProducts={products}
          onClose={() => setShowImportModal(false)}
          onImported={(imported) => {
            setProducts(prev => {
              const updatedIds = new Set(imported.map(p => p.id));
              const filtered = prev.filter(p => !updatedIds.has(p.id));
              return [...imported, ...filtered].sort((a, b) => getProductName(a).localeCompare(getProductName(b)));
            });
          }}
        />
      )}
    </div>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

