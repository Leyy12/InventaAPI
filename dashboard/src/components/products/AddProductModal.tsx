"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  Plus, X, Save, Loader2, Upload
} from "lucide-react";
import { normalizeProductImageUrl } from "@/lib/product-image-url";
import { useAuth } from "@/lib/supabase/auth-context";
import ProductImageField from './ProductImageField';
import { uploadProductImage, type MediaUpload } from '@/lib/product-media-client';
import { activeCustomerSegment, restrictedSegmentAccount } from '../../../../services/customer-segment.js';
import SubmissionFeedbackDialog, { trapSubmissionFocus, type SubmissionFeedback } from './SubmissionFeedbackDialog';

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
}

export default function AddProductModal({ open, onClose, onAdded }: AddProductModalProps) {
  const { user, appUser } = useAuth();
  const segmentLocked = restrictedSegmentAccount(appUser);
  const busy = useRef(false);
  const accepted = useRef(false);
  const formRef = useRef<HTMLDialogElement>(null);
  const attempt = useRef<{ uid: string; key: string; body: string; media?: MediaUpload } | null>(null);
  const [pending, setPending] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [name, setName]             = useState("");
  const [brand, setBrand]           = useState("");
  const [paidSegment, setSegment]   = useState("");
  const segment = segmentLocked ? activeCustomerSegment(appUser) || '' : paidSegment;
  const [category, setCategory]     = useState("");
  const [description, setDescription] = useState("");
  const [variants, setVariants]     = useState<VariantRow[]>([{ flavor: "", size: "", sku: "" }]);
  const [saving, setSaving]         = useState(false);
  const [feedback, setFeedback] = useState<SubmissionFeedback | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useLayoutEffect(() => {
    const dialog = formRef.current;
    if (!open || confirmed || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, confirmed]);

  // Preserve an uncertain operation across close/reopen; retry its exact immutable payload.
  useEffect(() => {
    if (!open || attempt.current) return;
    setName(""); setBrand(""); setSegment(""); setCategory("");
    setImageUrl(""); setImageFile(null); setDescription(""); setVariants([{ flavor: "", size: "", sku: "" }]);
    setConfirmed(false);
    accepted.current = false;
  }, [open]);

  const updateVariant = (i: number, field: keyof VariantRow, val: string) =>
    setVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  const addVariant = () =>
    setVariants(prev => [...prev, { flavor: "", size: "", sku: "" }]);
  const removeVariant = (i: number) =>
    setVariants(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (busy.current || accepted.current) return;
    if (!user || typeof user.getIdToken !== "function") { setFeedback({ kind: 'error', message: 'Please sign in again before submitting.' }); return; }
    if (!name.trim() || !category.trim() || !segment) { setFeedback({ kind: 'error', message: 'Product name, category and segment are required.' }); return; }
    busy.current = true;
    setSaving(true); setFeedback(null);
    let submissionSent = false;
    let succeeded = false;
    try {
      if (attempt.current && attempt.current.uid !== user.uid) throw new Error("Sign back into the submitting account to retry.");
      if (!attempt.current) {
        const cleanedVariants = variants.filter(v => v.flavor || v.size || v.sku)
          .map(v => ({ flavor: v.flavor.trim(), size: v.size.trim(), sku: v.sku.trim() }));
        const payload = { name: name.trim(), brand: brand.trim(), segment, category: category.trim(),
          description: description.trim(), variants: cleanedVariants, image_url: normalizeProductImageUrl(imageUrl) };
        const key = crypto.randomUUID();
        attempt.current = { uid: user.uid, key, body: JSON.stringify(payload),
          ...(imageFile ? { media: { uid: user.uid, key, file: imageFile } } : {}) };
      }
      setPending(true);
      if (attempt.current.media && !attempt.current.media.assetId) {
        const assetId = await uploadProductImage(user, 'submission', attempt.current.media);
        attempt.current.body = JSON.stringify({ ...JSON.parse(attempt.current.body), image_asset_id: assetId });
      }
      const token = await user.getIdToken();
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
      submissionSent = true;
      const response = await fetch(base + "/api/v1/product-submissions", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key }, body: attempt.current.body,
      });
      const result = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(result.error || 'The request was not confirmed.'), { status: response.status });
      }
      if (typeof result.id !== 'string' || !result.id.trim()) throw new Error('Submission reference unavailable.');
      setFeedback({ kind: 'success', reference: result.id,
        message: 'Your product has been sent to Admin for review. It will appear in the catalog only after Admin approval.' });
      setConfirmed(true);
      accepted.current = true;
      succeeded = true;
      attempt.current = null; setPending(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const uncertain = submissionSent && (!status || status >= 500);
      setFeedback({ kind: uncertain ? 'uncertain' : 'error', message: uncertain
        ? 'We could not confirm the result. Your request may have reached us. Retry the same submission to safely check its result; do not start a new request.'
        : err instanceof Error ? err.message : 'Please return to the form and retry the same request.' });
    } finally {
      busy.current = false; setSaving(false);
    }
    if (succeeded) { onClose(); onAdded?.(); }
  };

  return <>
    {open && !confirmed && <dialog ref={formRef} aria-labelledby="add-product-title" aria-describedby="add-product-description" aria-busy={saving}
      onKeyDown={trapSubmissionFocus}
      onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-3xl max-h-[calc(100dvh-2rem)] rounded-2xl border border-slate-700/80 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/85 backdrop:backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <Plus className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 id="add-product-title" className="text-sm font-bold text-white">Add New Product</h2>
              <p id="add-product-description" className="text-[11px] text-slate-500">Submit product information for Admin review.</p>
            </div>
          </div>
          <button type="button" aria-label="Close Add Product" disabled={saving} onClick={() => { if (!busy.current) onClose(); }} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Info note */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20 text-xs text-indigo-300/80">
            <Upload className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-400" />
            <span>This submits a review request, not a catalog product. Admin approval is required before publication.</span>
          </div>

          {pending && !saving && <p role="status" className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-200">This request is saved for retry. Its details and image stay unchanged until the result is confirmed.</p>}
          <fieldset disabled={saving || pending} className="min-w-0 space-y-5">
          {/* Base fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Product Name *</label>
              <input aria-label="Product name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Piattos Cheese" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Brand</label>
              <input aria-label="Brand" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Jack 'n Jill" className={inputCls} />
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
              <input aria-label="Category" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Snacks" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Description <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span></label>
              <textarea aria-label="Description" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief product description…" className={inputCls + " resize-none"} />
            </div>
          </div>

          <ProductImageField imageUrl={imageUrl} onImageUrlChange={setImageUrl} file={imageFile} onFileChange={setImageFile}
            disabled={saving || pending} />

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
              <div className="hidden sm:grid grid-cols-[1fr_90px_110px_32px] bg-slate-800/60 px-3 py-2 gap-2">
                {["Flavor", "Size", "SKU", ""].map(h => (
                  <p key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{h}</p>
                ))}
              </div>

              {/* Variant rows */}
              <div className="divide-y divide-slate-800/60">
                {variants.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">No variants. Click &quot;Add Variant&quot; to begin.</p>
                )}
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_90px_110px_32px] px-3 py-2 gap-2 items-center hover:bg-slate-800/20">
                    <input aria-label={`Variant ${i + 1} flavor`} value={v.flavor} onChange={e => updateVariant(i, "flavor", e.target.value)}
                      placeholder="e.g. Cheese" className={inputCls + " py-1.5 text-xs"} />
                    <input aria-label={`Variant ${i + 1} size`} value={v.size} onChange={e => updateVariant(i, "size", e.target.value)}
                      placeholder="e.g. 85g" className={inputCls + " py-1.5 text-xs"} />
                    <input aria-label={`Variant ${i + 1} SKU`} value={v.sku} onChange={e => updateVariant(i, "sku", e.target.value)}
                      placeholder="e.g. ABC-001" className={inputCls + " py-1.5 text-xs"} />
                    <button type="button" aria-label={`Remove variant ${i + 1}`} onClick={() => removeVariant(i)}
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
        <div className="px-4 sm:px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-end gap-2 shrink-0">
          {saving && <p role="status" className="mr-auto text-xs text-emerald-300">Submitting your product…</p>}
          <button type="button" disabled={saving} onClick={() => { if (!busy.current) onClose(); }}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={() => { void handleSave(); }} disabled={saving}
            className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Submitting…" : pending ? "Retry Same Submission" : "Submit for Review"}
          </button>
        </div>
      </div>
    </dialog>}
    {feedback && <SubmissionFeedbackDialog key={feedback.kind} feedback={feedback} onDismiss={() => setFeedback(null)} />}
  </>;
}
