"use client";

import { useRef, useState } from 'react';
import { Upload, Download, X, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { catalogRequest } from '@/lib/catalog-client';
import { extractTemplateRows, fitsTemplate } from '@/lib/csv-extract';
import ProductImagePreview from '@/components/products/ProductImagePreview';

type Status = 'NEW' | 'UPDATE' | 'EXACT_EXISTING_MATCH' | 'POSSIBLE_DUPLICATE' | 'INVALID' | 'CONFLICT';
type Row = { row: number; status: Status; reason: string; matches: string[]; possibleDuplicates: string[]; display?: { name: string; brand: string };
  product: { name: string; brand: string; segment: string; category: string; sku: string; image_url?: string;
    variants: { size?: string; flavor?: string; price?: number }[] } | null };
type Preview = { previewId: string; total: number; counts: Record<Status, number>; warnings: string[]; rows: Row[] };
type Result = { row: number; status: 'IMPORTED' | 'UPDATED' | 'FAILED' | 'SKIPPED'; reason?: string; productId?: string; replayed?: boolean };
// Rows per commit request; large files are sent as several requests.
const COMMIT_BATCH = 25;
// Rows of these statuses can be selected and written.
const WRITABLE: Status[] = ['NEW', 'UPDATE', 'POSSIBLE_DUPLICATE'];
const labels: Record<Status, string> = { NEW: 'New', UPDATE: 'Update', EXACT_EXISTING_MATCH: 'No changes / skipped',
  POSSIBLE_DUPLICATE: 'Possible duplicate', INVALID: 'Invalid', CONFLICT: 'Conflict' };

export default function ImportCsvModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [progress, setProgress] = useState('');
  const [segment, setSegment] = useState('Grocery');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const handleFile = async (file: File) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice(''); setPreview(null); setResults([]); setSelected([]); setAcknowledge(false);
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file.');
      setFileName(file.name);
      // Header:false retains duplicate columns for the authoritative alias checks.
      const parsed = Papa.parse<string[]>(await file.text(), { header: false, skipEmptyLines: 'greedy' });
      if (parsed.errors.length) throw new Error(parsed.errors.map(e => 'CSV row ' + ((e.row ?? 0) + 1) + ': ' + e.message).join('; '));
      let rows = parsed.data;
      // Files in another layout (e.g. an Open Food Facts export) are reduced to
      // the template columns here, so only the needed details are uploaded.
      if (!fitsTemplate(rows[0] ?? [])) {
        const extracted = extractTemplateRows(rows, { segment, category: 'Uncategorized' });
        if (!extracted.used.name) throw new Error('Could not find a product name column in this file.');
        rows = extracted.rows;
        setNotice(`Not in the template layout, so only the needed details were taken: ${Object.entries(extracted.used).map(([field, source]) => `${field} ← ${source}`).join(', ')}. `
          + `${rows.length - 1} products kept, ${extracted.dropped} without a name left out. Missing segment uses ${segment}; missing category uses "Uncategorized".`
          + (extracted.missingPrice ? ` ${extracted.missingPrice} rows have no price; they import without one and you can add it later.` : ''));
      }
      // Vercel rejects request bodies over 4.5 MB before the API sees them.
      if (new Blob([JSON.stringify({ rows })]).size > 4 * 1024 * 1024) {
        throw new Error('This file is too large to preview in one go (over about 4 MB of product details). Split it into smaller files.');
      }
      const next = await catalogRequest<Preview>('/import/preview', 'POST', { rows });
      setPreview(next); setSelected(next.rows.filter(row => row.status === 'NEW' || row.status === 'UPDATE').map(row => row.row));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to preview CSV.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const commit = async () => {
    if (locked.current || !preview || !selected.length) return;
    locked.current = true; setBusy(true); setError(''); setResults([]);
    const done: Result[] = [];
    const rows = [...selected].sort((a, b) => a - b);
    try {
      for (let i = 0; i < rows.length; i += COMMIT_BATCH) {
        setProgress(`Importing ${Math.min(i + COMMIT_BATCH, rows.length)} of ${rows.length} rows…`);
        const result = await catalogRequest<{ results: Result[] }>('/import/commit', 'POST', {
          previewId: preview.previewId, rows: rows.slice(i, i + COMMIT_BATCH), acknowledgePossible: acknowledge,
        });
        done.push(...result.results); setResults([...done]);
      }
    } catch (cause) { setError((cause instanceof Error ? cause.message : 'Import response unavailable.') + ' Retry this same preview to recover row results.'); }
    finally {
      if (done.some(row => row.status === 'IMPORTED' || row.status === 'UPDATED')) onImported();
      locked.current = false; setBusy(false); setProgress('');
    }
  };
  const downloadTemplate = () => {
    const csv = 'name,brand,segment,category,size,price,sku,expiration_date,description,image_url\n"Sample Item","Sample Brand","Grocery","Food","330ml","0","SAMPLE-330","","Example only",""';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'import_template.csv' }).click();
    URL.revokeObjectURL(url);
  };
  const hasSelectedPossible = preview?.rows.some(row => selected.includes(row.row) && row.status === 'POSSIBLE_DUPLICATE');
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
    <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-200 shadow-2xl">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800">
        <div><h2 className="font-semibold">Import CSV</h2><p className="text-xs text-slate-400">Preview first. New products are added; existing products are updated only where the CSV has different values.</p></div>
        <div className="flex gap-3"><button onClick={downloadTemplate} className="text-xs text-indigo-300"><Download className="inline w-4 h-4" /> Template</button>
          <button onClick={onClose} disabled={busy} aria-label="Close importer"><X className="w-5 h-5" /></button></div>
      </div>
      <div className="p-6 space-y-4 overflow-y-auto">
        <label className="block rounded-xl border border-dashed border-slate-600 p-5 text-sm">
          <Upload className="inline w-4 h-4 mr-2" /> {fileName || 'Choose CSV'}
          <input type="file" accept=".csv" disabled={busy} className="block mt-3 text-xs"
            onChange={event => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ''; }} />
        </label>
        <label className="block text-xs text-slate-400">Segment for rows that have none:{' '}
          <select value={segment} disabled={busy} onChange={event => setSegment(event.target.value)} className="ml-1 rounded bg-slate-800 px-2 py-1 text-slate-200">
            {['Grocery', 'Pharmacy', 'Hardware'].map(option => <option key={option}>{option}</option>)}
          </select></label>
        <p className="text-xs text-slate-400">Any CSV layout works: the needed details (name, brand, category, size, price, barcode/SKU…) are picked out. Price is optional. No row limit. Optional image_url accepts HTTPS URLs, not image files. Column order does not matter.</p>
        {notice && <p role="status" className="text-xs text-sky-300">{notice}</p>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {preview && <>
          <p className="text-sm">Total rows: {preview.total}</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{(Object.keys(labels) as Status[]).map(status =>
            <div key={status} className="rounded-lg bg-slate-800 p-3 text-xs"><strong className="block text-lg">{preview.counts[status]}</strong>{labels[status]}</div>)}</div>
          {preview.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-300">{warning}</p>)}
          <div className="overflow-auto max-h-80 border border-slate-700 rounded-lg"><table className="w-full text-xs">
            <thead className="bg-slate-800 sticky top-0"><tr>{['Select', 'Row', 'Product / brand', 'Segment / category', 'Variant / price', 'Image', 'Classification / reason'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
            <tbody>{preview.rows.map(row => <tr key={row.row} className="border-t border-slate-800">
              <td className="p-2"><input type="checkbox" aria-label={'Select row ' + row.row} checked={selected.includes(row.row)}
                disabled={busy || !WRITABLE.includes(row.status)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.row] : previous.filter(value => value !== row.row))} /></td>
              <td className="p-2">{row.row}</td><td className="p-2">{row.product?.name || row.display?.name || 'Invalid row'}<br />{row.product?.brand ?? row.display?.brand}</td>
              <td className="p-2">{row.product?.segment}<br />{row.product?.category}</td>
              <td className="p-2">{row.product?.variants[0]?.size} {row.product?.variants[0]?.flavor}<br />{row.product?.variants[0]?.price ?? 'No price'}</td>
              <td className="p-2">{row.product?.image_url ? <><ProductImagePreview url={row.product.image_url} name={row.product.name} /><span className="block max-w-40 truncate" title={row.product.image_url}>HTTPS image URL</span></> : 'None'}</td>
              <td className="p-2">{labels[row.status]}<br />{row.reason}{[...row.matches, ...row.possibleDuplicates].length > 0 && <p>Catalog IDs: {[...row.matches, ...row.possibleDuplicates].join(', ')}</p>}</td>
            </tr>)}</tbody>
          </table></div>
          <label className="block text-xs text-amber-200"><input type="checkbox" checked={acknowledge} disabled={busy} onChange={event => setAcknowledge(event.target.checked)} /> I reviewed selected possible duplicates and intend to create separate variants/products.</label>
          <p className="text-xs text-slate-400">Rows commit independently. A failure does not undo successful rows. Retrying this preview recovers successful results without creating copies.</p>
        </>}
        {results.length > 0 && <div role="status" className="rounded-lg bg-slate-800 p-3 text-xs">
          <p>{results.filter(row => row.status === 'IMPORTED').length} imported/recovered; {results.filter(row => row.status === 'UPDATED').length} updated; {results.filter(row => row.status === 'FAILED').length} failed; {results.filter(row => row.status === 'SKIPPED').length} skipped.</p>
          {results.map(row => <p key={row.row}>Row {row.row}: {row.status} {row.replayed ? '(previously committed)' : ''} {row.reason} {row.productId}</p>)}
        </div>}
      </div>
      <div className="px-6 py-4 border-t border-slate-800 flex justify-between text-xs">
        <span>{selected.length} selected</span>
        <button onClick={() => void commit()} disabled={busy || !selected.length || (!!hasSelectedPossible && !acknowledge)} className="rounded-lg px-4 py-2 bg-indigo-600 disabled:opacity-40">
          {busy ? <><Loader2 className="inline w-4 h-4 animate-spin" /> {progress || 'Working…'}</> : 'Confirm selected import / retry'}
        </button>
      </div>
    </div>
  </div>;
}
