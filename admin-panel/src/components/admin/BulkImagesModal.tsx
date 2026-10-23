"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FolderOpen, ImagePlus, Loader2, Square, X } from 'lucide-react';
import Papa from 'papaparse';
import { auth } from '@/lib/firebase/config';
import { catalogRequest } from '@/lib/catalog-client';
import { uploadProductImage, type MediaUpload } from '@/lib/product-media-client';
import { normalizeProductImageUrl, productImageSource } from '@/lib/product-image-url';
import { createImageMatcher, matchLabels, type ImageMatch, type MatchableProduct } from '@/lib/bulk-image-match';
import { IMAGE_BATCH_SIZE, planImageLinks, sendImageBatches, type BatchProgress, type LinkPlan, type LinkResult } from '@/lib/bulk-image-links';

export type BulkProduct = MatchableProduct & { catalogRevision?: number; image_url?: string; image?: string; image_asset_id?: string };
type RowState = 'ready' | 'working' | 'done' | 'failed' | 'skipped';
type Row = { key: string; label: string; file?: File; preview: string; match: ImageMatch;
  productId: string; state: RowState; message: string };

const MAX_BYTES = 3 * 1024 * 1024;
// Rows drawn at once. Only this page is rendered, so large batches stay responsive.
const PAGE_SIZE = 50;
const OTHER = '__other__';
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

type LinkReportRow = { row: number; label: string; image_url: string; status: string; reason: string };

export default function BulkImagesModal({ products, onClose, onSaved, onSavedMany }:
  { products: BulkProduct[]; onClose: () => void; onSaved: (product: BulkProduct) => void;
    onSavedMany?: (products: BulkProduct[]) => void }) {
  const [mode, setMode] = useState<'files' | 'csv'>('files');
  const [rows, setRows] = useState<Row[]>([]);
  const [skipWithImage, setSkipWithImage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Rows whose product list shows the whole catalog. Others list only their matches,
  // so a large CSV does not render thousands of full catalog lists at once.
  const [browsing, setBrowsing] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  // CSV of image links: planned once, then sent in batches without per-row review.
  const [plan, setPlan] = useState<LinkPlan | null>(null);
  const [csvName, setCsvName] = useState('');
  const [sent, setSent] = useState<BatchProgress<BulkProduct>['results']>([]);
  const [waiting, setWaiting] = useState('');
  const stopRequested = useRef(false);
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
    setError(''); setNotice(''); setMode('files');
    const files = [...list].filter(file => file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/iu.test(file.name));
    if (!files.length) { setError('No photos found. Choose JPEG, PNG or WebP files.'); return; }
    setPage(0);
    setRows(previous => [...previous, ...files.map(file => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return makeRow(file.name, { file, preview });
    })]);
  };
  const loadCsv = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setNotice(''); setMode('csv'); setPlan(null); setSent([]); setWaiting('');
    const parsed = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: 'greedy',
      transformHeader: header => header.replace(/^\uFEFF/u, '').trim().toLowerCase().replace(/\s+/gu, '_') });
    const fields = parsed.meta.fields || [];
    if (!fields.includes('image_url') || !['id', 'product_id', 'sku', 'name'].some(field => fields.includes(field))) {
      setError('The CSV needs an image_url column plus id, sku or name (brand is optional).'); return;
    }
    const next = planImageLinks(parsed.data, match, id => { const p = latest.current.get(id); return !!p && hasImage(p); }, normalizeProductImageUrl);
    if (!next.queue.length && !next.skipped.length && !next.attention.length) { setError('No rows with an image_url were found.'); return; }
    setCsvName(file.name); setPlan(next);
  };
  const remaining = plan ? plan.queue.slice(sent.length) : [];
  const runLinks = async () => {
    if (locked.current || !plan) return;
    if (!auth.currentUser) { setError('Sign in as Admin to update images.'); return; }
    locked.current = true; stopRequested.current = false; setBusy(true); setError('');
    const before = sent;
    let applied = 0;
    try {
      await sendImageBatches<BulkProduct>({
        queue: plan.queue.slice(before.length),
        send: items => catalogRequest<{ results: LinkResult<BulkProduct>[] }>('/images', 'POST', { items }),
        stopped: () => stopRequested.current,
        onProgress: progress => {
          setWaiting(progress.waiting || '');
          if (progress.waiting) return;
          setSent([...before, ...progress.results]);
          // Hand newly saved products to the page once per batch, not once per product.
          const fresh = progress.saved.slice(applied);
          applied = progress.saved.length;
          for (const product of fresh) latest.current.set(product.id, product);
          if (fresh.length) { if (onSavedMany) onSavedMany(fresh); else fresh.forEach(onSaved); }
        },
      });
    } finally {
      locked.current = false; setBusy(false); setWaiting('');
    }
  };
  const report: LinkReportRow[] = plan ? [
    ...plan.attention.map(item => ({ ...item, status: 'Needs attention' })),
    ...plan.skipped.map(item => ({ ...item, status: 'Skipped' })),
    ...sent.filter(item => item.status !== 'SAVED').map(item => ({ row: item.row, label: item.label, image_url: item.image_url,
      status: item.status === 'FAILED' ? 'Failed' : 'Skipped', reason: item.reason || '' })),
  ].sort((a, b) => a.row - b.row) : [];
  const downloadReport = () => {
    // Uploadable as-is: type the right product id into the empty id column and upload this file again.
    const csv = Papa.unparse({ fields: ['row', 'id', 'name', 'image_url', 'status', 'reason'],
      data: report.map(item => [item.row, '', item.label, item.image_url, item.status, item.reason]) }, { escapeFormulae: true });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: (csvName.replace(/\.csv$/iu, '') || 'images') + '_not_saved.csv' }).click();
    URL.revokeObjectURL(url);
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

  const pending = rows.filter(row => ['ready', 'failed'].includes(row.state) && row.productId && row.file);
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
        const upload = uploads.current.get(row.key) ?? { uid: user.uid, key: crypto.randomUUID(), file: await prepareFile(row.file!) };
        uploads.current.set(row.key, upload);
        const image = { image_url: '', image_asset_id: await uploadProductImage(user, 'catalog', upload) };
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
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = Math.min(page, pages - 1);
  const visible = rows.slice(shown * PAGE_SIZE, (shown + 1) * PAGE_SIZE);
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
        {mode === 'files' && <label className="block text-xs text-slate-300"><input type="checkbox" checked={skipWithImage} disabled={busy}
          onChange={event => setSkipWithImage(event.target.checked)} /> Skip products that already have a photo</label>}
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-amber-300">{notice}</p>}
        {mode === 'csv' && plan && (() => {
          const saved = sent.filter(item => item.status === 'SAVED').length;
          const done = plan.queue.length > 0 && sent.length >= plan.queue.length;
          const percent = plan.queue.length ? Math.round(sent.length / plan.queue.length * 100) : 100;
          return <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-400">{csvName}: products that already have a photo, repeated rows, and rows that match no product or several products are skipped automatically. Existing photos are never replaced.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[['Ready to save', plan.queue.length], ['Saved', saved], ['Skipped', plan.skipped.length + sent.filter(item => item.status === 'SKIPPED').length],
                ['Need attention', plan.attention.length + sent.filter(item => item.status === 'FAILED').length]].map(([label, value]) =>
                <div key={label} className="rounded-lg bg-slate-800 p-3 text-xs"><strong className="block text-lg">{(value as number).toLocaleString()}</strong>{label}</div>)}
            </div>
            {plan.queue.length > 0 && <div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: percent + '%' }} /></div>
              <p role="status" className="mt-1 text-xs text-slate-400">{waiting || (done ? 'Finished.' : busy ? `Saving… ${sent.length.toLocaleString()} of ${plan.queue.length.toLocaleString()} processed` : sent.length ? `Stopped at ${sent.length.toLocaleString()} of ${plan.queue.length.toLocaleString()}. Press Save to continue.` : 'Ready.')}</p>
            </div>}
            {report.length > 0 && <p className="text-xs text-slate-400">To fix rows that match several products, type the right product id into the id column of the downloaded file and upload it again. Rows already saved or skipped are skipped again.</p>}
            {report.length > 0 && <button onClick={downloadReport} className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs">
              <Download className="inline w-3.5 h-3.5 mr-1" />Download {report.length.toLocaleString()} rows that were not saved (with reasons)</button>}
          </div>;
        })()}
        {mode === 'files' && rows.length > 0 && <>
          <p className="text-xs text-slate-400">{rows.length} {mode === 'files' ? 'photos' : 'links'} · {pending.length} ready · {counts.unmatched} need a product picked · {counts.done} saved · {counts.skipped} skipped · {counts.failed} failed</p>
          <div className="overflow-auto max-h-[45vh] border border-slate-700 rounded-lg"><table className="w-full text-xs">
            <thead className="bg-slate-800 sticky top-0"><tr>{['Photo', 'From', 'Product', 'Status'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
            <tbody>{visible.map(row => {
              const target = row.productId ? byId.get(row.productId) : undefined;
              const matched = row.match.productIds.map(id => byId.get(id)).filter((p): p is BulkProduct => !!p);
              // The whole catalog list is built only after the admin asks for it on this row.
              const full = browsing.has(row.key);
              const options = full ? sorted : matched;
              return <tr key={row.key} className="border-t border-slate-800 align-middle">
                <td className="p-2">{/* eslint-disable-next-line @next/next/no-img-element */}
                  {row.preview ? <img src={row.preview} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 rounded-lg bg-slate-800 object-contain" /> : <div className="h-12 w-12 rounded-lg bg-slate-800" />}</td>
                <td className="p-2 max-w-48"><span className="block truncate" title={row.label}>{row.label || '(blank)'}</span>
                  <span className="text-slate-500">{matchLabels[row.match.by]}{row.match.productIds.length > 1 ? ` · ${row.match.productIds.length} possible` : ''}</span></td>
                <td className="p-2"><select value={row.productId} disabled={busy || row.state === 'done'} onChange={event => {
                    if (event.target.value === OTHER) { setBrowsing(previous => new Set(previous).add(row.key)); return; }
                    update(row.key, { productId: event.target.value, state: 'ready', message: '' });
                  }}
                  className="w-full max-w-72 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5">
                  <option value="">{row.match.productIds.length > 1 ? 'Pick the right product…' : 'Not matched: pick a product…'}</option>
                  {options.map(p => <option key={p.id} value={p.id}>{nameOf(p)}{hasImage(p) ? ' (has photo)' : ''}</option>)}
                  {!full && <option value={OTHER}>{matched.length ? 'Other product…' : 'Choose from all products…'}</option>}
                </select>{target && hasImage(target) && row.state === 'ready' && <span className="block text-amber-300">{skipWithImage ? 'Has a photo; will be skipped' : 'Will replace the current photo'}</span>}</td>
                <td className={'p-2 ' + tone[row.state]}>{row.state === 'working' ? <Loader2 className="inline w-4 h-4 animate-spin" /> : row.state === 'ready' ? (row.productId ? 'Ready' : '') : row.message || row.state}
                  {row.state === 'ready' || row.state === 'failed' ? <button disabled={busy} className="ml-2 text-slate-500" onClick={() => setRows(previous => previous.filter(r => r.key !== row.key))}>Remove</button> : null}</td>
              </tr>;
            })}</tbody>
          </table></div>
          {pages > 1 && <div className="flex items-center justify-end gap-2 text-xs">
            <button onClick={() => setPage(shown - 1)} disabled={shown === 0} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 disabled:opacity-40">Previous</button>
            <span className="text-slate-400">Page {shown + 1} of {pages} · rows {shown * PAGE_SIZE + 1}–{Math.min((shown + 1) * PAGE_SIZE, rows.length)}</span>
            <button onClick={() => setPage(shown + 1)} disabled={shown >= pages - 1} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 disabled:opacity-40">Next</button>
          </div>}
        </>}
      </div>
      <div className="px-6 py-4 border-t border-slate-800 flex justify-between items-center text-xs">
        <span className="text-slate-400">{mode === 'csv' ? `Links are saved ${IMAGE_BATCH_SIZE} products per request. Keep this window open until it finishes.` : 'Photos are saved one product at a time. You can close this window after it finishes.'}</span>
        {mode === 'csv' ? <div className="flex gap-2">
          {busy && <button onClick={() => { stopRequested.current = true; }} className="rounded-lg px-4 py-2 border border-slate-700 bg-slate-800"><Square className="inline w-3.5 h-3.5 mr-1" />Stop after this batch</button>}
          <button onClick={() => void runLinks()} disabled={busy || !remaining.length} className="rounded-lg px-4 py-2 bg-indigo-600 font-semibold disabled:opacity-40">
            {busy ? <><Loader2 className="inline w-4 h-4 animate-spin" /> Saving…</> : `Save ${remaining.length.toLocaleString()} image${remaining.length === 1 ? '' : 's'}`}
          </button>
        </div> : <button onClick={() => void run()} disabled={busy || !pending.length} className="rounded-lg px-4 py-2 bg-indigo-600 font-semibold disabled:opacity-40">
          {busy ? <><Loader2 className="inline w-4 h-4 animate-spin" /> Saving…</> : `Save ${pending.length} image${pending.length === 1 ? '' : 's'}`}
        </button>}
      </div>
    </div>
  </div>;
}
