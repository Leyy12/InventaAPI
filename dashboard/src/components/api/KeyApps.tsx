"use client";
import { useCallback, useEffect, useState } from 'react';
import type { User } from '@/lib/supabase-auth';
import { useAuth } from '@/lib/supabase/auth-context';
import { apiKeyRequest } from '@/lib/api-keys';

// Websites and servers detected using this account's API keys (no registration):
// a website by its domain, otherwise a server by its IP range. Each product is
// counted once per app per month. The owner can block an app they don't know.
type App = { id: string; kind: 'domain' | 'ip' | 'unknown'; label: string; firstSeen: string | null; lastSeen: string | null;
  lastIp: string | null; requests: number; blocked: boolean };

const when = (value: string | null) => value ? new Date(value).toLocaleString() : '—';

function Apps({ user }: { user: User }) {
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError('');
    try {
      const data = await apiKeyRequest(user, '/consumers');
      setApps(Array.isArray(data.apps) ? data.apps : []);
    } catch { setError('Unable to load apps. Refresh to retry.'); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  async function toggle(app: App) {
    setBusy(app.id);
    try {
      const data = await apiKeyRequest(user, `/consumers/${encodeURIComponent(app.id)}`, { method: 'PATCH', body: JSON.stringify({ blocked: !app.blocked }) });
      setApps(list => list?.map(item => item.id === app.id ? { ...item, blocked: data.app?.blocked === true } : item) ?? null);
    } catch { setError('Unable to update the app. Please retry.'); }
    finally { setBusy(null); }
  }
  return <section aria-label="Apps using your API key" className="glass-card rounded-xl border border-slate-700 p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-xl font-semibold text-white">Apps using your API key</h2>
      <button onClick={() => void load()} className="text-indigo-300">Refresh</button>
    </div>
    <p className="text-sm text-slate-400">Detected automatically: a website by its domain, otherwise a server or app by its IP range. Each product variant is counted once per app per month. Block any app you don&apos;t recognise.</p>
    {error && <p role="alert" className="text-rose-300">{error}</p>}
    {!apps && !error && <p role="status">Loading apps…</p>}
    {apps && apps.length === 0 && <p>No apps have used your key yet.</p>}
    {apps && apps.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr>{['App (domain / IP)', 'First seen', 'Last seen', 'Requests', 'Status', ''].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
      <tbody>{apps.map(app => <tr key={app.id} className="border-t border-slate-700">
        <td className="p-3"><span className="text-slate-200">{app.label}</span>
          <span className="block text-xs text-slate-400">{app.kind === 'domain' ? 'Website' : app.kind === 'ip' ? 'Server / app (IP range)' : 'Unknown'}{app.lastIp ? ` · last IP ${app.lastIp}` : ''}</span></td>
        <td className="p-3">{when(app.firstSeen)}</td>
        <td className="p-3">{when(app.lastSeen)}</td>
        <td className="p-3">{app.requests.toLocaleString()}</td>
        <td className="p-3">{app.blocked ? <span className="text-rose-300">Blocked</span> : <span className="text-emerald-300">Allowed</span>}</td>
        <td className="p-3"><button onClick={() => void toggle(app)} disabled={busy === app.id}
          className={`rounded-lg border px-3 py-1 text-sm disabled:opacity-50 ${app.blocked ? 'border-slate-600 text-slate-200' : 'border-rose-500/60 text-rose-300'}`}>
          {app.blocked ? 'Unblock' : 'Block'}</button></td>
      </tr>)}</tbody></table></div>}
  </section>;
}

export default function KeyApps() {
  const { user } = useAuth();
  return user ? <Apps key={user.uid} user={user} /> : null;
}
