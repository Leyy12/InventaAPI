"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ClipboardList, RefreshCw } from 'lucide-react';
import { useAdminAuth } from '@/lib/firebase/admin-auth-context';
import { reviewSubmission } from '@/lib/submission-review';
import SubmissionReviewDialog, { ReviewStatus, SubmissionImage, submittedDate, reviewButtonClass, type Submission, type Decision } from '@/components/products/SubmissionReviewDialog';

export default function SubmissionsPage() {
  const { user } = useAdminAuth();
  const [status, setStatus] = useState('submitted');
  const [rows, setRows] = useState<Submission[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const operation = useRef<'load' | 'review' | null>(null);
  const finalizedIds = useRef(new Set<string>());
  const generation = useRef(0);
  const selected = rows.find(row => row.id === selectedId);
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
  const load = useCallback(async (after?: string, afterDecision = false) => {
    if (operation.current && !afterDecision) return;
    operation.current = 'load';
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
    } finally { if (current === generation.current) { operation.current = null; setBusy(false); } }
  }, [request, status]);
  useEffect(() => {
    const requestGeneration = generation;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); requestGeneration.current++; operation.current = null; };
  }, [load]);
  async function review(id: string, decision: 'approve' | 'reject') {
    const row = rows.find(value => value.id === id);
    if (operation.current || finalizedIds.current.has(id) || !row?.content || row.status !== 'submitted' || lockedIds.includes(id)) return;
    operation.current = 'review';
    const current = ++generation.current;
    setDecision({ id, action: decision });
    setBusy(true); setError('');
    try {
      const result = await reviewSubmission<Submission>({ id, decision,
        mutate: () => request(`/${encodeURIComponent(id)}/${decision}`, 'POST'),
        read: () => request(`/${encodeURIComponent(id)}`),
        lock: () => { if (current === generation.current) setLockedIds(previous => [...new Set([...previous, id])]); },
      });
      if (current !== generation.current) return;
      if (result.kind === 'success') {
        finalizedIds.current.add(id);
        setRows(previous => previous.map(row => row.id === id ? { ...row, ...result.receipt } : row));
        setSelectedId(null);
        await load(undefined, true);
      } else if (result.kind === 'conflict') {
        setRows(previous => previous.map(row => row.id === id ? result.submission : row));
        setLockedIds(previous => previous.filter(value => value !== id));
        setError(result.message);
      } else {
        // Read back an unconfirmed decision before permitting another mutation.
        setLockedIds(previous => [...new Set([...previous, id])]);
        setError(result.message);
      }
    } finally {
      if (current === generation.current) { operation.current = null; setBusy(false); }
      setDecision(null);
    }
  }
  return <div className="min-w-0 space-y-5 p-4 text-slate-200 sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-white">Product Submissions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Review Customer products before they enter the catalog. Open a submission to inspect its photo, details and variants.</p></div>
      <div className="flex items-center gap-2">
        <select aria-label="Review status" value={status} disabled={busy} onChange={event => { setSelectedId(null); setStatus(event.target.value); }} className="min-h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm focus-visible:ring-2 focus-visible:ring-indigo-400">
          <option value="submitted">Awaiting review</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <button type="button" disabled={busy} onClick={() => { void load(); }} className={reviewButtonClass + ' border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}><RefreshCw className={'h-4 w-4 ' + (busy ? 'animate-spin' : '')} aria-hidden="true" />Refresh</button>
      </div>
    </div>
    {error && !selected && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{error}</p>}
    {busy && !decision && <p role="status" className="text-xs text-slate-400">Loading submissions…</p>}
    {!busy && rows.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 p-10 text-center"><ClipboardList className="mx-auto mb-3 h-7 w-7 text-slate-500" aria-hidden="true" /><p className="text-sm font-medium text-slate-300">No submissions in this view.</p><p className="mt-1 text-xs text-slate-500">Choose another status or refresh to check for updates.</p></div>}
    <div className="grid gap-3 xl:grid-cols-2">{rows.map(row => <article key={row.id} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition-colors hover:border-slate-700">
      <div className="flex items-start gap-3"><SubmissionImage row={row} size="thumbnail" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start gap-2"><h2 className="min-w-0 flex-1 break-words text-sm font-semibold leading-5 text-white">{row.content?.name || 'Legacy submission'}</h2><ReviewStatus status={row.status} /></div>
          <p className="mt-1 truncate text-xs text-slate-400" title={row.content?.brand}>{row.content?.brand || 'No brand provided'}</p>
          <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500"><span className="text-slate-300">{row.content?.segment || '—'}</span><span className="break-words">{row.content?.category || 'Uncategorized'}</span></p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
        <div className="min-w-0 text-[11px] leading-5 text-slate-500"><p>{submittedDate(row.createdAt)}</p><p className="truncate">{row.content ? `${row.content.variants.length} variant${row.content.variants.length === 1 ? '' : 's'} · ${row.content.variants[0]?.size || row.content.variants[0]?.flavor || 'Details in review'}` : 'Operator resolution required'}</p></div>
        <button type="button" disabled={!!decision} onClick={() => setSelectedId(row.id)} aria-label={`Review ${row.content?.name || row.id}`} className={reviewButtonClass + ' bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20'}>Review<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
      </div>
      {lockedIds.includes(row.id) && <p className="mt-2 text-xs text-amber-200">Refresh required before another decision.</p>}
    </article>)}</div>
    {next && <button type="button" disabled={busy} onClick={() => { void load(next); }} className={reviewButtonClass + ' border border-slate-700 text-slate-200'}>Load more</button>}
    {selected && <SubmissionReviewDialog key={selected.id} row={selected} busy={busy} decision={decision} locked={lockedIds.includes(selected.id)} error={error}
      onClose={() => setSelectedId(null)} onReview={(id, action) => { void review(id, action); }} onRefresh={() => { void load(); }} />}
  </div>;
}
