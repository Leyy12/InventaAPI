"use client";

import { Database, Code, PackageSearch, Terminal, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/firebase/auth-context";
import { useEffect, useState } from "react";
import CustomerUsageSummary from "@/components/reports/CustomerUsageSummary";
import { customerReportScope } from "@/lib/reports";

export default function DashboardPage() {
  const { user, appUser, loading, refreshUserDoc } = useAuth();

  
  const [paymentStatus, setPaymentStatus] = useState<"none" | "verifying" | "success" | "failed" | "delayed">("none");


  // A redirect is only a hint to poll. Only an authenticated, order-specific
  // backend confirmation can show success; keep the order URL while delayed.
  useEffect(() => {
    if (loading || !user) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("payment");
    if (status !== "success" && status !== "failed") return;
    const orderId = params.get("order");
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const pollPlanStatus = async () => {
      if (cancelled) return;
      if (orderId) {
        try {
          const token = await user.getIdToken();
          const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
          const response = await fetch(`${base}/api/v1/checkout/subscription-status?orderId=${encodeURIComponent(orderId)}`, {
            headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          });
          const result = await response.json();
          if (cancelled) return;
          if (response.ok && result.paymentConfirmed === true) {
            setPaymentStatus("success");
            window.history.replaceState({}, "", "/dashboard");
            await refreshUserDoc();
            return;
          }
        } catch { /* No confirmation means no success claim. */ }
      }
      if (cancelled) return;
      tries += 1;
      if (orderId && tries < 10) {
        timer = setTimeout(pollPlanStatus, 2000);
      } else {
        setPaymentStatus("delayed");
      }
    };
    timer = setTimeout(() => {
      if (status === "failed") {
        setPaymentStatus("failed");
      } else {
        setPaymentStatus("verifying");
        void pollPlanStatus();
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, loading, refreshUserDoc]);



  if (loading) {
    return (
      <div className="w-full px-6 lg:px-8 space-y-8 animate-pulse pb-10">
        <div className="h-10 w-48 bg-slate-800 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 bg-slate-800 rounded-xl"></div>
          <div className="h-32 bg-slate-800 rounded-xl"></div>
          <div className="h-32 bg-slate-800 rounded-xl"></div>
        </div>
        <div className="h-64 bg-slate-800 rounded-xl"></div>
      </div>
    );
  }

  const needsPreference = customerReportScope(appUser?.plan, appUser?.selectedSegment).state === "preference_required";

  const paymentBanner =
    paymentStatus === "verifying" ? (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-5 py-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-300">Verifying payment and your Pro upgrade...</p>
          <p className="text-xs text-amber-400/80 mt-0.5">
            Waiting for secure payment confirmation. The page will update automatically.
          </p>
        </div>
        <button
          onClick={() => setPaymentStatus("none")}
          className="p-1.5 text-amber-400/70 hover:text-amber-200 rounded-lg hover:bg-amber-500/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    ) : paymentStatus === "success" ? (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-300">Payment confirmed. Your current subscription is shown below.</p>
          <p className="text-xs text-emerald-400/80 mt-0.5">
            Current allowance: {appUser?.apiRequestLimit === null ? 'Unlimited' : appUser?.apiRequestLimit?.toLocaleString() ?? 'Verifying'} requests/day · Subscription end: {appUser?.subscriptionExpiresAt ? new Date(appUser.subscriptionExpiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : 'Verifying'}
          </p>
        </div>
        <button
          onClick={() => setPaymentStatus("none")}
          className="p-1.5 text-emerald-400/70 hover:text-emerald-200 rounded-lg hover:bg-emerald-500/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    ) : paymentStatus === "failed" ? (
      <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-5 py-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rose-300">Payment was not completed.</p>
          <p className="text-xs text-rose-400/80 mt-0.5">
            This redirect does not confirm a charge or upgrade. Check your payment status before trying again.
          </p>
        </div>
        <button
          onClick={() => setPaymentStatus("none")}
          className="p-1.5 text-rose-400/70 hover:text-rose-200 rounded-lg hover:bg-rose-500/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    ) : paymentStatus === "delayed" ? (
      <div className="rounded-xl border border-blue-500/30 bg-blue-950/40 px-5 py-4 flex flex-col md:flex-row md:items-center gap-4 justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">Payment confirmation is still pending</p>
            <p className="text-xs text-blue-400/80 mt-0.5">
              We have not confirmed this purchase. Check again shortly or contact support before paying again.
            </p>
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          Check Again
        </button>
      </div>
    ) : null;

  return (
    <div className="w-full px-6 lg:px-8 pb-12 animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* ─── Payment Status Banner (from PayMongo redirect) ─── */}
      {paymentBanner}

      {/* ─── Header ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
          Welcome back, {appUser?.fullName?.split(" ")[0] || "Developer"}
        </h1>
        <p className="text-slate-400 text-sm">Here&apos;s what&apos;s happening with your InventaAPI projects today.</p>
      </div>

      <CustomerUsageSummary />
      {needsPreference && <p role="status" className="text-slate-300">Your account has no valid segment preference. Catalog reports require a confirmed segment; contact support. Your dashboard remains available.</p>}

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-8">

        {/* Quick Actions (2/3 width) */}
        <div className="w-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Quick actions</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            <Link
              href="/dashboard/api-keys"
              className="flex items-center gap-4 rounded-xl border border-slate-700/50 bg-[#0d1526] px-5 py-4 hover:border-cyan-500/30 hover:bg-[#101c30] transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                <Code className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">Manage API keys</p>
                <p className="text-xs text-slate-500 mt-0.5">Generate or view keys</p>
              </div>
            </Link>

            <Link
              href="/dashboard/products"
              className="flex items-center gap-4 rounded-xl border border-slate-700/50 bg-[#0d1526] px-5 py-4 hover:border-cyan-500/30 hover:bg-[#101c30] transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                <PackageSearch className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">Browse catalog</p>
                <p className="text-xs text-slate-500 mt-0.5">Search product data</p>
              </div>
            </Link>

            <Link
              href="/dashboard/api-playground"
              className="flex items-center gap-4 rounded-xl border border-slate-700/50 bg-[#0d1526] px-5 py-4 hover:border-cyan-500/30 hover:bg-[#101c30] transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                <Terminal className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">API playground</p>
                <p className="text-xs text-slate-500 mt-0.5">Test before you build</p>
              </div>
            </Link>

            <Link
              href="/docs"
              className="flex items-center gap-4 rounded-xl border border-slate-700/50 bg-[#0d1526] px-5 py-4 hover:border-cyan-500/30 hover:bg-[#101c30] transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0 text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/30 transition-colors">
                <Database className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">Documentation</p>
                <p className="text-xs text-slate-500 mt-0.5">Integration guides</p>
              </div>
            </Link>

          </div>
        </div>


      </div>

    </div>
  );
}
