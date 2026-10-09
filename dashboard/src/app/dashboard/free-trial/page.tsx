"use client";

import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeAccountUsage } from '@/lib/account-usage-events';
import { formatTrialExpiry, trialCapacityMessage, trialRemainingSlots } from '@/lib/trial-display.mjs';
import { TRIAL_MAX_PRODUCTS } from '../../../../../functions/entitlement-limits.mjs';

type Trial = { eligible: boolean; active: boolean; exhausted: boolean; expired: boolean;
  hasUsedFreeTrial: boolean; upgradeRequired: boolean; endReason: 'expired' | 'exhausted' | null;
  status: string; startedAt: string | null; expiresAt: string | null;
  serverTime: string; secondsRemaining: number; productsIncluded: number; minimumProducts: number;
  maximumProducts: number; productsAvailable: number; activeKeys: number; maximumActiveKeys: number };

export default function FreeTrialPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  return user ? <TrialPanel key={user.uid} user={user} embedded={embedded} /> : null;
}

function TrialPanel({ user, embedded }: { user: User; embedded: boolean }) {
  const [result, setResult] = useState<{ uid: string; trial: Trial; receivedAt: number } | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [clockNow, setClockNow] = useState(0);
  const generation = useRef(0);
  const snapshot = result?.uid === user?.uid ? result : null;
  const trial = snapshot?.trial ?? null;
  const activeTrial = trial?.active === true;

  useEffect(() => {
    if (!activeTrial) return;
    const clock = setInterval(() => setClockNow(performance.now()), 1000);
    return () => clearInterval(clock);
  }, [activeTrial]);

  useEffect(() => subscribeAccountUsage(user.uid, () => setRefresh(value => value + 1)), [user.uid]);

  useEffect(() => {
    const lifecycle = generation;
    const request = ++lifecycle.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function readStatus() {
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
        if (data.active && (!Number.isFinite(remaining) || remaining <= 0)) throw new Error('Trial verification expired.');
        const receivedAt = performance.now();
        setClockNow(receivedAt);
        setResult({ uid: user!.uid, trial: { ...data, secondsRemaining: Math.max(0, remaining / 1000) }, receivedAt }); setError('');
        // One server-derived expiry check, not generic background polling.
        // Status can also be refreshed explicitly or after a catalog/key mutation.
        if (data.active) timer = setTimeout(() => { void readStatus(); }, remaining);
      } catch {
        if (generation.current !== request || controller.signal.aborted) return;
        setResult(null); setError('Unable to verify trial status. Please retry.');
      }
    }
    void readStatus();
    return () => { lifecycle.current++; controller.abort(); clearTimeout(timer); };
  }, [user, refresh]);

  if (embedded) {
    if (error) return <section aria-label="Free Trial status" className="rounded-2xl border border-rose-400/25 bg-[#0d1526] p-5 sm:p-7">
      <p role="alert" className="text-sm text-rose-200">Unable to verify Trial status. Please retry.</p>
      <button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-4 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">Retry status</button>
    </section>;
    if (!trial) return <section aria-label="Free Trial status" className="rounded-2xl border border-slate-700/80 bg-[#0d1526] p-5 sm:p-7">
      <p role="status" className="text-sm text-slate-300">Verifying your Free Trial details…</p>
    </section>;
    if (!trial.active) return <section aria-label="Free Trial status" className="rounded-2xl border border-amber-500/25 bg-[#0d1526] p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">Free Trial</p>
          <h2 className="mt-2 text-xl font-bold text-white">{trial.upgradeRequired ? 'Trial ended' : trial.eligible ? 'Trial status pending' : 'Trial unavailable'}</h2></div>
        {trial.upgradeRequired && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">UPGRADE REQUIRED</span>}
      </div>
      {trial.upgradeRequired && <p className="mt-4 text-sm leading-6 text-slate-300">{trial.endReason === 'exhausted' ? 'The Trial allowance has been used.' : 'The seven-day Trial period has ended.'} Protected API access remains paused until you choose an eligible paid plan.</p>}
      {trial.expiresAt && <p className="mt-4 text-sm text-slate-400">Trial ended <time dateTime={trial.expiresAt}>{formatTrialExpiry(trial.expiresAt)}</time>.</p>}
    </section>;

    const remainingSeconds = Math.max(0, trial.secondsRemaining - ((clockNow - snapshot!.receivedAt) / 1000));
    const totalSeconds = trial.startedAt && trial.expiresAt
      ? (Date.parse(trial.expiresAt) - Date.parse(trial.startedAt)) / 1000 : NaN;
    const remainingPercent = Number.isFinite(totalSeconds) && totalSeconds > 0
      ? Math.min(100, Math.max(0, Math.round(remainingSeconds / totalSeconds * 100))) : 0;
    const totalHours = Math.ceil(remainingSeconds / 3600);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const remainingLabel = days > 0 ? hours > 0 ? `${days}d ${hours}h` : `${days}d`
      : totalHours > 0 ? `${totalHours}h` : 'Less than 1h';
    const expiryLabel = formatTrialExpiry(trial.expiresAt);
    const metrics = [
      { label: 'PRODUCTS', value: trial.productsIncluded.toLocaleString(), detail: 'Account-level allowance' },
      { label: 'REMAINING SLOTS', value: trialRemainingSlots(trial.productsIncluded).toLocaleString(), detail: 'Available in your account' },
      { label: 'ACTIVE API KEYS', value: trial.activeKeys.toLocaleString(), detail: 'Free Trial limit' },
      { label: 'TIME REMAINING', value: remainingLabel, detail: 'Based on verified Trial dates' },
    ];
    return <section aria-label="Current plan: Free Trial" className="rounded-2xl border border-indigo-400/25 bg-[#0d1526] p-5 shadow-lg shadow-indigo-950/20 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-indigo-200">Free Trial</p>
          <h2 className="mt-2 text-2xl font-bold text-white">7-Day Free Trial</h2>
          <p className="mt-2 text-sm text-slate-300">Trial ends <time dateTime={trial.expiresAt ?? undefined}>{expiryLabel}</time></p>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-200">ACTIVE</span>
      </div>

      {Number.isFinite(totalSeconds) && totalSeconds > 0 && <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-400"><span>Time remaining</span><span>{remainingPercent}%</span></div>
        <div role="progressbar" aria-label="Trial time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={remainingPercent} aria-valuetext={`${remainingLabel} remaining`}
          className="h-2.5 overflow-hidden rounded-full bg-slate-700/80">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-400 transition-[width] duration-500" style={{ width: `${remainingPercent}%` }} />
        </div>
      </div>}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => <div key={metric.label} className="rounded-xl border border-slate-700/80 bg-slate-950/35 p-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-slate-400">{metric.label}</p>
          <p className="mt-2 text-xl font-bold text-white">{metric.value}</p>
          <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
        </div>)}
      </div>

      {trialCapacityMessage(trial.productsIncluded) && <p role="status" className="mt-4 text-sm text-amber-300">{trialCapacityMessage(trial.productsIncluded)}</p>}
      <p className="mt-3 text-xs leading-5 text-slate-400">Your one-time 7-day Free Trial includes up to {TRIAL_MAX_PRODUCTS} account-level products and 1 active API key. API requests do not reduce your product allowance, and unused product slots do not increase the API-key limit.</p>
    </section>;
  }

  return <div className="max-w-3xl mx-auto space-y-6">
    {!embedded && <h1 className="text-3xl font-bold text-white flex items-center gap-2"><Zap className="text-amber-400" />Free Trial</h1>}
    <p className="text-slate-400">Your one-time Free Trial starts automatically when your Customer session is verified. It lasts 7 days, includes up to 50 currently selected products and one active API key in your owned business segment. API calls do not consume this product allowance.</p>
    {error && <p role="alert" className="text-rose-300">{error} <button onClick={() => setRefresh(value => value + 1)}>Retry status</button></p>}
    {!trial ? <p role="status">Checking trial eligibility and usage…</p> :
      <section className="glass-card rounded-2xl border border-amber-500/30 p-8 space-y-4">
        <h2 className="text-xl text-white">{trial.status === 'paid' ? 'Paid subscription active'
          : trial.active ? 'Your Free Trial is Active!'
          : trial.upgradeRequired ? 'Free Trial Ended — Upgrade Required'
          : trial.eligible ? 'Session verification is required to start your Free Trial' : 'Trial is not available for this account'}</h2>
        {trial.expiresAt && <p>Trial expires: <time dateTime={trial.expiresAt}>{formatTrialExpiry(trial.expiresAt)}</time></p>}
        {trial.active && <>
          <p>Products: {trial.productsIncluded.toLocaleString()} of {TRIAL_MAX_PRODUCTS} · Remaining slots: {trialRemainingSlots(trial.productsIncluded).toLocaleString()}</p>
          <p>Active API keys: {trial.activeKeys} of 1</p>
          <p>{Math.ceil(trial.secondsRemaining / 3600)} hours remaining.</p>
          {trialCapacityMessage(trial.productsIncluded) && <p role="status">{trialCapacityMessage(trial.productsIncluded)}</p>}
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
