"use client";
import { formatTrialExpiry, trialCapacityMessage, trialRemainingSlots } from "@/lib/trial-display.mjs";
import { useEffect, useState } from "react";
import type { User } from "@/lib/supabase-auth";
import Link from "next/link";
import { apiKeyRequest } from "@/lib/api-keys";
import { useAuth } from "@/lib/supabase/auth-context";
import { quotaSummary, quotaVerificationKey } from "@/lib/reports";
import { createQuotaRefresh, type QuotaSource, type MonthlyUsage } from "@/lib/quota-refresh";
import { subscribeAccountUsage } from "@/lib/account-usage-events";
import { requestAllowanceLabel } from '@/config/plans';
import { useAccountRequestAllowance } from '@/lib/plan-request-policy';

function Usage({ user, upgradeRequired, activeTrial, requestAllowance }: { user: User; upgradeRequired: boolean; activeTrial: boolean; requestAllowance?: number | null }) {
  const [source, setSource] = useState<QuotaSource>({ status: "loading", count: null, usage: null });
  const [now, setNow] = useState(() => new Date());
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const refresh = createQuotaRefresh({ read: signal => apiKeyRequest(user, "", { signal }), onState: setSource });
    const unsubscribe = subscribeAccountUsage(user.uid, () => refresh.refresh());
    refresh.start();
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { unsubscribe(); refresh.stop(); clearInterval(clock); };
  }, [user, retry]);
  const retryControl = source.status === 'error' && <button type="button" className="text-indigo-300" onClick={() => setRetry(value => value + 1)}>Retry usage</button>;
  const summary = quotaSummary(source.usage, now);
  const quota = requestAllowance !== undefined && summary?.limit === requestAllowance ? summary : null;
  const trial = source.status === 'ready' ? source.trialCatalog : null;
  const unavailable = source.status === "loading" ? "Loading…" : "Unavailable";
  if (upgradeRequired) return <section aria-label="Account API usage" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-6 space-y-3">
    <h2 className="text-lg font-semibold text-amber-200">Free Trial Ended — Upgrade Required</h2>
    <p className="text-slate-200">Protected API access is paused until you upgrade to Pro or Pro Max. Your account and existing API keys remain available.</p>
    <p className="text-sm text-slate-300">Active API keys: {source.count ?? unavailable}</p>
    {source.status === 'error' && <p role="alert">Unable to load API-key history. {retryControl}</p>}
    <Link href="/dashboard/plan-billing#upgrade" className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-white">View paid plans</Link>
  </section>;
  if (trial) return <section aria-label="Free Trial catalog" className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[["Products", trial.productsIncluded.toLocaleString()],
        ["Remaining Slots", trialRemainingSlots(trial.productsIncluded).toLocaleString()],
        ["Active API Keys", trial.activeKeys.toLocaleString()]].map(([label, value]) =>
        <div key={label} className="rounded-xl border border-slate-700/50 bg-[#0d1526] p-6">
          <p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p>
        </div>)}
    </div>
    {trialCapacityMessage(trial.productsIncluded) && <p role="status" className="text-amber-300">{trialCapacityMessage(trial.productsIncluded)}</p>}
    {trial.expiresAt && <p className="text-sm leading-6 text-slate-300">Trial expires <time dateTime={trial.expiresAt}>{formatTrialExpiry(trial.expiresAt)}</time></p>}
    <p className="text-sm text-slate-300">Request allowance: {requestAllowanceLabel(requestAllowance, true)}.</p>
    {quota && quota.limit !== null && <p className="text-sm text-slate-400">{quota.used} used today (UTC); {quota.remaining} remaining. Resets at {quota.resetsAt}.</p>}
  </section>;
  if (activeTrial) return <p role={source.status === 'error' ? 'alert' : 'status'} className="text-slate-300">{source.status === 'error'
    ? 'Trial catalog verification unavailable.' : 'Loading Trial catalog…'} {retryControl}</p>;
  const monthly = source.status === 'ready' ? source.monthlyUsage : undefined;
  if (monthly) return <MonthlyUsageCards monthly={monthly} />;
  return <section aria-label="Account API usage" className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[["API keys (active status)", source.count ?? unavailable],
        ["Requests used today (UTC)", quota?.used ?? unavailable],
        ["Daily account limit", quota ? quota.limit === null ? "Unlimited" : quota.limit.toLocaleString() : unavailable],
        ["Remaining today", quota ? quota.pending ? "On hold" : quota.remaining === null ? "Unlimited" : quota.remaining.toLocaleString() : unavailable]]
        .map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700/50 bg-[#0d1526] p-6">
          <p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p>
        </div>)}
    </div>
    {source.status === "error" && <p role="alert" className="text-rose-300">Unable to load account usage. {retryControl}</p>}
    {source.status === "ready" && !quota && <p role="status" className="text-slate-400">Current quota unavailable; awaiting a fresh account summary.</p>}
    {quota?.pending && <p role="status" className="text-amber-300">Quota activation is on hold until {quota.resetsAt}. Prior usage is unavailable.</p>}
    {quota && !quota.pending && <p className="text-xs text-slate-400">Shared by all your keys. Resets at {quota.resetsAt}. {quota.percent === null ? "" : `${quota.percent.toFixed(1)}% used.`}</p>}
  </section>;
}
// Active Pro / Pro Max: requests used this month (one account allowance) and the
// products on the account's one API key.
function MonthlyUsageCards({ monthly }: { monthly: MonthlyUsage }) {
  const resets = new Date(monthly.resetsAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  const requests = monthly.buckets.find(item => item.bucket === 'account') ?? { used: 0, remaining: monthly.limit };
  const requestPercent = Math.min(100, (requests.used / monthly.limit) * 100);
  const products = monthly.products;
  const productPercent = products ? Math.min(100, (products.total / products.limit) * 100) : 0;
  const bar = (percent: number) => <div className="mt-3 h-1.5 rounded-full bg-slate-800" aria-hidden="true">
    <div className={`h-1.5 rounded-full ${percent >= 90 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${percent}%` }} />
  </div>;
  const card = 'rounded-xl border border-slate-700/50 bg-[#0d1526] p-6';
  const bySegment = products?.bySegment;
  const freeSlots = products ? Math.max(0, products.limit - products.total) : 0;
  // Pro: requests + one products card side by side. Pro Max: requests across the
  // full width, with the three segment cards aligned underneath in one grid.
  return <section aria-label="Account API usage" className="space-y-3">
    <div className={`grid grid-cols-1 gap-4 ${bySegment ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      <div className={`${card} ${bySegment ? 'sm:col-span-3' : ''}`}>
        <p className="text-sm text-slate-400">Requests this month</p>
        <p className="mt-3 text-2xl font-semibold text-white">{requests.used.toLocaleString()} <span className="text-sm font-normal text-slate-400">/ {monthly.limit.toLocaleString()}</span></p>
        {bar(requestPercent)}
        <p className="mt-2 text-xs text-slate-400">{requests.remaining.toLocaleString()} requests remaining</p>
      </div>
      {/* Pro: one products card (its key holds one segment). */}
      {products && !bySegment && <div className={card}>
        <p className="text-sm text-slate-400">Products on your API key</p>
        <p className="mt-3 text-2xl font-semibold text-white">{products.total.toLocaleString()} <span className="text-sm font-normal text-slate-400">/ {products.limit.toLocaleString()}</span></p>
        {bar(productPercent)}
        <p className="mt-2 text-xs text-slate-400">{freeSlots.toLocaleString()} more products can be added</p>
      </div>}
      {/* Pro Max: one card per segment. */}
      {products && bySegment && bySegment.map(item => {
        const percent = Math.min(100, (item.count / products.limit) * 100);
        return <div key={item.segment} className={card}>
          <p className="text-sm text-slate-400">{item.segment} products</p>
          <p className="mt-3 text-2xl font-semibold text-white">{item.count.toLocaleString()} <span className="text-sm font-normal text-slate-400">{item.count === 1 ? 'product' : 'products'} on your key</span></p>
          {bar(percent)}
          <p className="mt-2 text-xs text-slate-400">{freeSlots.toLocaleString()} more products can be added (any segment)</p>
        </div>;
      })}
    </div>
    {products && bySegment && <>
      <p className="text-xs text-slate-400">Your Pro Max API key holds {products.total.toLocaleString()} of {products.limit.toLocaleString()} products across all three segments.</p>
    </>}
    <p className="text-xs text-slate-400">Each API call counts as one request. {monthly.plan === 'pro' ? 'Pro' : 'Pro Max'} includes {monthly.limit.toLocaleString()} requests per month for your account; resets {resets} (UTC).</p>
  </section>;
}

export default function CustomerUsageSummary() {
  const { user, entitlement } = useAuth();
  const requestAllowance = useAccountRequestAllowance();
  // A verification timestamp alone is not an account-usage invalidation.
  const verification = quotaVerificationKey(user?.uid ?? null, entitlement ? { ...entitlement, serverTime: undefined } : null);
  return <div className="space-y-5">
    {!user ? <p role="alert">Sign in to view account usage.</p> : verification ? <Usage key={verification} user={user} upgradeRequired={entitlement?.subscription_status === 'upgrade_required'} activeTrial={entitlement?.activeTrial === true} requestAllowance={requestAllowance} />
      : <p role="status">Account usage unavailable while entitlement is being verified.</p>}
    <div className="rounded-xl border border-slate-700/50 bg-[#0d1526] p-5 flex justify-between gap-4">
      <p className="text-white">{entitlement?.subscription_status === 'upgrade_required' ? 'Upgrade Required · protected API access paused'
        : entitlement?.activeTrial ? 'Free Trial · Active'
        : entitlement ? `${entitlement.plan} plan · ${entitlement.subscription_status}` : "Plan verification unavailable"}</p>
      <Link href="/dashboard/settings" className="text-cyan-400 text-sm">Plan settings</Link>
    </div>
  </div>;
}
