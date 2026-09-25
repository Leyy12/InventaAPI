"use client";

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

type Trial = { eligible: boolean; active: boolean; exhausted: boolean; expired: boolean;
  hasUsedFreeTrial: boolean; upgradeRequired: boolean; endReason: 'expired' | 'exhausted' | null;
  status: string; startedAt: string | null; expiresAt: string | null;
  serverTime: string; secondsRemaining: number; allowance: number; used: number; remaining: number };

export default function FreeTrialPage() {
  const { user } = useAuth();
  return user ? <TrialPanel key={user.uid} user={user} /> : null;
}

function TrialPanel({ user }: { user: User }) {
  const { logout } = useAuth();
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
    let mayHaveRevoked = false;
    let logoutAttempted = false;
    try {
      const token = await user.getIdToken();
      // Once submitted, a lost response may conceal a successful revocation.
      // In that case we must leave the old browser session conservatively.
      mayHaveRevoked = true;
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/free-trial/activate`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok && response.status < 500 && data.reauthenticationRequired !== true) mayHaveRevoked = false;
      if (!response.ok) throw new Error(data.message || 'Activation unavailable.');
      if (data.reauthenticationRequired !== true) throw new Error('Unable to confirm session revocation.');
      if (request !== generation.current) return;
      logoutAttempted = true;
      const ended = await logout();
      if (!ended.ok) throw new Error('Trial activated, but automatic sign-out failed. Sign out manually and log in again.');
    } catch (failure) {
      if (request !== generation.current) return;
      if (mayHaveRevoked && !logoutAttempted) {
        window.alert('Trial activation could not be confirmed. Sign in again and check Trial status before retrying.');
        logoutAttempted = true;
        const ended = await logout();
        if (!ended.ok && request === generation.current) setError('Sign-out failed. Sign out manually and log in again before continuing.');
      } else setError(failure instanceof Error ? failure.message : 'Activation unavailable.');
    } finally { if (request === generation.current) setBusy(false); }
  }

  return <div className="max-w-3xl mx-auto space-y-6">
    <h1 className="text-3xl font-bold text-white flex items-center gap-2"><Zap className="text-amber-400" />7-Day Pro Trial</h1>
    <p className="text-slate-400">One trial per Free account. Pro API features, 500 total requests shared by every key, until seven days or 500 requests, whichever comes first. Your owned business segment stays the same.</p>
    {error && <p role="alert" className="text-rose-300">{error} <button onClick={() => setRefresh(value => value + 1)}>Retry status</button></p>}
    {!trial ? <p role="status">Checking trial eligibility and usage…</p> :
      <section className="glass-card rounded-2xl border border-amber-500/30 p-8 space-y-4">
        <h2 className="text-xl text-white">{trial.status === 'paid' ? 'Paid subscription active'
          : trial.active ? 'Your Free Trial is Active!'
          : trial.upgradeRequired ? 'Free Trial Ended — Upgrade Required'
          : trial.eligible ? 'Activate your one-time trial' : 'Trial is not available for this account'}</h2>
        {trial.expiresAt && <p>Expires: {new Date(trial.expiresAt).toUTCString()}</p>}
        {trial.active && <>
          <p>{trial.used} / 500 total API requests consumed · {trial.remaining} remaining</p>
          <p>{Math.ceil(trial.secondsRemaining / 3600)} hours remaining as of {new Date(trial.serverTime).toUTCString()}.</p>
          <p className="text-sm text-slate-400">No midnight reset. When the Trial ends, protected API access pauses until you upgrade to Pro.</p>
        </>}
        {trial.upgradeRequired && <>
          <p>{trial.endReason === 'exhausted' ? 'Trial quota exhausted' : 'Seven-day Trial expired'}: {trial.used} / 500 total requests used. Protected API access is paused until you upgrade to Pro. Existing key records remain available and can work again after a valid paid upgrade.</p>
          <p>Trial already used. Your account and business segment remain available; this Trial cannot be activated again.</p>
          <Link className="inline-flex rounded-lg bg-indigo-600 px-5 py-3 text-white" href="/dashboard/settings#subscription">Upgrade to Pro</Link>
        </>}
        {trial.status === 'paid' && trial.hasUsedFreeTrial && <p>Trial history: {trial.used} / 500 total requests used. Paid entitlement currently controls API access.</p>}
        {trial.eligible && <button disabled={busy} onClick={activate} className="rounded-lg bg-indigo-600 px-5 py-3 disabled:opacity-50">{busy ? 'Activating…' : 'Activate 7-Day Trial'}</button>}
        <div><Link className="text-cyan-400" href="/dashboard/api-keys">Manage API Keys →</Link></div>
      </section>}
  </div>;
}
