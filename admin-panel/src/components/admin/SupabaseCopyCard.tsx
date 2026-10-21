"use client";

import { useState } from 'react';
import { Database } from 'lucide-react';
import { useAdminAuth } from '@/lib/firebase/admin-auth-context';

type Count = { collection: string; firestore: number; supabase: number; match: boolean };
type Step = { collection?: string; copied?: number; done: boolean; next: { collection: string; cursor: string | null } | null; skipped: string[] };

const buttonClass = 'w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors text-left flex items-center justify-between border border-slate-700 disabled:opacity-50';

// Copies Firestore data into Supabase page by page and shows both sides' counts.
// The API turns this off once it reads Supabase, so a stale copy can't overwrite newer data.
export function SupabaseCopyCard() {
  const { user } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [counts, setCounts] = useState<Count[] | null>(null);

  const call = async (path: string, body?: unknown) => {
    if (!user) throw new Error('Admin session required');
    const token = await user.getIdToken();
    const response = await fetch(`/api/v1/admin/${path}`, { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Request failed');
    return payload;
  };

  const compare = async () => {
    const result = await call('supabase-copy/status') as { counts: Count[]; allMatch: boolean };
    setCounts(result.counts);
    return result.allMatch;
  };

  const run = async () => {
    setBusy(true); setCounts(null);
    try {
      let body: Step['next'] | Record<string, never> = {};
      let total = 0;
      for (;;) {
        const step = await call('supabase-copy', body) as Step;
        total += step.copied || 0;
        setStatus(`Copied ${total} records${step.collection ? ` (now on ${step.collection})` : ''}…`);
        if (step.done || !step.next) break;
        body = step.next;
      }
      const allMatch = await compare();
      setStatus(allMatch ? `Done. Copied ${total} records and every count matches.` : `Copied ${total} records, but some counts differ (new records may have arrived). Run the copy again.`);
    } catch (error) {
      setStatus(`${error instanceof Error ? error.message : 'Copy failed'} You can run it again safely.`);
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try { setStatus((await compare()) ? 'Every count matches.' : 'Some counts differ.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not compare.'); }
    finally { setBusy(false); }
  };

  return <div className="glass-card rounded-xl border border-white/5 p-6">
    <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Database className="w-5 h-5 text-indigo-400" />Copy data to Supabase</h2>
    <p className="text-xs text-slate-400 mb-4">Copies every Firebase record into Supabase. Firebase is only read, never changed, and running it again just refreshes the copy.</p>
    <div className="space-y-3">
      <button type="button" disabled={busy} onClick={() => { void run(); }} className={buttonClass}><span>{busy ? 'Working…' : 'Copy now'}</span><span aria-hidden="true">→</span></button>
      <button type="button" disabled={busy} onClick={() => { void check(); }} className={buttonClass}><span>Compare counts</span><span aria-hidden="true">→</span></button>
    </div>
    <p role="status" className="text-xs text-slate-400 mt-3">{status}</p>
    {counts && <ul className="mt-3 space-y-1 text-xs">
      {counts.map(c => <li key={c.collection} className={c.match ? 'text-slate-400' : 'text-amber-300'}>{c.collection}: {c.firestore} in Firebase, {c.supabase} in Supabase</li>)}
    </ul>}
  </div>;
}
