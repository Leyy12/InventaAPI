"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, ImagePlus, Loader2, X } from 'lucide-react';
import Papa from 'papaparse';
import { auth } from '@/lib/firebase/config';
import { catalogRequest } from '@/lib/catalog-client';
import { uploadProductImage, type MediaUpload } from '@/lib/product-media-client';
import { normalizeProductImageUrl, productImageSource } from '@/lib/product-image-url';
import { createImageMatcher, matchLabels, type ImageMatch, type MatchableProduct } from '@/lib/bulk-image-match';

export type BulkProduct = MatchableProduct & { catalogRevision?: number; image_url?: string; image?: string; image_asset_id?: string };
type RowState = 'ready' | 'working' | 'done' | 'failed' | 'skipped';
type Row = { key: string; label: string; file?: File; url?: string; preview: string; match: ImageMatch;
  productId: string; state: RowState; message: string };

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const nameOf = (p: BulkProduct) => [p.brand || p.attributes?.brand, p.name || p.product || 'Unnamed Product'].filter(Boolean).join(' · ');
export const hasImage = (p: BulkProduct) => !!(productImageSource(p) || p.image_asset_id);

// Phone photos are often larger than the 3 MB upload limit; shrink them in the browser first.
async function prepareFile(file: File): Promise<File> {
  if (TYPES.includes(file.type) && file.size > 0 && file.size <= MAX_BYTES) return file;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Use a JPEG, PNG or WebP photo.'); }
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob || blob.size > MAX_BYTES) throw new Error('Photo is too large even after shrinking.');
  return new File([blob], file.name.replace(/\.[^.]+$/u, '') + '.jpg', { type: 'image/jpeg' });
}

export default function BulkImagesModal({ products, onClose, onSaved }:
  { products: BulkProduct[]; onClose: () => void; onSaved: (product: BulkProduct) => void }) {
  const [mode, setMode] = useState<'files' | 'csv'>('files');
  const [rows, setRows] = useState<Row[]>([]);
  const [skipWithImage, setSkipWithImage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(new Map(products.map(p => [p.id, p])));
  const locked = useRef(false);
  // A retried photo reuses its upload key, so the server returns the same stored image.
  const uploads = useRef(new Map<string, MediaUpload>());
  const previews = useRef<string[]>([]);
  const match = useMemo(() => createImageMatcher(products), [products]);
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const sorted = useMemo(() => [...products].sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [products]);
  const missing = products.filter(p => !hasImage(p)).length;

  useEffect(() => () => previews.current.forEach(url => URL.revokeObjectURL(url)), []);

  const makeRow = (label: string, extra: Partial<Row>): Row => {
    const result = match(label);
    return { key: crypto.randomUUID(), label, preview: '', match: result, state: 'ready', message: '',
      productId: result.productIds.length === 1 ? result.productIds[0] : '', ...extra };
  };
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setError(''); setMode('files');
    const files = [...list].filter(file => file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/iu.test(file.name));
    if (!files.length) { setError('No photos found. Choose JPEG, PNG or WebP files.'); return; }
    setRows(previous => [...previous.filter(row => row.file), ...files.map(file => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return makeRow(file.name, { file, preview });
    })]);
  };
  const loadCsv = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setMode('csv');
    const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: 'greedy',
      transformHeader: header => header.replace(/^﻿/u, '').trim().toLowerCase().replace(/\s+/gu, '_') });
    const fields = parsed.meta.fields || [];
    if (!fields.includes('image_url') || !['id', 'product_id', 'sku', 'name'].some(field => fields.includes(field))) {
      setError('The CSV needs an image_url column plus id, sku or name (brand is optional).'); return;
    }
    const next: Row[] = [];
    for (const record of parsed.data.slice(0, 2000)) {
      const url = (record.image_url || '').trim();
      if (!url) continue;
      const label = record.id || record.product_id || record.sku || [record.brand, record.name].filter(Boolean).join(' ');
      let message = '', state: RowState = 'ready', clean = '';
      try { clean = normalizeProductImageUrl(url); } catch (cause) { message = cause instanceof Error ? cause.message : 'Invalid image URL.'; state = 'failed'; }
      next.push(makeRow((label || '').trim(), { url: clean || url, preview: clean, state, message }));
    }
    if (!next.length) { setError('No rows with an image_url were found.'); return; }
    setRows(next);
  };
  const downloadMissing = () => {
    const csv = Papa.unparse({ fields: ['id', 'sku', 'brand', 'name', 'image_url'],
      data: products.filter(p => !hasImage(p)).map(p => [p.id, p.sku || p.variants?.find(v => v.sku)?.sku || '',
        p.brand || p.attributes?.brand || '', p.name || p.product || '', '']) }, { escapeFormulae: true });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'products_missing_images.csv' }).click();
    URL.revokeObjectURL(url);
  };
  const update = (key: string, patch: Partial<Row>) => setRows(previous => previous.map(row => row.key === key ? { ...row, ...patch } : row));

  const pending = rows.filter(row => ['ready', 'failed'].includes(row.state) && row.productId && (row.file || row.url));
  const run = async () => {
    if (locked.current) return;
    const user = auth.currentUser;
    if (!user) { setError('Sign in as Admin to update images.'); return; }
    locked.current = true; setBusy(true); setError('');
    const claimed = new Set<string>();
    // One product at a time: each photo is uploaded and attached before the next starts.
    for (const row of pending) {
      const product = latest.current.get(row.productId);
      if (!product) { update(row.key, { state: 'failed', message: 'Product no longer exists.' }); continue; }
      if (claimed.has(product.id)) { update(row.key, { state: 'skipped', message: 'Another photo in this batch already went to this product.' }); continue; }
      if (skipWithImage && hasImage(product)) { update(row.key, { state: 'skipped', message: 'Product already has a photo.' }); continue; }
      claimed.add(product.id);
      update(row.key, { state: 'working', message: '' });
      try {
        let image: { image_url: string; image_asset_id: string };
        if (row.file) {
          const upload = uploads.current.get(row.key) ?? { uid: user.uid, key: crypto.randomUUID(), file: await prepareFile(row.file) };
          uploads.current.set(row.key, upload);
          image = { image_url: '', image_asset_id: await uploadProductImage(user, 'catalog', upload) };
        } else image = { image_url: normalizeProductImageUrl(row.url), image_asset_id: '' };
        const result = await catalogRequest<{ product: BulkProduct }>('/' + encodeURIComponent(product.id), 'PATCH',
          { product: image, expectedRevision: product.catalogRevision ?? 0 });
        latest.current.set(product.id, result.product);
        onSaved(result.product);
        update(row.key, { state: 'done', message: 'Saved' });
      } catch (cause) {
        update(row.key, { state: 'failed', message: cause instanceof Error ? cause.message : 'Failed. Retry to continue.' });
      }
    }
    locked.current = false; setBusy(false);
  };

  const counts = { done: rows.filter(r => r.state === 'done').length, failed: rows.filter(r => r.state === 'failed').length,
    skipped: rows.filter(r => r.state === 'skipped').length, unmatched: rows.filter(r => !r.productId && r.state === 'ready').length };
  const tone: Record<RowState, string> = { ready: 'text-slate-400', working: 'text-indigo-300', done: 'text-emerald-300', failed: 'text-rose-300', skipped: 'text-amber-300' };

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
    <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-200 shadow-2xl">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800">
        <div><h2 className="font-semibold">Bulk Images</h2>
          <p className="text-xs text-slate-400">{missing} of {products.length} products have no photo. Add many at once and they are matched to products for you.</p></div>
        <button onClick={onClose} disabled={busy} aria-label="Close bulk images"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6 space-y-4 overflow-y-auto">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-dashed border-slate-600 p-4 text-sm space-y-2">
            <p className="font-medium"><ImagePlus className="inline w-4 h-4 mr-2" />Photo files</p>
            <p className="text-xs text-slate-400">Name each file after the product&apos;s SKU or name, like <code>555 Sardines.jpg</code> or <code>4800249001234.png</code>. Large photos are shrunk automatically.</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <label className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold">Choose photos
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} className="hidden"
                  onChange={event => { addFiles(event.target.files); event.target.value = ''; }} /></label>
              <label className="cursor-pointer rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5"><FolderOpen className="inline w-3.5 h-3.5 mr-1" />Choose a folder
                <input type="file" multiple disabled={busy} className="hidden" {...({ webkitdirectory: '' } as Record<string, string>)}
                  onChange={event => { addFiles(event.target.files); event.target.value = ''; }} /></label>
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-slate-600 p-4 text-sm space-y-2">
            <p className="font-medium">CSV of image links</p>
            <p className="text-xs text-slate-400">Download the products missing photos, paste an HTTPS image link into the image_url column, then upload the CSV back.</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={downloadMissing} disabled={!missing} className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 disabled:opacity-40"><Download className="inline w-3.5 h-3.5 mr-1" />Products missing photos</button>
              <label className="cursor-pointer rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold">Upload CSV
                <input type="file" accept=".csv" disabled={busy} className="hidden"
                  onChange={event => { void loadCsv(event.target.files?.[0]); event.target.value = ''; }} /></label>
            </div>
          </div>
        </div>
        <label className="block text-xs text-slate-300"><input type="checkbox" checked={skipWithImage} disabled={busy}
          onChange={event => setSkipWithImage(event.target.checked)} /> Skip products that already have a photo</label>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {rows.length > 0 && <>
          <p className="text-xs text-slate-400">{rows.length} {mode === 'files' ? 'photos' : 'links'} · {pending.length} ready · {counts.unmatched} need a product picked · {counts.done} saved · {counts.skipped} skipped · {counts.failed} failed</p>
          <div className="overflow-auto max-h-[45vh] border border-slate-700 rounded-lg"><table className="w-full text-xs">
            <thead className="bg-slate-800 sticky top-0"><tr>{['Photo', 'From', 'Product', 'Status'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => {
              const target = row.productId ? byId.get(row.productId) : undefined;
              const options = row.match.productIds.length > 1 ? row.match.productIds.map(id => byId.get(id)!).filter(Boolean) : sorted;
              return <tr key={row.key} className="border-t border-slate-800 align-middle">
                <td className="p-2">{/* eslint-disable-next-line @next/next/no-img-element */}
                  {row.preview ? <img src={row.preview} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded-lg bg-slate-800 object-contain" /> : <div className="h-12 w-12 rounded-lg bg-slate-800" />}</td>
                <td className="p-2 max-w-48"><span className="block truncate" title={row.label}>{row.label || '(blank)'}</span>
                  <span className="text-slate-500">{matchLabels[row.match.by]}{row.match.productIds.length > 1 ? ` · ${row.match.productIds.length} possible` : ''}</span></td>
                <td className="p-2"><select value={row.productId} disabled={busy || row.state === 'done'} onChange={event => update(row.key, { productId: event.target.value, state: 'ready', message: '' })}
                  className="w-full max-w-72 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5">
                  <option value="">{row.match.productIds.length > 1 ? 'Pick the right product…' : 'Not matched: pick a product…'}</option>
                  {options.map(p => <option key={p.id} value={p.id}>{nameOf(p)}{hasImage(p) ? ' (has photo)' : ''}</option>)}
                </select>{target && hasImage(target) && row.state === 'ready' && <span className="block text-amber-300">{skipWithImage ? 'Has a photo; will be skipped' : 'Will replace the current photo'}</span>}</td>
                <td className={'p-2 ' + tone[row.state]}>{row.state === 'working' ? <Loader2 className="inline w-4 h-4 animate-spin" /> : row.state === 'ready' ? (row.productId ? 'Ready' : '') : row.message || row.state}
                  {row.state === 'ready' || row.state === 'failed' ? <button disabled={busy} className="ml-2 text-slate-500" onClick={() => setRows(previous => previous.filter(r => r.key !== row.key))}>Remove</button> : null}</td>
              </tr>;
            })}</tbody>
          </table></div>
        </>}
      </div>
      <div className="px-6 py-4 border-t border-slate-800 flex justify-between items-center text-xs">
        <span className="text-slate-400">Photos are saved one product at a time. You can close this window after it finishes.</span>
        <button onClick={() => void run()} disabled={busy || !pending.length} className="rounded-lg px-4 py-2 bg-indigo-600 font-semibold disabled:opacity-40">
          {busy ? <><Loader2 className="inline w-4 h-4 animate-spin" /> Saving…</> : `Save ${pending.length} image${pending.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  </div>;
}
