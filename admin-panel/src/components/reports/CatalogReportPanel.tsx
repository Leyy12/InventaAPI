"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { REPORT_SEGMENTS, reportSelection, reportView, type ReportSelection, type ReportSource } from "@/lib/reports";
import type { CategoryUsageState } from "@/lib/category-usage";

export default function CatalogReportPanel({ source, usage, selection, onSelection, restricted = false }: {
  source: ReportSource; usage: CategoryUsageState; selection: ReportSelection; onSelection: (value: ReportSelection) => void; restricted?: boolean;
}) {
  const { state, report } = reportView(source, selection);
  const used = usage.status === "ready" ? usage.segments[selection] ?? [] : null;
  const top = used?.slice(0, 8) ?? [];
  return <section className="space-y-5" aria-label="Catalog reports">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-xl font-semibold text-white">Catalog reports</h2>
        <p className="text-sm text-slate-400">The segment filter controls every product metric below. Published products only.</p></div>
      <label className="text-sm text-slate-300">Segment
        <select aria-label="Report segment" value={selection} onChange={event => {
          const next = reportSelection(event.target.value);
          if (next && (!restricted || next === selection)) onSelection(next);
        }} className="ml-3 rounded-lg border border-slate-700 bg-slate-900 p-2">
          {!restricted && <option value="All">All segments</option>}
          {REPORT_SEGMENTS.map(segment => <option key={segment} value={segment} disabled={restricted && segment !== selection}>{segment}</option>)}
        </select>
      </label>
    </div>
    {restricted && <p className="text-xs text-slate-400">Your account is limited to its selected segment.</p>}
    {state === "loading" && <p role="status" className="animate-pulse text-slate-400">Loading report data…</p>}
    {state === "error" && <p role="alert" className="text-rose-300">Unable to load report data. Reload to retry.</p>}
    {report && <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Published products", report.total.toLocaleString()],
          ["Categories in use", used ? used.length.toLocaleString() : usage.status === "error" ? "Unavailable" : "Loading…"],
          ["Most-used category", used ? used[0]?.name ?? "None yet" : usage.status === "error" ? "Unavailable" : "Loading…"]]
          .map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
            <p className="text-sm text-slate-400">{label}</p><p className="mt-2 truncate text-2xl font-semibold text-white" title={value}>{value}</p>
          </div>)}
      </div>
      {state === "empty" ? <p role="status" className="text-slate-400">No products found for {selection === "All" ? "the selected scope" : selection}.</p> :
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
            <h3 className="font-semibold text-white">Most-used product categories</h3>
            <p className="mb-4 text-xs text-slate-400">Customers whose active API keys include products from each category. Counts refresh when this page opens.</p>
            {usage.status === "loading" ? <p role="status" className="animate-pulse text-slate-400">Loading category usage…</p> :
              usage.status === "error" ? <p role="alert" className="text-rose-300">Unable to load category usage. Reload to retry.</p> :
              !top.length ? <p role="status" className="text-slate-400">No customer has picked products in this segment yet.</p> : <>
              <ResponsiveContainer width="100%" height={Math.max(160, top.length * 36)}><BarChart data={top} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "#94a3b8" }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip /><Bar dataKey="users" name="Customers using" fill="#6366f1" radius={[0, 5, 5, 0]} />
              </BarChart></ResponsiveContainer>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">{top.map(item => <li key={item.name} className="flex justify-between gap-4">
                <span>{item.name}</span><span className="text-slate-400">{item.users} {item.users === 1 ? "customer" : "customers"} · {item.products} {item.products === 1 ? "product" : "products"} picked</span></li>)}</ul></>}
          </div>
          <div className="flex flex-col rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
            <h3 className="mb-3 font-semibold text-white">Products by segment</h3>
            <ul className="space-y-1 text-sm text-slate-300">{report.segments.map(item => <li key={item.name} className="flex justify-between gap-4 rounded-md px-3 py-1"><span>{item.name}</span><span className="tabular-nums">{item.count}</span></li>)}</ul>
            <div className="mb-3 mt-6 flex items-baseline justify-between gap-3">
              <h3 className="font-semibold text-white">Products by category</h3>
              <span className="text-xs text-slate-500">{report.categories.length} {report.categories.length === 1 ? "category" : "categories"}{report.categories.length > 16 ? " · scroll for more" : ""}</span>
            </div>
            {/* Fills the rest of the card (no empty space below); scrolls with a hidden scroll bar. */}
            <div className="relative min-h-[16rem] flex-1">
              <ul aria-label="Products by category" className={`absolute inset-0 grid ${report.categories.length > 16 ? "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]" : ""} auto-rows-min content-start gap-x-6 gap-y-1 overflow-y-auto pb-6 text-sm text-slate-300 [scrollbar-width:none] sm:grid-cols-2 [&::-webkit-scrollbar]:hidden`}>
                {report.categories.map(item => <li key={item.name} className="flex min-w-0 justify-between gap-4 rounded-md px-3 py-1 hover:bg-white/5">
                  <span className="truncate" title={item.name}>{item.name}</span><span className="shrink-0 tabular-nums text-slate-400">{item.count}</span></li>)}
              </ul>
            </div>
          </div>
        </div>}
    </>}
  </section>;
}
