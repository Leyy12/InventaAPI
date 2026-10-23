"use client";

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Layers, Loader2, X } from 'lucide-react';
import { catalogRequest } from '@/lib/catalog-client';

// Products that are only different sizes of one product (services/catalog-merge.js).
type Group = { keeperId: string; duplicateIds: string[]; name: string; brand: string;
  products: { id: string; name: string; brand: string; sizes: string[] }[] };
type Result = { keeperId: string; status: 'MERGED' | 'FAILED'; reason?: string; removed?: number; apiKeysUpdated?: number };
const BATCH = 20;

export default function MergeDuplicatesModal({ onClose, onFinished }: { onClose: () => void; onFinished: (message: string) => void }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState('');
  const locked = useRef(false);

  useEffect(() => {
    let live = true;
    catalogRequest<{ groups: Group[] }>('/duplicates', 'GET', undefined)
      .then(result => { if (live) { setGroups(result.groups); setChosen(new Set(result.groups.map(group => group.keeperId))); } })
      .catch(cause => { if (live) setError(cause instanceof Error ? cause.message : 'Unable to check for duplicates.'); });
    return () => { live = false; };
  }, []);

  const toggle = (id: string) => setChosen(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const merge = async () => {
    if (locked.current || !groups) return;
    locked.current = true; setMerging(true); setError('');
    const selected = groups.filter(group => chosen.has(group.keeperId));
    const results: Result[] = [];
    try {
      for (let i = 0; i < selected.length; i += BATCH) {
        const batch = selected.slice(i, i + BATCH);
        setProgress(`Merging ${Math.min(i + batch.length, selected.length)} of ${selected.length} groups…`);
        const response = await catalogRequest<{ results: Result[] }>('/duplicates/merge', 'POST',
          { groups: batch.map(group => ({ keeperId: group.keeperId, duplicateIds: group.duplicateIds })) });
        results.push(...response.results);
      }
      const merged = results.filter(result => result.status === 'MERGED');
      const removed = merged.reduce((total, result) => total + (result.removed ?? 0), 0);
      const keys = merged.reduce((total, result) => total + (result.apiKeysUpdated ?? 0), 0);
      const failed = results.length - merged.length;
      onFinished(`Merged ${merged.length} product${merged.length === 1 ? '' : 's'}: ${removed} duplicate${removed === 1 ? '' : 's'} removed`
        + (keys ? `, ${keys} API key${keys === 1 ? '' : 's'} updated` : '') + '.'
        + (failed ? ` ${failed} could not be merged (they changed meanwhile); open Merge duplicates again to retry.` : ''));
    } catch (cause) {
      setError((cause instanceof Error ? cause.message : 'Merge stopped.') + ' Groups already merged stay merged; press Merge again to continue.');
    } finally { locked.current = false; setMerging(false); setProgress(''); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
    <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-[#0d1424] text-slate-200 shadow-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-indigo-400/30 bg-indigo-500/15 text-indigo-300"><Layers className="h-5 w-5" /></div>
          <div className="min-w-0"><h2 className="text-lg font-bold text-white">Merge duplicates</h2>
            <p className="text-sm text-slate-400">Products that are only different sizes of one product become one product with those sizes.</p></div>
        </div>
        <button onClick={onClose} disabled={merging} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:text-white disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        {!groups && !error && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Checking the catalog…</p>}
        {groups?.length === 0 && <p className="text-sm text-slate-400">No duplicates found. Every product name has one product.</p>}
        {groups && groups.length > 0 && <>
          <p className="text-xs text-slate-400">Untick any group that is not really one product. The first product in each group is kept; the others are removed and customers&apos; API keys are moved to the kept product.</p>
          {groups.map(group => <label key={group.keeperId} className={'block cursor-pointer rounded-xl border px-4 py-3 '
            + (chosen.has(group.keeperId) ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-slate-800 bg-slate-900/40 opacity-70')}>
            <span className="flex items-start gap-3">
              <input type="checkbox" checked={chosen.has(group.keeperId)} onChange={() => toggle(group.keeperId)} disabled={merging} className="mt-1 h-4 w-4 accent-indigo-500" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-white">{group.name} <span className="font-normal text-slate-400">· {group.brand || 'Generic'}</span></span>
                <span className="mt-1 block space-y-0.5 text-xs text-slate-400">
                  {group.products.map((product, index) => <span key={product.id} className="block truncate">
                    {index === 0 ? <strong className="text-emerald-300">Keep</strong> : <span className="text-amber-300">Merge</span>} · {product.name} [{product.brand || 'Generic'}] · {product.sizes.join(', ') || 'no size'}
                  </span>)}
                </span>
              </span>
            </span>
          </label>)}
        </>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
        <span className="text-sm text-slate-400">{merging ? progress : groups ? `${chosen.size} of ${groups.length} groups selected` : ''}</span>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={merging} className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40">Cancel</button>
          <button onClick={() => void merge()} disabled={merging || !groups || !chosen.size}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
            {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}{merging ? 'Merging…' : `Merge ${chosen.size}`}</button>
        </div>
      </div>
    </div>
  </div>;
}
