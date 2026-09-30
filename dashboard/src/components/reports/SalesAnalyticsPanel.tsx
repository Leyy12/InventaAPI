"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SaleReport = {
  hasData: boolean;
  currency: "PHP";
  range: { from: string; to: string };
  summary: { totalSales: number; totalTransactions: number; averageTransactionValue: number; unitsSold: number };
  timeSeries: { date: string; sales: number; transactions: number; units: number }[];
  topProducts: { productId: string; name: string; unitsSold: number; sales: number }[];
};
type ReportState = { status: "loading" | "error" | "ready"; data: SaleReport | null };
const pesos = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

export default function SalesAnalyticsPanel({ user }: { user: { getIdToken: () => Promise<string> } }) {
  const [state, setState] = useState<ReportState>({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const token = await user.getIdToken();
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
        const response = await fetch(`${base}/api/v1/customer/insights/sales-feed`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Sales report unavailable.");
        const data = await response.json() as SaleReport;
        if (!controller.signal.aborted) setState({ status: "ready", data });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error", data: null });
      }
    }
    void load();
    return () => controller.abort();
  }, [user]);

  if (state.status === "loading") return <p role="status" className="text-slate-300">Loading your sales report…</p>;
  if (state.status === "error" || !state.data) return <p role="alert" className="text-rose-300">Sales report could not be verified. Try again later.</p>;
  const report = state.data;
  if (!report.hasData) return <div className="glass-card rounded-xl border border-slate-700 p-6 space-y-2">
    <p role="status" className="text-slate-200">No sales data has been reported yet.</p>
    <p className="text-sm text-slate-400">Send completed sales through the documented integration endpoint to build this report.</p>
    <Link href="/docs" className="text-indigo-300 underline">View integration documentation</Link>
  </div>;
  const peak = Math.max(...report.timeSeries.map(row => row.sales), 1);
  return <div className="space-y-6">
    <p className="text-sm text-slate-400">Customer-owned completed sales, {report.range.from} through {report.range.to} (UTC).</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Total Sales", pesos(report.summary.totalSales)],
        ["Transactions", String(report.summary.totalTransactions)],
        ["Average Transaction Value", pesos(report.summary.averageTransactionValue)],
        ["Units Sold", String(report.summary.unitsSold)],
      ].map(([label, value]) => <div key={label} className="glass-card rounded-xl border border-slate-700 p-4">
        <p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p>
      </div>)}
    </div>
    <section className="glass-card rounded-xl border border-slate-700 p-5 space-y-3" aria-label="Sales over time">
      <h2 className="text-lg font-semibold text-white">Sales over time</h2>
      {report.timeSeries.map(row => <div key={row.date} className="grid grid-cols-[6rem_1fr_6rem] items-center gap-3 text-sm">
        <span className="text-slate-300">{row.date}</span>
        <div className="h-3 rounded bg-slate-800" aria-hidden="true"><div className="h-3 rounded bg-indigo-500" style={{ width: `${100 * row.sales / peak}%` }} /></div>
        <span className="text-right text-slate-200">{pesos(row.sales)}</span>
      </div>)}
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-5">
      <h2 className="text-lg font-semibold text-white mb-3">Top Products</h2>
      <ul className="space-y-2">{report.topProducts.map(row => <li key={row.productId} className="flex justify-between gap-4 text-sm border-b border-slate-800 pb-2">
        <span className="text-slate-200">{row.name} <span className="text-slate-400">({row.unitsSold} units)</span></span>
        <span className="text-white">{pesos(row.sales)}</span>
      </li>)}</ul>
    </section>
  </div>;
}
