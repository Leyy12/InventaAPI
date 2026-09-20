"use client";

import { useRef, useState } from 'react';
import { Upload, Download, X, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { catalogRequest } from '@/lib/catalog-client';

type Status = 'NEW' | 'EXACT_EXISTING_MATCH' | 'POSSIBLE_DUPLICATE' | 'INVALID' | 'CONFLICT';
type Row = { row: number; status: Status; reason: string; matches: string[]; possibleDuplicates: string[];
  product: { name: string; brand: string; segment: string; category: string; sku: string;
    variants: { size?: string; flavor?: string; price: number }[] } | null };
type Preview = { previewId: string; total: number; counts: Record<Status, number>; warnings: string[]; rows: Row[] };
type Result = { row: number; status: 'IMPORTED' | 'FAILED' | 'SKIPPED'; reason?: string; productId?: string; replayed?: boolean };
const labels: Record<Status, string> = { NEW: 'New', EXACT_EXISTING_MATCH: 'Exact existing / skipped',
  POSSIBLE_DUPLICATE: 'Possible duplicate', INVALID: 'Invalid', CONFLICT: 'Conflict' };

export default function ImportCsvModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const locked = useRef(false);
  const handleFile = async (file: File) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setPreview(null); setResults([]); setSelected([]); setAcknowledge(false);
    try {
      if (!file.name.toLowerCase().endsWith('.csv') || file.size > 256 * 1024) throw new Error('Choose a CSV file no larger than 256 KB.');
      setFileName(file.name);
      // Header:false retains duplicate columns for the authoritative alias checks.
      const parsed = Papa.parse<string[]>(await file.text(), { header: false, skipEmptyLines: 'greedy' });
      if (parsed.errors.length) throw new Error(parsed.errors.map(e => 'CSV row ' + ((e.row ?? 0) + 1) + ': ' + e.message).join('; '));
      const next = await catalogRequest<Preview>('/import/preview', 'POST', { rows: parsed.data });
      setPreview(next); setSelected(next.rows.filter(row => row.status === 'NEW').map(row => row.row));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to preview CSV.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const commit = async () => {
    if (locked.current || !preview || !selected.length) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await catalogRequest<{ results: Result[] }>('/import/commit', 'POST', {
        previewId: preview.previewId, rows: selected, acknowledgePossible: acknowledge,
      });
      setResults(result.results);
      if (result.results.some(row => row.status === 'IMPORTED')) onImported();
    } catch (cause) { setError((cause instanceof Error ? cause.message : 'Import response unavailable.') + ' Retry this same preview to recover row results.'); }
    finally { locked.current = false; setBusy(false); }
  };
  const downloadTemplate = () => {
    const csv = 'name,brand,segment,category,size,price,sku,expiration_date,description\n"Sample Item","Sample Brand","Grocery","Food","330ml","0","SAMPLE-330","","Example only"';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'import_template.csv' }).click();
    URL.revokeObjectURL(url);
  };
  const hasSelectedPossible = preview?.rows.some(row => selected.includes(row.row) && row.status === 'POSSIBLE_DUPLICATE');
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
    <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900 text-slate-200 shadow-2xl">
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-800">
        <div><h2 className="font-semibold">Import CSV</h2><p className="text-xs text-slate-400">Preview first. Existing products are skipped, never overwritten or merged.</p></div>
        <div className="flex gap-3"><button onClick={downloadTemplate} className="text-xs text-indigo-300"><Download className="inline w-4 h-4" /> Template</button>
          <button onClick={onClose} disabled={busy} aria-label="Close importer"><X className="w-5 h-5" /></button></div>
      </div>
      <div className="p-6 space-y-4 overflow-y-auto">
        <label className="block rounded-xl border border-dashed border-slate-600 p-5 text-sm">
          <Upload className="inline w-4 h-4 mr-2" /> {fileName || 'Choose CSV'}
          <input type="file" accept=".csv" disabled={busy} className="block mt-3 text-xs"
            onChange={event => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ''; }} />
        </label>
        <p className="text-xs text-slate-400">Required: product name, category, supported segment and price. Up to 200 rows. SKU and brand are optional. Column order does not matter. No filename-based defaults.</p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {preview && <>
          <p className="text-sm">Total rows: {preview.total}</p>
          <div className="grid grid-cols-5 gap-2">{(Object.keys(labels) as Status[]).map(status =>
            <div key={status} className="rounded-lg bg-slate-800 p-3 text-xs"><strong className="block text-lg">{preview.counts[status]}</strong>{labels[status]}</div>)}</div>
          {preview.warnings.map((warning, index) => <p key={index} className="text-xs text-amber-300">{warning}</p>)}
          <div className="overflow-auto max-h-80 border border-slate-700 rounded-lg"><table className="w-full text-xs">
            <thead className="bg-slate-800 sticky top-0"><tr>{['Select', 'Row', 'Product / brand', 'Segment / category', 'Variant / price', 'Classification / reason'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead>
            <tbody>{preview.rows.map(row => <tr key={row.row} className="border-t border-slate-800">
              <td className="p-2"><input type="checkbox" aria-label={'Select row ' + row.row} checked={selected.includes(row.row)}
                disabled={busy || !['NEW', 'POSSIBLE_DUPLICATE'].includes(row.status)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.row] : previous.filter(value => value !== row.row))} /></td>
              <td className="p-2">{row.row}</td><td className="p-2">{row.product?.name || 'Invalid row'}<br />{row.product?.brand}</td>
              <td className="p-2">{row.product?.segment}<br />{row.product?.category}</td>
              <td className="p-2">{row.product?.variants[0]?.size} {row.product?.variants[0]?.flavor}<br />{row.product?.variants[0]?.price}</td>
              <td className="p-2">{labels[row.status]}<br />{row.reason}{[...row.matches, ...row.possibleDuplicates].length > 0 && <p>Catalog IDs: {[...row.matches, ...row.possibleDuplicates].join(', ')}</p>}</td>
            </tr>)}</tbody>
          </table></div>
          <label className="block text-xs text-amber-200"><input type="checkbox" checked={acknowledge} disabled={busy} onChange={event => setAcknowledge(event.target.checked)} /> I reviewed selected possible duplicates and intend to create separate variants/products.</label>
          <p className="text-xs text-slate-400">Rows commit independently. A failure does not undo successful rows. Retrying this preview recovers successful results without creating copies.</p>
        </>}
        {results.length > 0 && <div role="status" className="rounded-lg bg-slate-800 p-3 text-xs">
          <p>{results.filter(row => row.status === 'IMPORTED').length} imported/recovered; {results.filter(row => row.status === 'FAILED').length} failed; {results.filter(row => row.status === 'SKIPPED').length} skipped.</p>
          {results.map(row => <p key={row.row}>Row {row.row}: {row.status} {row.replayed ? '(previously committed)' : ''} {row.reason} {row.productId}</p>)}
        </div>}
      </div>
      <div className="px-6 py-4 border-t border-slate-800 flex justify-between text-xs">
        <span>{selected.length} selected</span>
        <button onClick={() => void commit()} disabled={busy || !selected.length || (!!hasSelectedPossible && !acknowledge)} className="rounded-lg px-4 py-2 bg-indigo-600 disabled:opacity-40">
          {busy ? <><Loader2 className="inline w-4 h-4 animate-spin" /> Working…</> : 'Confirm selected import / retry'}
        </button>
      </div>
    </div>
  </div>;
}
