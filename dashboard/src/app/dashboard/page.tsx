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
  X,
  ChevronDown,
  Lock,
  ShieldAlert
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/firebase/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type Category = "All" | "Hardware" | "Grocery" | "Pharmacy";
const PRICE_BUCKET_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"];

/* ── Custom Tooltip for Chart ── */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-2xl text-sm z-50">
        {label && <p className="text-slate-400 mb-1 font-medium">{label}</p>}
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
            {p.name ? `${p.name}: ` : ""}
            {typeof p.value === "number"
              ? p.name?.toLowerCase().includes("value") || p.dataKey === "value"
                ? `₱${p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : p.value.toLocaleString()
              : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const { appUser, loading, refreshUserDoc } = useAuth();
  const router = useRouter();
  
  const [activeKeysCount, setActiveKeysCount] = useState(0);
  const [todaysCalls, setTodaysCalls] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<"none" | "verifying" | "success" | "failed" | "delayed">("none");
  const [allProducts, setAllProducts] = useState<any[]>([]);
  // For Free users, initialise to their locked segment so the chart is scoped
  // immediately. For Pro users (or unresolved state), default to "All".
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");

  // Fetch all products for the chart preview
  useEffect(() => {
    if (!appUser) return;
    let isMounted = true;
    import("@/lib/firebase/products-service").then(({ getAllProducts }) => {
      getAllProducts().then(data => {
        if (isMounted) setAllProducts(data as any[]);
      });
    });
    return () => { isMounted = false; };
  }, [appUser]);

  const priceDistribution = useMemo(() => {
    const products = selectedCategory === "All" ? allProducts : allProducts.filter((p) => p.segment === selectedCategory);
    const buckets = [
      { range: "₱0–50", min: 0, max: 50, count: 0 },
      { range: "₱51–100", min: 51, max: 100, count: 0 },
      { range: "₱101–500", min: 101, max: 500, count: 0 },
      { range: "₱501–1k", min: 501, max: 1000, count: 0 },
      { range: "₱1k+", min: 1001, max: Infinity, count: 0 },
    ];
    products.forEach((p) => {
      const price = p.price || 0;
      const bucket = buckets.find((b) => price >= b.min && price <= b.max);
      if (bucket) bucket.count++;
    });
    return buckets.map((b, i) => ({
      range: b.range,
      count: b.count,
      fill: PRICE_BUCKET_COLORS[i],
    }));
  }, [allProducts, selectedCategory]);


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
    const userId = appUser?.uid || (appUser as any)?.id;
    if (!userId) return;

    // Fetch Active API Keys via REST API
    fetch(`http://localhost:5002/api/v1/api-keys?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.keys)) {
          setActiveKeysCount(data.keys.length);
        }
      })
      .catch(err => console.error('[Dashboard] Error fetching active keys:', err));

    // Telemetry stats not yet migrated to a user endpoint; mock as 0 for now.
    setTodaysCalls(0);

  }, [appUser?.uid, (appUser as any)?.id]);

  if (loading) {
    return (
      <div className="w-full px-6 lg:px-8 space-y-8 animate-pulse pb-10">
        <div className="h-10 w-48 bg-slate-800 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-32 bg-slate-800 rounded-xl"></div>
          <div className="h-32 bg-slate-800 rounded-xl"></div>
        </div>
        <div className="h-12 bg-slate-800 rounded-xl"></div>
        <div className="h-64 bg-slate-800 rounded-xl"></div>
      </div>
    );
  }

  const normalizedPlan = (appUser?.plan ?? "").toLowerCase();
  const isPro = normalizedPlan === "pro" || normalizedPlan === "professional" || normalizedPlan === "unlimited" || normalizedPlan === "enterprise";
  const isFreeUser = !isPro && normalizedPlan !== "";
  const missingSegment = isFreeUser && !appUser?.selectedSegment;

  // Keep selectedCategory in sync with the user's locked segment (runs once
  // after appUser loads). Pro users keep "All".
  const lockedSegment = isFreeUser ? (appUser?.selectedSegment ?? null) : null;
  // Sync once when appUser becomes available
  // (useState initialiser can't read appUser before auth resolves)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (lockedSegment) {
      setSelectedCategory(lockedSegment as Category);
    }
  // Only run when lockedSegment value changes (i.e. once after auth resolves)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedSegment]);

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

  /* ─── Access Gate: block dashboard entirely if Free user has no segment ─── */
  if (missingSegment) {
    return (
      <div className="w-full min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
        <div className="relative max-w-md w-full">
          {/* Glow backdrop */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent blur-xl pointer-events-none" />

          <div className="relative rounded-2xl border border-amber-500/25 bg-[#0d1526]/90 backdrop-blur-sm p-8 shadow-2xl flex flex-col items-center text-center gap-6">

            {/* Icon cluster */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShieldAlert className="w-9 h-9 text-amber-400" strokeWidth={1.5} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              </div>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Business Segment Required</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                You need to select a business segment to proceed to dashboard.
              </p>
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-slate-800" />

            {/* CTA */}
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold transition-all duration-200 shadow-lg shadow-amber-500/25 hover:shadow-amber-400/30 hover:scale-[1.02] active:scale-[0.98]"
            >
              Go to Settings
              <ArrowRight className="w-4 h-4" />
            </Link>

            <p className="text-xs text-slate-500">
              Contact support if you believe this is an error.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-6 lg:px-8 pb-12 animate-fadeIn flex flex-col gap-8">

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
            {isPro
              ? "Unlimited requests & segments"
              : appUser?.selectedSegment
              ? `Limited to 1 segment (${appUser.selectedSegment})`
              : "No segment selected — set one in Settings"}
          </p>
        </div>
        {!isPro && (
          <Link
            href="/dashboard/settings"
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold hover:underline transition-colors"
          >
            {appUser?.selectedSegment ? "Upgrade plan" : "Set up segment"}
          </Link>
        )}
      </div>

      {/* ─── Quick Actions ─── */}
      <div className="w-full">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Quick actions</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

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

      {/* ─── Reports & Price Distribution Chart ─── */}
      <div className="rounded-xl border border-slate-700/50 bg-[#0d1526] p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Reports & Price Distribution</h2>
            <p className="text-xs text-slate-400">Quick overview of your catalog's pricing</p>
          </div>
          {/* ── Category Filter ──────────────────────────────────────────────
               Free users: read-only badge locked to their segment.
               Pro users:  full dropdown with all categories.
          ──────────────────────────────────────────────────────────────────── */}
          {isFreeUser && lockedSegment ? (
            /* Read-only locked segment badge */
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 w-full sm:w-auto">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-slate-200">{lockedSegment}</span>
              <span className="ml-auto text-[10px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-widest">
                Locked
              </span>
            </div>
          ) : (
            /* Pro user: full dropdown */
            <div className="relative w-full sm:w-auto">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as Category)}
                className="w-full sm:w-48 appearance-none pl-4 pr-10 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700 text-sm font-medium text-slate-200 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 hover:bg-slate-700/80 hover:border-slate-600 transition-all cursor-pointer"
              >
                <option value="All">All Segment</option>
                <option value="Hardware">Hardware</option>
                <option value="Grocery">Grocery</option>
                <option value="Pharmacy">Pharmacy</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          )}
        </div>

        <div className="h-[300px] w-full">
          {allProducts.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-lg">
              <Loader2 className="w-6 h-6 text-slate-500 animate-spin mb-3" />
              <p className="text-sm text-slate-400">Loading catalog data...</p>
            </div>
          ) : priceDistribution.every(b => b.count === 0) ? (
            <div className="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-lg">
              <p className="text-sm text-slate-400">No products found for this category</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priceDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="count" name="Products" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {priceDistribution.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}
