"use client";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import Link from "next/link";
import { apiKeyRequest } from "@/lib/api-keys";
import { useAuth } from "@/lib/firebase/auth-context";
import { quotaSummary, quotaVerificationKey } from "@/lib/reports";
import { createQuotaRefresh, type QuotaSource } from "@/lib/quota-refresh";

function Usage({ user }: { user: User }) {
  const [source, setSource] = useState<QuotaSource>({ status: "loading", count: null, usage: null });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = createQuotaRefresh({ read: signal => apiKeyRequest(user, "", { signal }), onState: setSource });
    refresh.start();
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { refresh.stop(); clearInterval(clock); };
  }, [user]);
  const quota = quotaSummary(source.usage, now);
  const unavailable = source.status === "loading" ? "Loading…" : "Unavailable";
  return <section aria-label="Account API usage" className="space-y-3">
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[["API keys (active status)", source.count ?? unavailable],
        [quota?.period === 'trial' ? "Requests used during trial" : quota?.period === 'monthly' ? "Requests used this month (UTC)" : "Requests used today (UTC)", quota?.used ?? unavailable],
        [quota?.period === 'trial' ? "Total trial allowance" : quota?.period === 'monthly' ? "Monthly account limit" : "Daily account limit", quota ? quota.limit === null ? "Unlimited" : quota.limit.toLocaleString() : unavailable],
        [quota?.period === 'trial' ? "Remaining during trial" : quota?.period === 'monthly' ? "Remaining this month" : "Remaining today", quota ? quota.pending ? "On hold" : quota.remaining === null ? "Unlimited" : quota.remaining.toLocaleString() : unavailable]]
        .map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700/50 bg-[#0d1526] p-6">
          <p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p>
        </div>)}
    </div>
    {source.status === "error" && <p role="alert" className="text-rose-300">Unable to load account usage. Retrying automatically.</p>}
    {source.status === "ready" && !quota && <p role="status" className="text-slate-400">Current quota unavailable; awaiting a fresh account summary.</p>}
    {quota?.pending && <p role="status" className="text-amber-300">Quota activation is on hold until {quota.resetsAt}. Prior usage is unavailable.</p>}
    {quota && !quota.pending && <p className="text-xs text-slate-400">Shared by all your keys. {quota.period === 'trial' ? 'Trial ends at' : 'Resets at'} {quota.resetsAt}. {quota.period === 'trial' && 'No daily reset.'} {quota.percent === null ? "" : `${quota.percent.toFixed(1)}% used.`}</p>}
  </section>;
}
export default function CustomerUsageSummary() {
  const { user, entitlement } = useAuth();
  const verification = quotaVerificationKey(user?.uid ?? null, entitlement ? { ...entitlement } : null);
  return <div className="space-y-5">
    {!user ? <p role="alert">Sign in to view account usage.</p> : verification ? <Usage key={verification} user={user} />
      : <p role="status">Account usage unavailable while entitlement is being verified.</p>}
    <div className="rounded-xl border border-slate-700/50 bg-[#0d1526] p-5 flex justify-between gap-4">
      <p className="text-white">{entitlement ? `${entitlement.plan} plan · ${entitlement.subscription_status}` : "Plan verification unavailable"}</p>
      <Link href="/dashboard/settings" className="text-cyan-400 text-sm">Plan settings</Link>
    </div>
  </div>;
}
