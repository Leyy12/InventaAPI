"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { REPORT_SEGMENTS, reportSelection, reportView, type ReportSelection, type ReportSource } from "@/lib/reports";

export default function CatalogReportPanel({ source, selection, onSelection, restricted = false }: {
  source: ReportSource; selection: ReportSelection; onSelection: (value: ReportSelection) => void; restricted?: boolean;
}) {
  const { state, report } = reportView(source, selection);
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
        {[["Published products", report.total.toLocaleString()], ["Products with a valid price", report.priced.toLocaleString()],
          ["Average base price", report.averagePrice === null ? "Unavailable" : report.averagePrice.toLocaleString("en-PH", { style: "currency", currency: "PHP" })]]
          .map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
            <p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>)}
      </div>
      {state === "empty" ? <p role="status" className="text-slate-400">No products found for {selection === "All" ? "the selected scope" : selection}.</p> :
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
            <h3 className="font-semibold text-white">Price distribution</h3>
            <p className="mb-4 text-xs text-slate-400">One canonical base price per product (lowest valid variant price, with legacy fallback). {report.missingPrice} without a valid price excluded.</p>
            {report.priced === 0 ? <p role="status" className="text-slate-400">No valid prices available for this segment.</p> :
              <ResponsiveContainer width="100%" height={250}><BarChart data={report.distribution} margin={{ bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="range" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8" }} />
                <Tooltip /><Bar dataKey="count" name="Products" fill="#6366f1" radius={[5, 5, 0, 0]} />
              </BarChart></ResponsiveContainer>}
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
            <h3 className="mb-3 font-semibold text-white">Products by segment</h3>
            <ul className="space-y-2 text-sm text-slate-300">{report.segments.map(item => <li key={item.name} className="flex justify-between"><span>{item.name}</span><span>{item.count}</span></li>)}</ul>
            <h3 className="mb-3 mt-6 font-semibold text-white">Products by category</h3>
            <ul className="max-h-52 space-y-2 overflow-y-auto text-sm text-slate-300">{report.categories.map(item => <li key={item.name} className="flex justify-between gap-4"><span>{item.name}</span><span>{item.count}</span></li>)}</ul>
          </div>
        </div>}
    </>}
  </section>;
}
