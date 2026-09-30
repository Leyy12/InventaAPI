"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/firebase/auth-context";

type Recommendation = {
  product: { id: string; name: string; category: string; segment: string };
  basis: "sales" | "catalog";
  rank: number;
  reason: string;
};
type Result = { recommendations: Recommendation[]; hasSalesData: boolean };
type State = { status: "loading" | "error" | "ready"; result: Result | null };

function AccountRecommendations({ user }: { user: { getIdToken: () => Promise<string> } }) {
  const [state, setState] = useState<State>({ status: "loading", result: null });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const token = await user.getIdToken();
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
        const response = await fetch(`${base}/api/v1/customer/insights/recommendations`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Recommendations unavailable.");
        const result = await response.json() as Result;
        if (!controller.signal.aborted) setState({ status: "ready", result });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", result: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [user]);

  if (state.status === "loading") return <p role="status" className="text-slate-300">Loading authorized recommendations…</p>;
  if (state.status === "error" || !state.result) return <p role="alert" className="text-rose-300">Recommendations could not be verified. Try again later.</p>;
  const { recommendations, hasSalesData } = state.result;
  return <div className="space-y-5">
    {!hasSalesData && <p role="status" className="text-slate-300">Recommendations become more tailored as your integration reports sales. Current suggestions are based on your authorized catalog.</p>}
    {recommendations.length === 0 ? <div className="glass-card rounded-xl border border-slate-700 p-6 space-y-2">
      <p className="text-slate-200">No eligible products are available for recommendations yet.</p>
      <Link href="/dashboard/products" className="text-indigo-300 underline">View your Product Catalog</Link>
    </div> : <ol className="grid gap-4 md:grid-cols-2">
      {recommendations.map(item => <li key={item.product.id} className="glass-card rounded-xl border border-slate-700 p-5 space-y-2">
        <p className="text-xs uppercase tracking-wide text-indigo-300">#{item.rank} · {item.basis === "sales" ? "Based on your recent sales" : "Based on your catalog"}</p>
        <h2 className="text-lg font-semibold text-white">{item.product.name}</h2>
        <p className="text-sm text-slate-400">{item.product.category} · {item.product.segment}</p>
        <p className="text-sm text-slate-200">{item.reason}</p>
      </li>)}
    </ol>}
    <Link href="/docs" className="text-sm text-indigo-300 underline">How to report completed sales</Link>
  </div>;
}

export default function RecommendationsPage() {
  const { user, appUser, loading, entitlement } = useAuth();
  return <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
    <h1 className="text-3xl font-bold text-white">Recommended Products</h1>
    <p className="text-slate-400">Deterministic suggestions from your authorized catalog and your own completed sales, when available.</p>
    {loading || !entitlement ? <p role="status">Verifying your session…</p> :
      !user || !appUser ? <p role="alert">Sign in to view your recommendations.</p> :
        <AccountRecommendations key={user.uid} user={user} />}
  </div>;
}
