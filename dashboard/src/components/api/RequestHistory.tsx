"use client";
import { useEffect, useMemo, useState } from 'react';
import type { User } from '@/lib/supabase-auth';
import { useAuth } from '@/lib/supabase/auth-context';
import { apiKeyRequest } from '@/lib/api-keys';
import { createHistoryRefresh, historyDate, requestStatus, type HistoryState } from '@/lib/api-history';

const PAGE_SIZE = 10;

// Hidden until the customer opens it; the history is only loaded then.
function History({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<HistoryState>({ status: 'loading', records: [], hasMore: false });
  const reader = useMemo(() => createHistoryRefresh(signal => apiKeyRequest(user, '/history', { signal }), setState), [user]);
  useEffect(() => {
    if (!open) return;
    void reader.refresh();
    return () => reader.stop();
  }, [open, reader]);
  const refresh = () => { setPage(1); void reader.refresh(); };

  const totalPages = Math.max(1, Math.ceil(state.records.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const rows = state.records.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return <section aria-label="Recent API request history" className="glass-card rounded-xl border border-slate-700 p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold text-white">Recent API request history</h2>
      <div className="flex items-center gap-4">
        {open && <button onClick={refresh} disabled={state.status === 'loading'} className="text-indigo-300 disabled:opacity-50">Refresh history</button>}
        <button onClick={() => { setPage(1); setOpen(value => !value); }} aria-expanded={open} className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
          {open ? 'Hide history' : 'Show history'}
        </button>
      </div></div>
    {open && <>
      <p className="text-sm text-slate-400">Up to 50 recorded requests, newest first. Key names are labels at request time, not downstream consumer identities. Dates use your browser timezone.</p>
      <p className="text-xs text-slate-400">Best-effort route telemetry, not a complete history or quota counter. Requests rejected before the route handler (including quota rejection) are not currently recorded here.</p>
      {state.status === 'loading' && <p role="status">Loading history…</p>}
      {state.status === 'error' && <p role="alert" className="text-rose-300">Unable to load request history. Refresh to retry. Previous rows have been cleared.</p>}
      {state.status === 'ready' && (state.records.length === 0 ? <p>No recorded requests available.</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr>{['Key name (at request)', 'Date', 'Endpoint', 'HTTP status'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${current}-${index}`} className="border-t border-slate-700">
            <td className="p-3">{row.keyName ?? 'Key name unavailable'}</td><td className="p-3">{historyDate(row.timestamp)}</td>
            <td className="p-3">{row.endpoint ? `${row.method ?? ''} ${row.endpoint}` : 'Not recorded'}</td><td className="p-3">{requestStatus(row.statusCode)}</td>
          </tr>)}</tbody></table></div>
        <nav aria-label="Request history pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>Showing {(current - 1) * PAGE_SIZE + 1}–{(current - 1) * PAGE_SIZE + rows.length} of {state.records.length}</span>
          {totalPages > 1 && <div className="flex items-center gap-2">
            <button onClick={() => setPage(current - 1)} disabled={current <= 1} className="rounded-lg border border-slate-600 px-3 py-1 text-slate-200 disabled:opacity-40">Previous</button>
            <span>Page {current} of {totalPages}</span>
            <button onClick={() => setPage(current + 1)} disabled={current >= totalPages} className="rounded-lg border border-slate-600 px-3 py-1 text-slate-200 disabled:opacity-40">Next</button>
          </div>}
        </nav>
      </>)}
      {state.status === 'ready' && state.hasMore && <p className="text-xs text-slate-400">Older records exist. Only the latest 50 records are shown here.</p>}
    </>}
  </section>;
}
export default function RequestHistory() {
  const { user } = useAuth();
  return user ? <History key={user.uid} user={user} /> : null;
}
