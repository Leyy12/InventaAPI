"use client";

import { useEffect, useId, useState } from 'react';
import { ImageOff, ImagePlus, X } from 'lucide-react';
import { productImageSource } from '@/lib/product-image-url';
import { uploadProductImage, type MediaUpload, type MediaUser } from '@/lib/product-media-client';

// A variant row may hold a photo picked in this form (`_file`) until the product is saved.
export type VariantPhotoFields = { image_url?: string; image_asset_id?: string; _file?: File };

export function variantPhotoError(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const allowed: Record<string, string[]> = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] };
  if (!extension || !(allowed[file.type] || []).includes(extension)) return 'Choose a JPEG, PNG or WebP photo.';
  if (!file.size || file.size > 3 * 1024 * 1024) return 'Choose a photo no larger than 3 MB.';
  return null;
}

// Uploads each picked photo once (variants sharing one file share one upload) and returns
// variants ready to save. `uploads` keeps upload keys so a retry reuses the same upload.
export async function withUploadedVariantPhotos<T extends VariantPhotoFields>(
  user: MediaUser, variants: T[], uploads: Map<File, MediaUpload>,
): Promise<Omit<T, '_file'>[]> {
  const result: Omit<T, '_file'>[] = [];
  for (const variant of variants) {
    const { _file, ...rest } = variant;
    if (!_file) { result.push(rest); continue; }
    let operation = uploads.get(_file);
    if (!operation) { operation = { uid: user.uid, key: crypto.randomUUID(), file: _file }; uploads.set(_file, operation); }
    result.push({ ...rest, image_url: '', image_asset_id: await uploadProductImage(user, 'catalog', operation) });
  }
  return result;
}

// Gives the picked photo to this variant and to other variants of the same flavor
// (e.g. every size of "Hot & Spicy") that have no photo yet or shared its old photo.
export function pickVariantPhoto<T extends VariantPhotoFields>(variants: T[], index: number, file: File, groupOf: (variant: T) => string): T[] {
  const group = groupOf(variants[index]).trim().toLowerCase();
  const photo = (variant: T) => variant._file ?? (variant.image_asset_id || variant.image_url || '');
  const previous = photo(variants[index]);
  return variants.map((variant, i) => {
    const own = photo(variant);
    const sameGroup = group && groupOf(variant).trim().toLowerCase() === group && (!own || own === previous);
    return i === index || sameGroup ? { ...variant, _file: file, image_url: '', image_asset_id: '' } : variant;
  });
}

export function clearVariantPhoto<T extends VariantPhotoFields>(variants: T[], index: number): T[] {
  return variants.map((variant, i) => i === index ? { ...variant, _file: undefined, image_url: '', image_asset_id: '' } : variant);
}

export default function VariantPhotoCell({ variant, label, onPick, onRemove, onError, disabled = false }: {
  variant: VariantPhotoFields; label: string; onPick: (file: File) => void; onRemove: () => void;
  onError: (message: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const [localPreview, setLocalPreview] = useState('');
  useEffect(() => {
    if (!variant._file) return;
    let active = true;
    const url = URL.createObjectURL(variant._file);
    queueMicrotask(() => { if (active) setLocalPreview(url); });
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [variant._file]);
  const preview = variant._file ? localPreview : productImageSource({ image_url: variant.image_url });
  const [brokenPreview, setBrokenPreview] = useState('');
  const showImage = !!preview && brokenPreview !== preview;

  return <div className="relative h-9 w-9">
    <label htmlFor={id} title={preview ? `Change photo for ${label}` : `Add a photo for ${label}`}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-md border transition-colors ${showImage
        ? 'border-slate-600 bg-white' : 'border-dashed border-slate-600 bg-slate-800/60 text-slate-500 hover:border-indigo-400 hover:text-indigo-300'} ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {showImage ? <img key={preview} src={preview} alt={`${label} photo`} referrerPolicy="no-referrer" onError={() => setBrokenPreview(preview)}
        className="h-full w-full object-contain" /> : preview ? <ImageOff className="h-4 w-4" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
      <span className="sr-only">{preview ? `Change photo for ${label}` : `Add a photo for ${label}`}</span>
    </label>
    <input id={id} type="file" className="hidden" disabled={disabled} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
      onChange={event => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file) return;
        const problem = variantPhotoError(file);
        if (problem) { onError(problem); return; }
        onPick(file);
      }} />
    {preview && !disabled && <button type="button" onClick={() => { setLocalPreview(''); onRemove(); }} aria-label={`Remove photo for ${label}`}
      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-slate-300 ring-1 ring-slate-600 hover:bg-rose-500 hover:text-white">
      <X className="h-2.5 w-2.5" aria-hidden="true" />
    </button>}
  </div>;
}
