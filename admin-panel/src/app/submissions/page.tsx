"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/lib/firebase/admin-auth-context';
import { reviewSubmission } from '@/lib/submission-review';

type Submission = {
  id: string; userId: string; status: string; createdAt: string; productId: string | null;
  content?: { name: string; brand: string; segment: string; category: string; description: string;
    image_url: string; sku: string; variants: Record<string, string | number>[] };
};

export default function SubmissionsPage() {
  const { user } = useAdminAuth();
  const [status, setStatus] = useState('submitted');
  const [rows, setRows] = useState<Submission[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const generation = useRef(0);
  const request = useCallback(async (path: string, method = 'GET') => {
    if (!user) throw new Error('Sign in as Admin to review submissions.');
    const token = await user.getIdToken();
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
    const response = await fetch(base + '/api/v1/admin/product-submissions' + path, {
      method, headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'Review request failed.'), { status: response.status });
    return result;
  }, [user]);
  const load = useCallback(async (after?: string) => {
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await request(`?status=${status}${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      if (current === generation.current) {
        setRows(previous => after ? [...previous, ...result.submissions] : result.submissions);
        setNext(result.next);
        // Only refreshed rows may regain actions, never an unresolved stale row.
        setLockedIds(previous => after ? previous.filter(id => !result.submissions.some((row: Submission) => row.id === id)) : []);
      }
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'Unable to load.');
    } finally { if (current === generation.current) setBusy(false); }
  }, [request, status]);
  useEffect(() => {
    const requestGeneration = generation;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); requestGeneration.current++; };
  }, [load]);
  async function review(id: string, decision: 'approve' | 'reject') {
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await reviewSubmission<Submission>({ id, decision,
        mutate: () => request(`/${encodeURIComponent(id)}/${decision}`, 'POST'),
        read: () => request(`/${encodeURIComponent(id)}`),
        lock: () => { if (current === generation.current) setLockedIds(previous => [...new Set([...previous, id])]); },
      });
      if (current !== generation.current) return;
      if (result.kind === 'success') {
        setRows(previous => previous.map(row => row.id === id ? { ...row, ...result.receipt } : row));
        await load();
      } else if (result.kind === 'conflict') {
        setRows(previous => previous.map(row => row.id === id ? result.submission : row));
        setLockedIds(previous => previous.filter(value => value !== id));
        setError(result.message);
      } else {
        setError(result.message);
      }
    } finally { if (current === generation.current) setBusy(false); }
  }
  return <main className="p-6 space-y-5 text-slate-200">
    <h1 className="text-xl font-semibold">Product Submissions</h1>
    <p className="text-sm text-slate-400">Review immutable Customer submissions. Only approval publishes a catalog product. Final decisions cannot be reopened here.</p>
    <div className="flex gap-3">
      <select aria-label="Review status" value={status} disabled={busy} onChange={event => setStatus(event.target.value)} className="bg-slate-800 rounded p-2">
        <option value="submitted">Submitted</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
      </select>
      <button disabled={busy} onClick={() => void load()}>Refresh</button>
    </div>
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {busy && <p role="status">Loading…</p>}
    {!busy && rows.length === 0 && <p>No submissions in this view.</p>}
    {rows.map(row => <article key={row.id} className="rounded-xl border border-slate-700 p-4 space-y-2 break-words">
      <h2 className="font-semibold">{row.content?.name || 'Legacy submission — separate operator resolution required'}</h2>
      <p className="text-xs text-slate-400">Reference: {row.id} · Customer UID: {row.userId} · {row.status}</p>
      <p className="text-xs">Submitted: {typeof row.createdAt === 'string' ? row.createdAt : 'Legacy timestamp'}</p>
      {row.content && <>
        <p>Brand: {row.content.brand || '—'} · Segment: {row.content.segment} · Category: {row.content.category}</p>
        <p>SKU: {row.content.sku || '—'}</p><p>{row.content.description}</p>
        <p>Image URL: <span className="select-all">{row.content.image_url || 'None'}</span></p>
        <p className="text-xs text-slate-400">URL metadata only; no automatic preview or remote image verification.</p>
        <ul className="text-sm">{row.content.variants.map((variant, index) => <li key={index}>
          {Object.entries(variant).map(([key, value]) => `${key}: ${value}`).join(' · ')}
        </li>)}</ul>
      </>}
      {row.productId && <p>Published product: {row.productId}</p>}
      {lockedIds.includes(row.id) && <p className="text-amber-300">Actions locked until authoritative refresh succeeds.</p>}
      {row.status === 'submitted' && row.content && !lockedIds.includes(row.id) && <div className="flex gap-4 pt-2">
        <button disabled={busy} className="rounded bg-emerald-700 px-3 py-2 disabled:opacity-40" onClick={() => void review(row.id, 'approve')}>Approve and publish</button>
        <button disabled={busy} className="rounded bg-red-900 px-3 py-2 disabled:opacity-40" onClick={() => void review(row.id, 'reject')}>Reject</button>
      </div>}
    </article>)}
    {next && <button disabled={busy} onClick={() => void load(next)}>Load more</button>}
  </main>;
}
