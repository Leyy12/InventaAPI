"use client";

import { useEffect, useId, useState } from 'react';
import { productImageSource, showProductImageFallback } from '@/lib/product-image-url';

export default function ProductImageField({ imageUrl, onImageUrlChange, file, onFileChange, disabled = false }:
  { imageUrl: string; onImageUrlChange: (url: string) => void; file: File | null; onFileChange: (file: File | null) => void; disabled?: boolean }) {
  const id = useId();
  const [localPreview, setLocalPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) return;
    let active = true;
    const url = URL.createObjectURL(file);
    queueMicrotask(() => { if (active) setLocalPreview(url); });
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [file]);
  const preview = file ? localPreview : productImageSource({ image_url: imageUrl });
  return <section className="min-w-0 max-w-full space-y-3 rounded-xl border border-slate-700 bg-slate-800/30 p-4">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Product Image <span className="normal-case font-normal text-slate-500">(optional)</span></h3>
    <div className="flex flex-wrap items-start gap-4">
      <div key={preview} className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
        {/* External images render only in the browser; local object URLs are revoked on replacement/unmount. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img src={preview} alt="Product image preview" referrerPolicy="no-referrer" className="h-full w-full object-contain p-3" onError={showProductImageFallback} />}
        <div className={'absolute inset-0 flex items-center justify-center text-xs text-slate-500 ' + (preview ? 'hidden' : '')}>No image</div>
      </div>
      <div className="min-w-0 flex-1 basis-48 space-y-2">
        <label htmlFor={id + '-file'} className="block text-sm font-medium text-slate-200">Upload Image</label>
        <input id={id + '-file'} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={disabled}
          className="block min-w-0 w-full max-w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-3 file:py-2 file:text-indigo-200"
          onChange={event => {
            const next = event.target.files?.[0]; event.target.value = ''; setError('');
            if (!next) return;
            const extension = next.name.split('.').pop()?.toLowerCase();
            if (!(['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) || !extension
              || !({ 'image/jpeg': ['jpg','jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] }[next.type] || []).includes(extension)) {
              setError('Choose a JPEG, PNG or WebP photo with a matching file extension.'); return;
            }
            if (next.size > 3 * 1024 * 1024 || !next.size) { setError('Choose a non-empty image no larger than 3 MB.'); return; }
            onImageUrlChange(''); onFileChange(next);
          }} />
        <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 3 MB. Photos are checked and optimized before use.</p>
        {file && <p className="break-all text-xs text-indigo-300">Selected: {file.name}. Submit to upload this photo.</p>}
        {(file || imageUrl) && <button type="button" disabled={disabled} className="text-xs font-medium text-rose-300 disabled:opacity-50"
          onClick={() => { setLocalPreview(''); onFileChange(null); onImageUrlChange(''); setError(''); }}>Remove Image</button>}
      </div>
    </div>
    <div>
      <label htmlFor={id + '-url'} className="mb-1 block text-xs text-slate-400">Or use an HTTPS image URL</label>
      <input id={id + '-url'} type="url" maxLength={2048} value={imageUrl} disabled={disabled || !!file}
        onChange={event => onImageUrlChange(event.target.value)} placeholder="https://example.com/product.jpg"
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 disabled:opacity-40" />
      {file && <p className="mt-1 text-xs text-slate-500">Remove the selected file to use a URL instead.</p>}
    </div>
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
  </section>;
}
