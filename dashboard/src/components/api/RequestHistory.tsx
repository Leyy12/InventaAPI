"use client";
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { useAuth } from '@/lib/firebase/auth-context';
import { apiKeyRequest } from '@/lib/api-keys';
import { createHistoryRefresh, historyDate, requestStatus, type HistoryState } from '@/lib/api-history';

function History({ user }: { user: User }) {
  const [state, setState] = useState<HistoryState>({ status: 'loading', records: [], hasMore: false });
  const reader = useMemo(() => createHistoryRefresh(signal => apiKeyRequest(user, '/history', { signal }), setState), [user]);
  useEffect(() => { void reader.refresh(); return () => reader.stop(); }, [reader]);
  return <section aria-label="Recent API request history" className="glass-card rounded-xl border border-slate-700 p-6 space-y-4">
    <div className="flex justify-between gap-4"><h2 className="text-xl font-semibold text-white">Recent API request history</h2>
      <button onClick={() => void reader.refresh()} disabled={state.status === 'loading'} className="text-indigo-300 disabled:opacity-50">Refresh history</button></div>
    <p className="text-sm text-slate-400">Up to 50 recorded requests, newest first. Key names are labels at request time, not downstream consumer identities. Dates use your browser timezone.</p>
    <p className="text-xs text-slate-400">Best-effort route telemetry, not a complete history or quota counter. Requests rejected before the route handler (including quota rejection) are not currently recorded here.</p>
    {state.status === 'loading' && <p role="status">Loading history…</p>}
    {state.status === 'error' && <p role="alert" className="text-rose-300">Unable to load request history. Refresh to retry. Previous rows have been cleared.</p>}
    {state.status === 'ready' && (state.records.length === 0 ? <p>No recorded requests available.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{['Key name (at request)', 'Date', 'Endpoint', 'HTTP status'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
      <tbody>{state.records.map((row, index) => <tr key={index} className="border-t border-slate-700">
        <td className="p-3">{row.keyName ?? 'Key name unavailable'}</td><td className="p-3">{historyDate(row.timestamp)}</td>
        <td className="p-3">{row.endpoint ? `${row.method ?? ''} ${row.endpoint}` : 'Not recorded'}</td><td className="p-3">{requestStatus(row.statusCode)}</td>
      </tr>)}</tbody></table></div>)}
    {state.status === 'ready' && state.hasMore && <p className="text-xs text-slate-400">Older records exist. This view is limited to the latest 50 records; it does not offer full-history pagination.</p>}
  </section>;
}
export default function RequestHistory() {
  const { user } = useAuth();
  return user ? <History key={user.uid} user={user} /> : null;
}
