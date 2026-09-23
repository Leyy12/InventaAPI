"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, X, AlertTriangle, Check, Save, Loader2, Upload
} from "lucide-react";
import { normalizeProductImageUrl } from "@/lib/product-image-url";
import { useAuth } from "@/lib/firebase/auth-context";
import { activeCustomerSegment, restrictedSegmentAccount } from '../../../../services/customer-segment.js';

interface AddProductModalProps {
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
}

const inputCls = "w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/20 transition-colors";
const labelCls = "block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

interface VariantRow {
  flavor: string;
  size: string;
  sku: string;
  price: string;
}

export default function AddProductModal({ open, onClose, onAdded }: AddProductModalProps) {
  const { user, appUser } = useAuth();
  const segmentLocked = restrictedSegmentAccount(appUser);
  const busy = useRef(false);
  const attempt = useRef<{ uid: string; key: string; body: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  const [name, setName]             = useState("");
  const [brand, setBrand]           = useState("");
  const [paidSegment, setSegment]   = useState("");
  const segment = segmentLocked ? activeCustomerSegment(appUser) || '' : paidSegment;
  const [category, setCategory]     = useState("");
  const [description, setDescription] = useState("");
  const [variants, setVariants]     = useState<VariantRow[]>([{ flavor: "", size: "", sku: "", price: "" }]);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");

  // Preserve an uncertain operation across close/reopen; retry its exact immutable payload.
  useEffect(() => {
    if (!open || attempt.current) return;
    setName(""); setBrand(""); setSegment(""); setCategory("");
    setImageUrl(""); setDescription(""); setVariants([{ flavor: "", size: "", sku: "", price: "" }]);
    setError(""); setSuccess("");
  }, [open]);

  const updateVariant = (i: number, field: keyof VariantRow, val: string) =>
    setVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  const addVariant = () =>
    setVariants(prev => [...prev, { flavor: "", size: "", sku: "", price: "" }]);
  const removeVariant = (i: number) =>
    setVariants(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (busy.current || success) return;
    if (!user || typeof user.getIdToken !== "function") { setError("Please sign in again."); return; }
    if (!name.trim() || !category.trim() || !segment) { setError("Name, category and segment are required."); return; }
    busy.current = true;
    setSaving(true); setError("");
    try {
      if (attempt.current && attempt.current.uid !== user.uid) throw new Error("Sign back into the submitting account to retry.");
      if (!attempt.current) {
        const cleanedVariants = variants.filter(v => v.flavor || v.size || v.sku || v.price).map(v => {
          const price = v.price.trim() ? Number(v.price) : 0;
          if (!Number.isFinite(price) || price < 0) throw new Error("Invalid variant price.");
          return { flavor: v.flavor.trim(), size: v.size.trim(), sku: v.sku.trim(), price };
        });
        const payload = { name: name.trim(), brand: brand.trim(), segment, category: category.trim(),
          description: description.trim(), variants: cleanedVariants, image_url: normalizeProductImageUrl(imageUrl) };
        attempt.current = { uid: user.uid, key: crypto.randomUUID(), body: JSON.stringify(payload) };
      }
      setPending(true);
      const token = await user.getIdToken();
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
      const response = await fetch(base + "/api/v1/product-submissions", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key }, body: attempt.current.body,
      });
      const result = await response.json();
      if (!response.ok) {
        // A validation failure cannot have committed. Other errors retain the operation for safe retry.
        if (response.status === 400) { attempt.current = null; setPending(false); }
        throw new Error(result.error || "Submission failed. Retry the same submission.");
      }
      setSuccess(`Submitted for review (reference: ${result.id}). Only Admin approval publishes to the catalog.`);
      attempt.current = null; setPending(false);
      onAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission uncertain. Retry the same submission.");
    } finally {
      busy.current = false; setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/60 overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <Plus className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Add New Product</h2>
              <p className="text-[11px] text-slate-500">Submit product information for Admin review.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Success banner */}
          {success && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-medium">
              <Check className="w-3.5 h-3.5 shrink-0" /> {success}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          {/* Info note */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20 text-xs text-indigo-300/80">
            <Upload className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-400" />
            <span>This submits a review request, not a catalog product. Admin approval is required before publication.</span>
          </div>

          <fieldset disabled={saving || pending || !!success} className="space-y-5">
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
              <label className={labelCls}>Segment *</label>
              <select aria-label="Segment" disabled={segmentLocked} value={segment} onChange={e => setSegment(e.target.value)} className={inputCls}>
                <option value="">— Select Segment —</option>
                <option value="Grocery">Grocery</option>
                <option value="Hardware">Hardware</option>
                <option value="Pharmacy">Pharmacy</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Category *</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Snacks" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Description <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span></label>
              <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief product description…" className={inputCls + " resize-none"} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Image URL (optional, HTTPS)</label>
            <input type="url" maxLength={2048} value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              placeholder="https://example.com/product.jpg" className={inputCls} />
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
              {/* Header row */}
              <div className="grid grid-cols-[1fr_90px_110px_90px_32px] bg-slate-800/60 px-3 py-2 gap-2">
                {["Flavor", "Size", "SKU", "Price", ""].map(h => (
                  <p key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</p>
                ))}
              </div>

              {/* Variant rows */}
              <div className="divide-y divide-slate-800/60">
                {variants.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">No variants. Click "Add Variant" to begin.</p>
                )}
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_110px_90px_32px] px-3 py-2 gap-2 items-center hover:bg-slate-800/20">
                    <input value={v.flavor} onChange={e => updateVariant(i, "flavor", e.target.value)}
                      placeholder="e.g. Cheese" className={inputCls + " py-1.5 text-xs"} />
                    <input value={v.size} onChange={e => updateVariant(i, "size", e.target.value)}
                      placeholder="e.g. 85g" className={inputCls + " py-1.5 text-xs"} />
                    <input value={v.sku} onChange={e => updateVariant(i, "sku", e.target.value)}
                      placeholder="e.g. ABC-001" className={inputCls + " py-1.5 text-xs"} />
                    <input type="number" min="0" step="0.01" value={v.price}
                      onChange={e => updateVariant(i, "price", e.target.value)}
                      placeholder="0.00" className={inputCls + " py-1.5 text-xs"} />
                    <button onClick={() => removeVariant(i)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </fieldset>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end gap-2 shrink-0">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !!success}
            className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Submitting…" : pending ? "Retry Same Submission" : "Submit for Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
