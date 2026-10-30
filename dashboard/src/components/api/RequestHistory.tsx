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
  const refresh = () => { setPage(1); setSelected(new Set()); void reader.refresh(); };
  // Delete rows from the history view: tick rows (or "Select all"), then delete;
  // "Clear all" removes everything recorded so far.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const selectableIds = state.records.map(row => row.id).filter((id): id is string => typeof id === 'string');
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));
  const toggleRow = (id: string) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));
  async function remove(all: boolean) {
    if (!all && selected.size === 0) return;
    if (!window.confirm(all ? 'Clear your whole request history? This cannot be undone.' : `Delete ${selected.size} selected ${selected.size === 1 ? 'row' : 'rows'}?`)) return;
    setDeleting(true); setDeleteError('');
    try {
      await apiKeyRequest(user, '/history/delete', { method: 'POST', body: JSON.stringify(all ? { all: true } : { ids: [...selected] }) });
      refresh();
    } catch { setDeleteError('Unable to delete history. Please retry.'); }
    finally { setDeleting(false); }
  }

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
      <p className="text-sm text-slate-400">Up to 50 recorded requests, newest first. Source is the website domain or server IP the call came from; &quot;New app&quot; marks its first call. Dates use your browser timezone.</p>
      <p className="text-xs text-slate-400">Best-effort route telemetry, not a complete history or quota counter. Requests rejected before the route handler (including quota rejection) are not currently recorded here.</p>
      {state.status === 'loading' && <p role="status">Loading history…</p>}
      {state.status === 'error' && <p role="alert" className="text-rose-300">Unable to load request history. Refresh to retry. Previous rows have been cleared.</p>}
      {state.status === 'ready' && (state.records.length === 0 ? <p>No recorded requests available.</p> : <>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all history rows" /> Select all</label>
          <button onClick={() => void remove(false)} disabled={deleting || selected.size === 0} className="rounded-lg border border-rose-500/60 px-3 py-1 text-sm text-rose-300 disabled:opacity-40">Delete selected{selected.size ? ` (${selected.size})` : ''}</button>
          <button onClick={() => void remove(true)} disabled={deleting} className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 disabled:opacity-40">Clear all</button>
          {deleteError && <span role="alert" className="text-sm text-rose-300">{deleteError}</span>}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th className="p-3"><span className="sr-only">Select</span></th>{['Key name (at request)', 'Date', 'Source (domain / IP)', 'Endpoint', 'HTTP status'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${current}-${index}`} className="border-t border-slate-700">
            <td className="p-3">{row.id && <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleRow(row.id as string)} aria-label="Select this history row" />}</td>
            <td className="p-3">{row.keyName ?? 'Key name unavailable'}</td><td className="p-3">{historyDate(row.timestamp)}</td>
            <td className="p-3"><span className="text-slate-200">{row.domain ?? row.ip ?? 'Not recorded'}</span>
              {row.domain && row.ip && <span className="block text-xs text-slate-400">{row.ip}</span>}
              {row.newApp && <span className="ml-2 rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">New app</span>}</td>
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
