"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, X, AlertTriangle, Check, Save, Loader2, Upload, ImagePlus, Link2, Trash2
} from "lucide-react";
import { db, storage } from "@/lib/firebase/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/firebase/auth-context";
import { notifyAdminNewRequest } from "@/lib/firebase/notifications";

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
  const { appUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName]               = useState("");
  const [brand, setBrand]             = useState("");
  const [segment, setSegment]         = useState("");
  const [category, setCategory]       = useState("");
  const [description, setDescription] = useState("");
  const [variants, setVariants]       = useState<VariantRow[]>([{ flavor: "", size: "", sku: "", price: "" }]);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  // Image state
  const [imageMode, setImageMode]     = useState<"upload" | "url">("upload");
  const [imageUrl, setImageUrl]       = useState("");           
  const [urlInput, setUrlInput]       = useState("");           
  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [uploading, setUploading]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver]       = useState(false);

  // Reset every time modal opens
  useEffect(() => {
    if (!open) return;
    setName(""); setBrand(""); setCategory("");
    setDescription(""); setVariants([{ flavor: "", size: "", sku: "", price: "" }]);
    setError(""); setSuccess("");
    setImageMode("upload"); setImageUrl(""); setUrlInput("");
    setImageFile(null); setImagePreview(""); setUploadProgress(0);

    const planStr = (appUser?.plan ?? "").toLowerCase();
    const proPlan = planStr === "pro" || planStr === "professional" || planStr === "enterprise" || planStr === "unlimited";
    if (!proPlan && appUser?.selectedSegment) {
      setSegment(appUser.selectedSegment);
    } else {
      setSegment("");
    }
  }, [open, appUser]);

  // ── Image helpers ────────────────────────────────────────────────────────────
  const applyFile = (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Image must be smaller than 5 MB."); return; }
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageUrl(""); // clear previous URL until upload finishes
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) applyFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
    e.target.value = ""; // allow re-selecting same file
  };

  const clearImage = () => {
    setImageFile(null); setImagePreview(""); setImageUrl(""); setUrlInput(""); setUploadProgress(0);
  };

  const uploadImageToStorage = async (file: File, productName: string): Promise<string> => {
    setUploading(true); setUploadProgress(0);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `product-images/${Date.now()}_${productName.replace(/\s+/g, "_")}.${ext}`;
    const fileRef = ref(storage, path);

    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(fileRef, file);
      task.on("state_changed",
        snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        err => { setUploading(false); reject(err); },
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          setUploading(false); setUploadProgress(100);
          resolve(url);
        }
      );
    });
  };

  const updateVariant = (i: number, field: keyof VariantRow, val: string) =>
    setVariants(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: val } : v));
  const addVariant = () =>
    setVariants(prev => [...prev, { flavor: "", size: "", sku: "", price: "" }]);
  const removeVariant = (i: number) =>
    setVariants(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { setError("Product name is required."); return; }
    setSaving(true); setError("");

    try {
      let finalImageUrl = "";
      if (imageMode === "upload" && imageFile) {
        finalImageUrl = await uploadImageToStorage(imageFile, name.trim());
      } else if (imageMode === "url" && urlInput.trim()) {
        finalImageUrl = urlInput.trim();
      }

      const cleanedVariants = variants
        .filter(v => v.flavor || v.size || v.sku || v.price)
        .map(v => ({
          ...(v.flavor ? { flavor: v.flavor.trim() } : {}),
          ...(v.size   ? { size:   v.size.trim()   } : {}),
          ...(v.sku    ? { sku:    v.sku.trim()    } : {}),
          price: parseFloat(v.price) || 0,
        }));

      const payload = {
        name:         name.trim(),
        brand:        brand.trim(),
        segment:      segment || "Grocery",
        category:     category.trim(),
        description:  description.trim(),
        image_url:    finalImageUrl,
        status:       "Active",
        is_active:    true,
        variants:     cleanedVariants,
        addedByName:  appUser?.fullName || appUser?.email || "Consumer",
        addedByEmail: appUser?.email || "",
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "products"), payload);

      try {
        await notifyAdminNewRequest({
          requestId:        docRef.id,
          productName:      payload.name,
          category:         payload.category || payload.segment,
          requestedByName:  payload.addedByName,
          requestedByEmail: payload.addedByEmail,
        });
      } catch { /* non-critical */ }

      setSuccess(`"${payload.name}" has been added to the Master Catalog. The admin has been notified.`);
      onAdded?.();
      setTimeout(() => { setSuccess(""); onClose(); }, 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const planStr = (appUser?.plan ?? "").toLowerCase();
  const isPro = planStr === "pro" || planStr === "professional" || planStr === "enterprise" || planStr === "unlimited";

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
              <p className="text-[11px] text-slate-500">Variants will be appended if Product + Brand already exists.</p>
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
            <span>This will directly add the product to the Master Catalog. The admin will be notified with your name and product details.</span>
          </div>

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
              <select 
                value={segment} 
                onChange={e => setSegment(e.target.value)} 
                className={`${inputCls} ${!isPro ? "opacity-70 cursor-not-allowed appearance-none pr-3" : ""}`}
                disabled={!isPro}
              >
                {!isPro ? (
                  <option value={appUser?.selectedSegment || ""}>{appUser?.selectedSegment || "— Select Segment —"}</option>
                ) : (
                  <>
                    <option value="">— Select Segment —</option>
                    <option value="Grocery">Grocery</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Pharmacy">Pharmacy</option>
                  </>
                )}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Category</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Snacks" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Description <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span></label>
              <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief product description…" className={inputCls + " resize-none"} />
            </div>
            {/* ── Image Upload ── */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className={labelCls + " mb-0"}>Product Image <span className="text-slate-600 normal-case tracking-normal font-normal">(optional)</span></label>
                {/* Tab toggle */}
                <div className="flex rounded-lg overflow-hidden border border-slate-700 text-[10px] font-semibold">
                  <button
                    onClick={() => setImageMode("upload")}
                    className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${imageMode === "upload" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
                  >
                    <ImagePlus className="w-3 h-3" /> Upload File
                  </button>
                  <button
                    onClick={() => setImageMode("url")}
                    className={`flex items-center gap-1 px-3 py-1.5 transition-colors ${imageMode === "url" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
                  >
                    <Link2 className="w-3 h-3" /> Paste URL
                  </button>
                </div>
              </div>

              {imageMode === "upload" ? (
                /* ── FILE UPLOAD ZONE ── */
                imagePreview ? (
                  <div className="flex items-center gap-4 p-3 rounded-xl border border-slate-700 bg-slate-800/40">
                    <img src={imagePreview} alt="Preview" className="w-20 h-20 rounded-lg object-cover border border-slate-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-300 truncate">{imageFile?.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{imageFile ? (imageFile.size / 1024).toFixed(0) + " KB" : ""}</p>
                      {/* Progress bar */}
                      {uploading && (
                        <div className="mt-2">
                          <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-indigo-400 mt-1">Uploading… {uploadProgress}%</p>
                        </div>
                      )}
                      {uploadProgress === 100 && !uploading && (
                        <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Uploaded successfully
                        </p>
                      )}
                    </div>
                    <button
                      onClick={clearImage}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleFileDrop}
                    className={`relative flex flex-col items-center justify-center gap-2 h-32 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                      dragOver
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-slate-700 bg-slate-800/30 hover:border-indigo-500/60 hover:bg-slate-800/60"
                    }`}
                  >
                    <ImagePlus className={`w-7 h-7 transition-colors ${dragOver ? "text-indigo-400" : "text-slate-600"}`} />
                    <div className="text-center">
                      <p className="text-xs font-medium text-slate-400">
                        <span className="text-indigo-400">Click to browse</span> or drag & drop
                      </p>
                      <p className="text-[10px] text-slate-600 mt-0.5">PNG, JPG, WEBP · Max 5 MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                )
              ) : (
                /* ── URL INPUT ── */
                <div>
                  <input
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://example.com/product-image.jpg"
                    className={inputCls}
                  />
                  {urlInput.trim() && (
                    <div className="mt-2 flex items-center gap-3">
                      <img
                        src={urlInput.trim()}
                        alt="Preview"
                        className="w-14 h-14 rounded-lg border border-slate-700 object-cover bg-slate-800"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <span className="text-[10px] text-slate-500">Image preview</span>
                    </div>
                  )}
                </div>
              )}
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
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end gap-2 shrink-0">
          <button onClick={onClose} disabled={saving || uploading}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || uploading || !!success}
            className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-white transition-colors">
            {saving || uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {uploading ? `Uploading ${uploadProgress}%…` : saving ? "Saving…" : "Save Product"}
          </button>
        </div>
      </div>
    </div>
  );
}