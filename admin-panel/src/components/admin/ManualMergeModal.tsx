"use client";

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Layers, Loader2, X } from 'lucide-react';
import { catalogRequest } from '@/lib/catalog-client';

type Variant = { flavor?: string; size?: string };
type Item = { id: string; name: string; brand: string; segment?: string; image_url?: string; variants?: Variant[] };
type Result = { status: 'MERGED' | 'FAILED'; reason?: string; removed?: number; apiKeysUpdated?: number; name?: string };

const SIZE = /\b\d+(?:[.,]\d+)?\s*(?:ml|l|ltr|g|gm|gms|grams?|kg|kgs|mg|oz|pcs?|s)\b/giu;
const withoutSize = (name: string) => name.replace(SIZE, ' ').replace(/\s+/gu, ' ').trim();
const tokens = (name: string) => withoutSize(name).split(/\s+/u).filter(Boolean);
const norm = (word: string) => word.toLowerCase().replace(/[^a-z0-9]+/gu, '');
// Words of a product's name that are not in the merged name: usually its flavor ("Adobo").
const flavorFrom = (name: string, merged: string) => {
  const base = new Set(tokens(merged).map(norm));
  return tokens(name).filter(word => norm(word) && !base.has(norm(word)))
    .map(word => word.length > 2 && word === word.toUpperCase() ? word[0] + word.slice(1).toLowerCase() : word).join(' ');
};
// Shortest name without its size as the suggested merged name.
const suggestName = (items: Item[]) => [...items].map(item => withoutSize(item.name)).sort((a, b) => a.length - b.length)[0] ?? '';

export default function ManualMergeModal({ items, onClose, onFinished }:
  { items: Item[]; onClose: () => void; onFinished: (message: string) => void }) {
  const [keeperId, setKeeperId] = useState(() => [...items].sort((a, b) => (b.variants?.length ?? 0) - (a.variants?.length ?? 0)
    || Number(!a.image_url) - Number(!b.image_url))[0]?.id ?? '');
  const [name, setName] = useState(() => suggestName(items));
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [merging, setMerging] = useState(false);
  const locked = useRef(false);
  const segments = new Set(items.map(item => item.segment));
  // Suggested flavors follow the name until the Admin edits one.
  const flavors = useMemo(() => Object.fromEntries(items.map(item => [item.id, edited[item.id] ?? flavorFrom(item.name, name)])), [items, edited, name]);

  const merge = async () => {
    if (locked.current) return;
    locked.current = true; setMerging(true); setError('');
    try {
      const response = await catalogRequest<{ results: Result[] }>('/duplicates/merge', 'POST', { groups: [{
        keeperId, duplicateIds: items.map(item => item.id).filter(id => id !== keeperId), manual: true, name: name.trim(),
        flavors: Object.fromEntries(Object.entries(flavors).map(([id, flavor]) => [id, flavor.trim()]).filter(([, flavor]) => flavor)) }] });
      const result = response.results[0];
      if (result?.status !== 'MERGED') throw new Error(result?.reason || 'These products could not be merged.');
      onFinished(`Merged ${items.length} products into "${result.name}"` + (result.apiKeysUpdated ? `; ${result.apiKeysUpdated} API key(s) updated.` : '.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Merge failed.');
    } finally { locked.current = false; setMerging(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
    <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700/70 bg-[#0d1424] text-slate-200 shadow-2xl">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-6 py-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-indigo-400/30 bg-indigo-500/15 text-indigo-300"><Layers className="h-5 w-5" /></div>
          <div className="min-w-0"><h2 className="text-lg font-bold text-white">Merge {items.length} products into one</h2>
            <p className="text-sm text-slate-400">Each product becomes a size or flavor of one product. Its photo stays with its sizes.</p></div>
        </div>
        <button onClick={onClose} disabled={merging} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:text-white disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {segments.size > 1 && <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />These products are in different segments. Only products of one segment can be merged.</p>}
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        <label className="block text-sm"><span className="mb-1 block font-medium text-slate-300">Product name</span>
          <input value={name} onChange={event => setName(event.target.value)} maxLength={160} disabled={merging}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none" /></label>
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Keep one product (its brand, category and photo are used). Type the flavor each product becomes, or leave it empty for sizes only.</p>
          {items.map(item => <div key={item.id} className={'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 '
            + (keeperId === item.id ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40')}>
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <input type="radio" name="keep" checked={keeperId === item.id} onChange={() => setKeeperId(item.id)} disabled={merging} className="h-4 w-4 accent-emerald-500" />
              {item.image_url ? <img src={item.image_url} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                : <span className="h-10 w-10 shrink-0 rounded-lg bg-slate-800" />}
              <span className="min-w-0">
                <span className="block truncate font-semibold text-white">{item.name}</span>
                <span className="block truncate text-xs text-slate-400">{item.brand || 'Generic'} · {(item.variants ?? []).map(variant => [variant.flavor, variant.size].filter(Boolean).join(' ')).filter(Boolean).join(', ') || 'no size'}{keeperId === item.id ? ' · kept' : ''}</span>
              </span>
            </label>
            <input value={flavors[item.id] ?? ''} onChange={event => setEdited(previous => ({ ...previous, [item.id]: event.target.value }))}
              placeholder="Flavor (optional)" maxLength={80} disabled={merging} aria-label={`Flavor for ${item.name}`}
              className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none" />
          </div>)}
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-800 px-6 py-4">
        <button onClick={onClose} disabled={merging} className="rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40">Cancel</button>
        <button onClick={() => void merge()} disabled={merging || !name.trim() || segments.size > 1 || items.length < 2}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
          {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}{merging ? 'Merging…' : 'Merge'}</button>
      </div>
    </div>
  </div>;
}
