"use client";

import { 
  Activity, 
  CreditCard, 
  Database, 
  Server, 
  ArrowUpRight, 
  ArrowRight,
  Code,
  Key,
  PackageSearch,
  Terminal,
  Zap,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/firebase/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function DashboardPage() {
  const { appUser, loading, refreshUserDoc } = useAuth();
  const router = useRouter();
  
  const [activeKeysCount, setActiveKeysCount] = useState(0);
  const [todaysCalls, setTodaysCalls] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<"none" | "verifying" | "success" | "failed" | "delayed">("none");


  // Handle PayMongo redirect result (?payment=success | ?payment=failed).
  // Runs once on mount; strips the param via history.replaceState so a refresh
  // does not re-show the banner, then verifies the Pro upgrade in Firestore.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("payment");
    if (status !== "success" && status !== "failed") return;

    window.history.replaceState({}, "", "/dashboard");

    if (status === "failed") {
      setPaymentStatus("failed");
      return;
    }

    setPaymentStatus("verifying");

    let cancelled = false;
    let tries = 0;

    const pollPlanStatus = async () => {
      if (cancelled) return;

      const fresh = await refreshUserDoc();

      // Case-insensitive plan check — webhook may write "pro" or "Pro"
      if (fresh && fresh.plan?.toLowerCase() === "pro") {
        setPaymentStatus("success");
        return;
      }

      tries += 1;
      if (tries < 10) {
        // Webhook delivery can lag a few seconds behind the redirect — keep polling.
        setTimeout(pollPlanStatus, 2000);
      } else if (!cancelled) {
        // Payment was confirmed by PayMongo but the Pro flag has not landed yet.
        // Usually happens in local dev where webhooks can't hit localhost.
        setPaymentStatus("delayed");
      }
    };

    pollPlanStatus();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!appUser?.uid) return;

    // Fetch Active API Keys
    const keysQ = query(
      collection(db, "api_keys"),
      where("userId", "==", appUser.uid),
      where("status", "==", "active")
    );
    const unsubKeys = onSnapshot(keysQ, (snap) => {
      setActiveKeysCount(snap.size);
    });

    // Fetch Today's Telemetry (API Calls)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const telemetryQ = query(
      collection(db, "api_telemetry"),
      where("userId", "==", appUser.uid),
      where("timestamp", ">=", startOfDay)
    );
    const unsubTelemetry = onSnapshot(telemetryQ, (snap) => {
      setTodaysCalls(snap.size);
    });

    return () => {
      unsubKeys();
      unsubTelemetry();
    };
  }, [appUser?.uid]);

  if (loading || (appUser?.plan === "Free" && !appUser?.selectedSegment)) {
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

  const isPro = appUser?.plan === "Pro";

  const paymentBanner =
    paymentStatus === "verifying" ? (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-5 py-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-300">Payment received — confirming your Pro upgrade...</p>
          <p className="text-xs text-amber-400/80 mt-0.5">
            Your Pro access should activate within a minute. The page will update automatically.
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
          <p className="text-sm font-semibold text-emerald-300">Payment successful — your Pro plan is now active!</p>
          <p className="text-xs text-emerald-400/80 mt-0.5">
            5,000 requests/day · GCash · Expires {appUser?.subscriptionExpiresAt ? new Date(appUser.subscriptionExpiresAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "in 30 days"}
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
            You were not charged and your plan was <strong>NOT</strong> upgraded. You can try subscribing again anytime.
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
            <p className="text-sm font-semibold text-blue-300">Payment received but upgrade is delayed</p>
            <p className="text-xs text-blue-400/80 mt-0.5">
              If you are testing locally, PayMongo webhooks cannot reach your localhost to upgrade your account.
              You must run the test script in your terminal to force the upgrade.
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

      {/* ─── Stat Cards Row ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Active API Keys — Primary metric, has cyan left accent */}
        <div className="relative rounded-xl border border-slate-700/50 bg-[#0d1526] overflow-hidden p-6">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-500/80"></div>
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-slate-400 font-medium">Active API keys</p>
            <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20 flex items-center gap-1.5 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block"></span> live
            </span>
          </div>
          <div className="text-5xl font-black text-white tracking-tight">{activeKeysCount}</div>
        </div>

        {/* API Calls Today */}
        <div className="relative rounded-xl border border-slate-700/50 bg-[#0d1526] overflow-hidden p-6">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-500/40"></div>
          <div className="flex items-start justify-between mb-4">
            <p className="text-sm text-slate-400 font-medium">API calls today</p>
          </div>
          <div className="text-5xl font-black text-white tracking-tight">{todaysCalls}</div>
        </div>

      </div>

      {/* ─── Plan Card (Full Width) ─── */}
      <div className="rounded-xl border border-slate-700/50 bg-[#0d1526] px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-white font-semibold text-sm">{isPro ? "Pro plan" : "Free plan"}</p>
          <p className="text-slate-500 text-xs mt-0.5">
            {isPro ? "Unlimited requests & segments" : `Limited to 1 segment (${appUser?.selectedSegment || "None"})`}
          </p>
        </div>
        {!isPro && (
          <Link
            href="/dashboard/settings"
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold hover:underline transition-colors"
          >
            Upgrade plan
          </Link>
        )}
      </div>

      {/* ─── Quick Actions & System Status ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Quick Actions (2/3 width) */}
        <div className="lg:col-span-2">
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

        {/* System Status (1/3 width) */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">System status</p>
          <div className="rounded-xl border border-slate-700/50 bg-[#0d1526] overflow-hidden divide-y divide-slate-800/60">

            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-slate-300 font-medium">API gateway</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">99.9%</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"></div>
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-slate-300 font-medium">Database sync</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">operational</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"></div>
              </div>
            </div>

            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-slate-300 font-medium">Auth service</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">operational</span>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"></div>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
