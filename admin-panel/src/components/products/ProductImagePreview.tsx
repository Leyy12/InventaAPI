"use client";

import { productImageSource, showProductImageFallback } from '@/lib/product-image-url';

export default function ProductImagePreview({ url, name }: { url?: string; name: string }) {
  const source = productImageSource({ image_url: url });
  return <div key={source} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
    {/* Browser-only external URLs; no server optimizer fetch. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {source && <img src={source} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      className="h-full w-full object-contain p-3" onError={showProductImageFallback} />}
    <div className={'absolute inset-0 flex items-center justify-center text-xs text-slate-400 ' + (source ? 'hidden' : '')}>No image</div>
  </div>;
}
