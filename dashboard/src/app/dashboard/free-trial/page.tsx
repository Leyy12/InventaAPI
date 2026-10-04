"use client";

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

type Trial = { eligible: boolean; active: boolean; exhausted: boolean; expired: boolean;
  hasUsedFreeTrial: boolean; upgradeRequired: boolean; endReason: 'expired' | 'exhausted' | null;
  status: string; startedAt: string | null; expiresAt: string | null;
  serverTime: string; secondsRemaining: number; productsIncluded: number; productsAvailable: number; activeKeys: number };

export default function FreeTrialPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  return user ? <TrialPanel key={user.uid} user={user} embedded={embedded} /> : null;
}

function TrialPanel({ user, embedded }: { user: User; embedded: boolean }) {
  const [result, setResult] = useState<{ uid: string; trial: Trial } | null>(null);
  const [error, setError] = useState('');
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

  return <div className="max-w-3xl mx-auto space-y-6">
    {!embedded && <h1 className="text-3xl font-bold text-white flex items-center gap-2"><Zap className="text-amber-400" />Free Trial</h1>}
    <p className="text-slate-400">Your one-time Free Trial starts automatically when your Customer session is verified. It lasts 7 days, includes 50–500 currently selected products and one active API key in your owned business segment. API calls do not consume this product allowance.</p>
    {error && <p role="alert" className="text-rose-300">{error} <button onClick={() => setRefresh(value => value + 1)}>Retry status</button></p>}
    {!trial ? <p role="status">Checking trial eligibility and usage…</p> :
      <section className="glass-card rounded-2xl border border-amber-500/30 p-8 space-y-4">
        <h2 className="text-xl text-white">{trial.status === 'paid' ? 'Paid subscription active'
          : trial.active ? 'Your Free Trial is Active!'
          : trial.upgradeRequired ? 'Free Trial Ended — Upgrade Required'
          : trial.eligible ? 'Session verification is required to start your Free Trial' : 'Trial is not available for this account'}</h2>
        {trial.expiresAt && <p>Expires: {new Date(trial.expiresAt).toUTCString()}</p>}
        {trial.active && <>
          <p>Products Included: {trial.productsIncluded} / 500 · Minimum Required: 50 · Products Available: {trial.productsAvailable}</p>
          <p>API Keys: {trial.activeKeys} / 1</p>
          <p>{Math.ceil(trial.secondsRemaining / 3600)} hours remaining as of {new Date(trial.serverTime).toUTCString()}.</p>
          <p className="text-sm text-slate-400">No daily or monthly reset. When the Trial ends, protected API access pauses until you upgrade to Pro or Pro Max.</p>
        </>}
        {trial.upgradeRequired && <>
          <p>{trial.endReason === 'exhausted' ? 'Previous Trial already consumed' : 'Seven-day Trial expired'}. Protected API access and Trial catalog changes are paused until you upgrade to Pro or Pro Max. Existing key records remain available and can work again after a valid paid upgrade.</p>
          <p>Trial already used. Your account and business segment remain available; this Trial cannot be activated again.</p>
          <Link className="inline-flex rounded-lg bg-indigo-600 px-5 py-3 text-white" href="/dashboard/plan-billing#upgrade">View upgrade options</Link>
        </>}
        {trial.status === 'paid' && trial.hasUsedFreeTrial && <p>One-time Trial already started. Paid entitlement currently controls API access.</p>}
        <div><Link className="text-cyan-400" href="/dashboard/api-keys">Manage API Keys →</Link></div>
      </section>}
  </div>;
}
