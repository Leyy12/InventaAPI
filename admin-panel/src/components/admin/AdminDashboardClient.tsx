"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { auth, db } from "@/lib/firebase/config";
import { createTrafficRefresh, createTrafficRequest } from "@/lib/admin-traffic";
import { useAdminAuth } from "@/lib/firebase/admin-auth-context";
import { activeKeyHolders, reportTimestamp, telemetryReport, type ReportSelection, type ReportSource } from "@/lib/reports";
import CatalogReportPanel from "@/components/reports/CatalogReportPanel";

type Feed = "products" | "users" | "keys" | "telemetry" | "audit";
const initial: ReportSource = { status: "loading", records: [] };
function Reports({ user }: { user: User }) {
  const [selection, setSelection] = useState<ReportSelection>("All");
  const [sources, setSources] = useState<Record<Feed, ReportSource>>({ products: initial, users: initial, keys: initial, telemetry: initial, audit: initial });
  const trafficRefresh = useRef<ReturnType<typeof createTrafficRefresh> | null>(null);
  useEffect(() => {
    const current = () => auth.currentUser === user;
    const read = createTrafficRequest({
      base: process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "development" ? "http://localhost:5002" : ""),
      token: () => user.getIdToken(), current, fetcher: fetch,
    });
    const refresh = createTrafficRefresh(read, state => setSources(previous => ({ ...previous, telemetry: state })), { current });
    trafficRefresh.current = refresh;
    void Promise.resolve().then(() => refresh.refresh());
    return () => { refresh.stop(); if (trafficRefresh.current === refresh) trafficRefresh.current = null; };
  }, [user]);
  useEffect(() => {
    const feeds = {
      products: collection(db, "products"),
      users: collection(db, "users"),
      keys: collection(db, "api_keys"),
      audit: query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(20)),
    };
    const unsubscribers = (Object.keys(feeds) as (keyof typeof feeds)[]).map(name => onSnapshot(feeds[name],
      snapshot => setSources(previous => ({ ...previous, [name]: { status: "ready", records: snapshot.docs.map(doc => name === "keys"
        ? { status: doc.data().status, userId: doc.data().userId } : { ...doc.data(), id: doc.id }) } })),
      () => setSources(previous => ({ ...previous, [name]: { status: "error", records: [] } }))));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, []);
  const traffic = sources.telemetry.status === "ready" ? telemetryReport(sources.telemetry.records) : null;
  const holders = activeKeyHolders(sources.keys, sources.users);
  const users = sources.users.status === "ready" ? sources.users.records.filter(record =>
    typeof record.role === "string" && record.role.toLowerCase() !== "admin").length : null;
  const unavailable = (feed: Feed) => sources[feed].status === "loading" ? "Loading…" : "Unavailable";
  return <div className="w-full px-6 lg:px-8 pb-8 space-y-8">
    <h1 className="text-2xl font-bold text-white">Dashboard and reports</h1>
    <CatalogReportPanel source={sources.products} selection={selection} onSelection={setSelection} />
    <section aria-label="Global account and recorded traffic summaries" className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Global activity</h2>
      <p className="text-sm text-slate-400">Account, traffic and audit summaries are global; the catalog segment filter does not change them.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["Active key holders (active status)", holders ?? (sources.keys.status === "error" || sources.users.status === "error" ? "Unavailable" : "Loading…")],
          ["Customer account documents", users ?? unavailable("users")],
          ["Recorded requests in sample", traffic?.recorded ?? unavailable("telemetry")],
          ["Successful recorded outcomes", traffic?.successPercent == null ? "Unavailable" : traffic.successPercent.toFixed(1) + "%"],
          ["Average recorded latency", traffic?.averageLatency == null ? "Unavailable" : traffic.averageLatency.toFixed(1) + " ms"]]
          .map(([label, value]) => <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
            <p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>)}
      </div>
      <p className="text-xs text-slate-400">Active key holders counts distinct existing, non-disabled owners of keys marked active (legacy and v2). It is not a count of requests or a guarantee of credential validity/expiry.</p>
      {(["users", "keys"] as Feed[]).filter(feed => sources[feed].status === "error").map(feed =>
        <p key={feed} role="alert" className="text-rose-300">Unable to load {feed === "users" ? "account" : feed === "keys" ? "key-holder" : "traffic"} report data. Reload to retry.</p>)}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
        <h3 className="font-semibold text-white">Recorded API traffic</h3>
        <p className="mb-4 text-xs text-slate-400">Latest 500 stored telemetry records, grouped by UTC hour. This sample is not a complete daily total or uptime measurement. No prior-period comparison is available.</p>
        <p className="mb-3 text-xs text-slate-400">Global snapshot loaded on entry or manual refresh, not a real-time feed.</p>
        <button type="button" className="mb-3 rounded border border-slate-500 px-3 py-1 disabled:opacity-50" disabled={sources.telemetry.status === "loading"}
          onClick={() => { void trafficRefresh.current?.refresh(); }}>Refresh traffic</button>
        {sources.telemetry.status === "loading" ? <p role="status">Loading recorded traffic…</p> :
          sources.telemetry.status === "error" ? <p role="alert">Unable to load traffic. Refresh to retry; if access was removed, verify your Admin session.</p> :
          !traffic?.recorded ? <p role="status" className="text-slate-400">No valid recorded traffic available.</p> :
          <><p className="mb-3 text-xs text-slate-400">{traffic.outcomeSamples} recorded outcomes; {traffic.latencySamples} latency samples; {traffic.excluded} invalid timestamps excluded.</p>
            <ResponsiveContainer width="100%" height={250}><LineChart data={traffic.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8" }} />
              <Tooltip /><Line dataKey="count" name="Recorded requests" stroke="#3b82f6" dot={false} />
            </LineChart></ResponsiveContainer></>}
      </div>
    </section>
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5">
      <h2 className="mb-3 font-semibold text-white">Recent recorded audit events (global)</h2>
      {sources.audit.status === "loading" ? <p role="status">Loading audit events…</p> :
        sources.audit.status === "error" ? <p role="alert" className="text-rose-300">Unable to load audit events.</p> :
        !sources.audit.records.length ? <p role="status" className="text-slate-400">No recent audit events recorded.</p> :
        <ul className="max-h-56 space-y-2 overflow-y-auto text-sm text-slate-300">{sources.audit.records.map((record, index) =>
          <li key={String(record.id ?? index)}>{reportTimestamp(record.timestamp)?.toISOString() ?? "Time unavailable"} — {typeof record.action === "string" ? record.action : "Recorded event"}
            {typeof record.endpoint === "string" ? " [" + record.endpoint + "]" : ""} — {String(record.email || record.userEmail || record.userId || "System")}</li>)}</ul>}
    </section>
  </div>;
}
export default function AdminDashboardClient() {
  const { user, adminUser, loading } = useAdminAuth();
  if (loading) return <p role="status" className="p-6 text-slate-400">Loading your account…</p>;
  if (!user || !adminUser) return <p role="alert" className="p-6 text-slate-300">Admin account verification required.</p>;
  return <Reports key={user.uid} user={user} />;
}
