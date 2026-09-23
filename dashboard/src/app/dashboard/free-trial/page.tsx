"use client";

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

type Trial = { eligible: boolean; active: boolean; exhausted: boolean; expired: boolean;
  hasUsedFreeTrial: boolean; status: string; startedAt: string | null; expiresAt: string | null;
  serverTime: string; secondsRemaining: number; allowance: number; used: number; remaining: number };

export default function FreeTrialPage() {
  const { user } = useAuth();
  return user ? <TrialPanel key={user.uid} user={user} /> : null;
}

function TrialPanel({ user }: { user: User }) {
  const { refreshUserDoc } = useAuth();
  const [result, setResult] = useState<{ uid: string; trial: Trial } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const trial = result?.uid === user?.uid ? result?.trial : null;

  useEffect(() => {
    const lifecycle = generation;
    const request = ++lifecycle.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      setResult(null);
      const requestedAt = performance.now();
      try {
        const token = await user!.getIdToken();
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/free-trial/status`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Trial status unavailable.');
        if (generation.current !== request || controller.signal.aborted) return;
        const remaining = data.secondsRemaining * 1000 - (performance.now() - requestedAt);
        if (data.active && remaining <= 0) { timer = setTimeout(poll, 100); return; }
        setResult({ uid: user!.uid, trial: data }); setError('');
        // Refresh from server, including at the expiry boundary. Browser time is never authority.
        timer = setTimeout(poll, data.active ? Math.min(30000, Math.max(100, remaining)) : 30000);
      } catch {
        if (generation.current !== request || controller.signal.aborted) return;
        setResult(null); setError('Unable to verify trial status. Please retry.');
      }
    }
    void poll();
    return () => { lifecycle.current++; controller.abort(); clearTimeout(timer); };
  }, [user, refresh]);

  async function activate() {
    if (!user || busy || !trial?.eligible) return;
    const request = generation.current;
    setBusy(true); setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/free-trial/activate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Activation unavailable.');
      if (request !== generation.current) return;
      await refreshUserDoc();
      if (request !== generation.current) return;
      setResult(null); setRefresh(value => value + 1);
    } catch (failure) {
      if (request === generation.current) setError(failure instanceof Error ? failure.message : 'Activation unavailable.');
    } finally { if (request === generation.current) setBusy(false); }
  }

  return <div className="max-w-3xl mx-auto space-y-6">
    <h1 className="text-3xl font-bold text-white flex items-center gap-2"><Zap className="text-amber-400" />7-Day Pro Trial</h1>
    <p className="text-slate-400">One trial per Free account. Pro API features, 500 total requests shared by every key, until seven days or 500 requests, whichever comes first. Your owned business segment stays the same.</p>
    {error && <p role="alert" className="text-rose-300">{error} <button onClick={() => setRefresh(value => value + 1)}>Retry status</button></p>}
    {!trial ? <p role="status">Checking trial eligibility and usage…</p> :
      <section className="glass-card rounded-2xl border border-amber-500/30 p-8 space-y-4">
        <h2 className="text-xl text-white">{trial.exhausted ? 'Trial quota exhausted' : trial.active ? 'Your Free Trial is Active!'
          : trial.expired ? 'Your Free Trial has ended' : trial.eligible ? 'Activate your one-time trial'
          : trial.hasUsedFreeTrial ? 'Trial already used; current plan applies' : 'Trial is not available for this account'}</h2>
        {trial.expiresAt && <p>Expires: {new Date(trial.expiresAt).toUTCString()}</p>}
        {trial.active && <>
          <p>{trial.used} / 500 total API requests consumed · {trial.remaining} remaining</p>
          <p>{Math.ceil(trial.secondsRemaining / 3600)} hours remaining as of {new Date(trial.serverTime).toUTCString()}.</p>
          <p className="text-sm text-slate-400">No midnight reset. Expiry or exhaustion returns you to the existing Free monthly balance.</p>
        </>}
        {(trial.expired || trial.exhausted) && <p>Trial ended: {trial.used} / 500 total requests used. Normal Free monthly rules apply unless you have a paid subscription. Existing keys remain valid; the Free monthly balance is not reset.</p>}
        {trial.eligible && <button disabled={busy} onClick={activate} className="rounded-lg bg-indigo-600 px-5 py-3 disabled:opacity-50">{busy ? 'Activating…' : 'Activate 7-Day Trial'}</button>}
        <div><Link className="text-cyan-400" href="/dashboard/api-keys">Manage API Keys →</Link></div>
      </section>}
  </div>;
}
