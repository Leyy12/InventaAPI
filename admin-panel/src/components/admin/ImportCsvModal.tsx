"use client";

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Square, Upload, X } from 'lucide-react';
import Papa from 'papaparse';
import { catalogRequest } from '@/lib/catalog-client';
import { extractTemplateRows, fitsTemplate } from '@/lib/csv-extract';

// Server statuses (services/catalog-import.js). The window groups them into four tabs.
type Status = 'NEW' | 'APPEND' | 'UPDATE' | 'EXACT_EXISTING_MATCH' | 'POSSIBLE_DUPLICATE' | 'INVALID' | 'CONFLICT' | 'NO_IMAGE';
type PreviewRow = { row: number; status: Status; reason: string;
  product: { name: string; brand: string; segment: string; category: string; sku: string; size: string; flavor: string } | null };
type Preview = { previewId: string; total: number; warnings: string[]; rows: PreviewRow[] };
type Result = { row: number; status: 'IMPORTED' | 'UPDATED' | 'APPENDED' | 'FAILED' | 'SKIPPED'; reason?: string; productId?: string };
type Tab = 'new' | 'appended' | 'updates' | 'skipped';

// Rows sent per commit request; the whole file is sent batch after batch until done.
const COMMIT_BATCH = 50;
const PAGE_SIZE = 50;
const TAB_OF: Record<Status, Tab> = { NEW: 'new', APPEND: 'appended', UPDATE: 'updates', EXACT_EXISTING_MATCH: 'skipped',
  POSSIBLE_DUPLICATE: 'skipped', INVALID: 'skipped', CONFLICT: 'skipped', NO_IMAGE: 'skipped' };
const TABS: { id: Tab; label: string }[] = [{ id: 'new', label: 'New' }, { id: 'appended', label: 'Appended' },
  { id: 'updates', label: 'Updates' }, { id: 'skipped', label: 'Skipped' }];
const SEGMENT_PILL: Record<string, string> = {
  Pharmacy: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  Grocery: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  Hardware: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
};
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function ImportCsvModal({ onClose, onImported, onFinished }:
  { onClose: () => void; onImported: () => void; onFinished?: (message: string) => void }) {
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<Tab>('new');
  const [page, setPage] = useState(0);
  const [segment, setSegment] = useState('Grocery');
  const [requireImage, setRequireImage] = useState(true);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<Map<number, Result>>(new Map());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const locked = useRef(false);
  const stopRequested = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setPreview(null); setResults(new Map()); setError(''); setNotice(''); setFileName(''); setParsedRows(0); setProgress(''); };

  const handleFile = async (file: File | undefined) => {
    if (!file || locked.current) return;
    locked.current = true; reset(); setChecking(true);
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file.');
      setFileName(file.name);
      // Header:false keeps duplicate columns visible to the server's alias checks.
      const parsed = Papa.parse<string[]>(await file.text(), { header: false, skipEmptyLines: 'greedy' });
      if (parsed.errors.length) throw new Error(parsed.errors.slice(0, 3).map(e => 'CSV row ' + ((e.row ?? 0) + 1) + ': ' + e.message).join('; '));
      let rows = parsed.data;
      setParsedRows(Math.max(0, rows.length - 1));
      // Other layouts (for example an Open Food Facts export) are reduced to the template columns.
      if (!fitsTemplate(rows[0] ?? [])) {
        const extracted = extractTemplateRows(rows, { segment, category: 'Uncategorized' });
        if (!extracted.used.name) throw new Error('Could not find a product name column in this file.');
        rows = extracted.rows;
        setNotice(`Columns read: ${Object.entries(extracted.used).map(([field, source]) => `${field} ← ${source}`).join(', ')}.`);
      }
      // Vercel rejects request bodies over 4.5 MB before the API sees them.
      if (new Blob([JSON.stringify({ rows })]).size > 4 * 1024 * 1024) {
        throw new Error('This file has too much product detail to check in one go (over about 4 MB). Split it into two files.');
      }
      const next = await catalogRequest<Preview>('/import/preview', 'POST', { rows, options: { merge: true, requireImage } });
      setPreview(next);
      const counts = countTabs(next.rows);
      setTab(TABS.find(item => counts[item.id] > 0)?.id ?? 'new'); setPage(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to check this CSV.');
    } finally { locked.current = false; setChecking(false); }
  };

  const counts = useMemo(() => countTabs(preview?.rows ?? []), [preview]);
  const writable = useMemo(() => (preview?.rows ?? []).filter(row => TAB_OF[row.status] !== 'skipped').map(row => row.row), [preview]);
  // A row that failed is reported, not retried forever: its reason (for example a
  // size whose product row was skipped) does not change by sending it again.
  const remaining = writable.filter(row => !results.has(row));
  const done = results.size > 0 && remaining.length === 0;
  const summary = useMemo(() => {
    const tally = { IMPORTED: 0, UPDATED: 0, APPENDED: 0, FAILED: 0, SKIPPED: 0 };
    for (const result of results.values()) tally[result.status]++;
    return tally;
  }, [results]);

  // Sends every writable row, a batch at a time. Rate limits wait a minute; network
  // errors retry. Each row is committed once on the server, so retries never duplicate.
  const commit = async () => {
    if (locked.current || !preview || !remaining.length) return;
    locked.current = true; stopRequested.current = false; setImporting(true); setError('');
    const collected = new Map(results);
    let wrote = false, finished = false;
    try {
      for (let i = 0; i < remaining.length && !stopRequested.current; i += COMMIT_BATCH) {
        const batch = remaining.slice(i, i + COMMIT_BATCH);
        setProgress(`Importing ${Math.min(i + batch.length, remaining.length).toLocaleString()} of ${remaining.length.toLocaleString()} rows…`);
        for (let attempt = 0; ; attempt++) {
          try {
            const response = await catalogRequest<{ results: Result[] }>('/import/commit', 'POST', { previewId: preview.previewId, rows: batch });
            for (const result of response.results) collected.set(result.row, result);
            if (response.results.some(result => ['IMPORTED', 'UPDATED', 'APPENDED'].includes(result.status))) wrote = true;
            setResults(new Map(collected));
            break;
          } catch (cause) {
            const status = (cause as { status?: number }).status;
            if (status === 429) { setProgress('The server is busy. Continuing in 1 minute…'); await wait(60000); continue; }
            if ((status === undefined || status >= 500) && attempt < 3) { setProgress('Connection problem. Retrying…'); await wait(2000 * 2 ** attempt); continue; }
            throw cause;
          }
        }
      }
      finished = !stopRequested.current;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Import stopped.';
      setError(/expired/iu.test(message) ? 'This check expired. Choose the file again to continue; rows already imported are skipped.' : message + ' Press Continue import to retry.');
    } finally {
      if (wrote) onImported();
      locked.current = false; setImporting(false); setProgress('');
    }
    if (finished) finish(collected);
  };

  // Closes the window and reports the outcome on the page. Rows that were not
  // added (with their reasons) are downloaded first, so nothing is lost on close.
  const finish = (collected: Map<number, Result>) => {
    const tally = { IMPORTED: 0, UPDATED: 0, APPENDED: 0, FAILED: 0, SKIPPED: 0 };
    for (const result of collected.values()) tally[result.status]++;
    const failed = tally.FAILED;
    if (failed) downloadReport(collected);
    const parts = [`${tally.IMPORTED.toLocaleString()} added`, `${tally.APPENDED.toLocaleString()} sizes appended`,
      `${tally.UPDATED.toLocaleString()} updated`];
    const message = `Import finished: ${parts.join(' · ')}.`
      + (failed ? ` ${failed.toLocaleString()} row${failed === 1 ? '' : 's'} could not be added; the list with reasons was downloaded.` : '');
    if (onFinished) onFinished(message); else onClose();
  };

  const reportRowsFor = (outcomes: Map<number, Result>) => (preview?.rows ?? []).flatMap(row => {
    const result = outcomes.get(row.row);
    if (TAB_OF[row.status] === 'skipped') return [[row.row, row.product?.name ?? '', row.product?.brand ?? '', 'Skipped', row.reason]];
    if (result?.status === 'FAILED' || result?.status === 'SKIPPED') return [[row.row, row.product?.name ?? '', row.product?.brand ?? '', result.status === 'FAILED' ? 'Failed' : 'Skipped', result.reason ?? '']];
    return [];
  });
  const reportRows = useMemo(() => reportRowsFor(results), [preview, results]); // eslint-disable-line react-hooks/exhaustive-deps
  const downloadReport = (outcomes: Map<number, Result> = results) => {
    const csv = Papa.unparse({ fields: ['row', 'name', 'brand', 'result', 'reason'], data: reportRowsFor(outcomes) }, { escapeFormulae: true });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: fileName.replace(/\.csv$/iu, '') + '_not_imported.csv' }).click();
    URL.revokeObjectURL(url);
  };
  const downloadTemplate = () => {
    const csv = 'name,brand,segment,category,size,flavor,sku,image_url\n'
      + '"Sample Item","Sample Brand","Grocery","Snacks","330ml","Original","SAMPLE-330","https://example.com/sample.jpg"';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'import_template.csv' }).click();
    URL.revokeObjectURL(url);
  };

  const shown = (preview?.rows ?? []).filter(row => TAB_OF[row.status] === tab);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const busy = checking || importing;
  const writtenCount = summary.IMPORTED + summary.UPDATED + summary.APPENDED;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
    <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-[#0d1424] text-slate-200 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-indigo-400/30 bg-indigo-500/15 text-indigo-300"><Upload className="h-5 w-5" /></div>
          <div className="min-w-0"><h2 className="text-lg font-bold text-white">Import CSV</h2>
            <p className="text-sm text-slate-400">Upload a CSV file to add or update products.</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button onClick={downloadTemplate} aria-label="Download template" className="flex items-center gap-2 rounded-xl border border-indigo-400/40 bg-indigo-500/10 px-4 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/20">
            <Download className="h-4 w-4" /><span className="hidden sm:inline">Template</span></button>
          <button onClick={onClose} disabled={importing} aria-label="Close importer" className="rounded-lg p-1.5 text-slate-400 hover:text-white disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {/* File */}
        {!preview && !checking ? <>
          <label onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={event => { event.preventDefault(); setDragging(false); void handleFile(event.dataTransfer.files?.[0]); }}
            className={'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors '
              + (dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-700 bg-slate-800/30 hover:border-slate-500')}>
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-800 text-slate-300"><FileText className="h-6 w-6" /></div>
            <p className="font-semibold text-white">Drop a CSV file here, or click to choose one</p>
            <p className="max-w-lg text-sm text-slate-400">Any size works. New products are added, a new size of an existing product is appended to it, and existing products get a missing photo. Rows already in the catalog are skipped.</p>
            <input ref={input} type="file" accept=".csv" className="hidden" onChange={event => { void handleFile(event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={requireImage} onChange={event => setRequireImage(event.target.checked)} className="h-4 w-4 accent-indigo-500" />
              Skip rows without an image</label>
            <label className="flex items-center gap-2">Segment for rows without one
              <select value={segment} onChange={event => setSegment(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200">
                {['Grocery', 'Pharmacy', 'Hardware'].map(option => <option key={option}>{option}</option>)}
              </select></label>
          </div>
        </> : <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-700/60 bg-slate-800/30 px-5 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-indigo-300"><FileText className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="truncate font-semibold text-white">{fileName}</p>
              <p className="text-xs text-slate-400">{checking ? 'Checking rows against the catalog…' : `${parsedRows.toLocaleString()} rows parsed${requireImage ? ' · rows without an image are skipped' : ''}`}</p></div>
          </div>
          {checking ? <Loader2 className="h-5 w-5 animate-spin text-indigo-300" />
            : <button onClick={() => { reset(); setTimeout(() => input.current?.click()); }} disabled={importing}
              className="shrink-0 text-sm font-medium text-indigo-300 hover:text-indigo-200 disabled:opacity-40">Change File</button>}
        </div>}

        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        {notice && <p className="text-xs text-sky-300">{notice}</p>}
        {preview?.warnings.length ? <p className="text-xs text-amber-300/90">{preview.warnings.join(' · ')}</p> : null}

        {results.size > 0 && <div className={'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm '
          + (summary.FAILED ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100')}>
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />
            {done ? 'Import finished' : 'Import paused'}: {summary.IMPORTED.toLocaleString()} added · {summary.APPENDED.toLocaleString()} appended · {summary.UPDATED.toLocaleString()} updated
            {summary.SKIPPED ? ` · ${summary.SKIPPED.toLocaleString()} already up to date` : ''}{summary.FAILED ? ` · ${summary.FAILED.toLocaleString()} failed` : ''}</span>
        </div>}

        {/* Tabs */}
        {preview && <>
          <div role="tablist" className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700/60 bg-slate-800/20 p-2 sm:grid-cols-4">
            {TABS.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setPage(0); }}
              className={'rounded-xl px-4 py-3 text-center transition-colors '
                + (tab === item.id ? 'bg-slate-700/50 text-white ring-2 ring-slate-200/80' : 'text-slate-400 hover:bg-slate-800/60')}>
              <strong className={'block text-2xl font-bold ' + (tab === item.id ? 'text-white' : 'text-slate-300')}>{counts[item.id].toLocaleString()}</strong>
              <span className="text-sm">{item.label}</span>
            </button>)}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-700/60">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                  {['#', 'Name', 'Brand', 'Segment', 'Category', 'Size', 'SKU'].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}
                </tr></thead>
                <tbody>
                  {visible.map(row => {
                    const result = results.get(row.row), product = row.product;
                    const note = result?.status === 'FAILED' ? result.reason : tab === 'new' ? '' : row.reason;
                    return <tr key={row.row} className="border-t border-slate-800/80 align-top hover:bg-slate-800/30">
                      <td className="px-4 py-3 font-mono text-slate-500">{row.row}</td>
                      <td className="max-w-[220px] px-4 py-3">
                        <span className="block truncate font-semibold text-white" title={product?.name}>{product?.name || 'Invalid row'}</span>
                        {note && <span className={'block truncate text-xs ' + (result?.status === 'FAILED' ? 'text-rose-300' : tab === 'skipped' ? 'text-amber-300/90' : 'text-slate-400')} title={note}>{note}</span>}
                        {result && result.status !== 'FAILED' && <span className="block text-xs text-emerald-300">{{ IMPORTED: 'Added', UPDATED: 'Updated', APPENDED: 'Appended', SKIPPED: 'Already up to date' }[result.status]}</span>}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-slate-300">{product?.brand}</td>
                      <td className="px-4 py-3">{product?.segment && <span className={'rounded-full border px-2.5 py-0.5 text-xs ' + (SEGMENT_PILL[product.segment] ?? 'border-slate-600 text-slate-300')}>{product.segment}</span>}</td>
                      <td className="max-w-[170px] truncate px-4 py-3 text-slate-300" title={product?.category}>{product?.category}</td>
                      <td className="max-w-[110px] truncate px-4 py-3 font-mono text-slate-300" title={[product?.size, product?.flavor].filter(Boolean).join(' · ')}>{product?.size || product?.flavor}</td>
                      <td className="max-w-[130px] truncate px-4 py-3 font-mono text-slate-400">{product?.sku}</td>
                    </tr>;
                  })}
                  {!visible.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No rows in this tab.</td></tr>}
                </tbody>
              </table>
            </div>
            {pages > 1 && <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-4 py-2 text-xs text-slate-400">
              <span>Rows {(current * PAGE_SIZE + 1).toLocaleString()}–{Math.min((current + 1) * PAGE_SIZE, shown.length).toLocaleString()} of {shown.length.toLocaleString()}</span>
              <button onClick={() => setPage(current - 1)} disabled={current === 0} className="rounded-lg border border-slate-700 px-3 py-1 disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(current + 1)} disabled={current >= pages - 1} className="rounded-lg border border-slate-700 px-3 py-1 disabled:opacity-40">Next</button>
            </div>}
          </div>
        </>}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
        <div className="min-w-0 flex-1 text-sm text-slate-400">
          {importing ? <div className="max-w-sm space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${writable.length ? Math.round((writtenCount + summary.SKIPPED + summary.FAILED) / writable.length * 100) : 0}%` }} /></div>
            <p>{progress}</p></div>
            : preview ? <span>{done ? `${writtenCount.toLocaleString()} rows written` : `${remaining.length.toLocaleString()} rows will be written`} · {(counts.skipped + summary.SKIPPED).toLocaleString()} skipped
              {reportRows.length > 0 && <button onClick={() => downloadReport()} className="ml-3 text-indigo-300 hover:text-indigo-200"><Download className="mr-1 inline h-3.5 w-3.5" />Download skipped rows</button>}</span>
            : <span>Choose a file to see what will be imported before anything is saved.</span>}
        </div>
        <div className="flex gap-3">
          {importing ? <button onClick={() => { stopRequested.current = true; setProgress('Stopping after this batch…'); }}
            className="flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800"><Square className="h-3.5 w-3.5" /> Stop</button>
            : <button onClick={onClose} className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800">{done ? 'Close' : 'Cancel'}</button>}
          {!done && <button onClick={() => void commit()} disabled={busy || !remaining.length}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 hover:bg-indigo-500 disabled:opacity-40">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? 'Importing…' : results.size ? 'Continue Import' : 'Confirm Import'}</button>}
        </div>
      </div>
    </div>
  </div>;
}

function countTabs(rows: PreviewRow[]): Record<Tab, number> {
  const counts: Record<Tab, number> = { new: 0, appended: 0, updates: 0, skipped: 0 };
  for (const row of rows) counts[TAB_OF[row.status]]++;
  return counts;
}
