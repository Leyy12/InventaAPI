"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/firebase/auth-context";
import { reconcileReportSession, type ReportSession, type ReportSelection, type ReportSource } from "@/lib/reports";
import CatalogReportPanel from "@/components/reports/CatalogReportPanel";
import SalesAnalyticsPanel from "@/components/reports/SalesAnalyticsPanel";
import Link from "next/link";

function CatalogDataset({ session, onSelection }: { session: ReportSession; onSelection: (value: ReportSelection) => void }) {
  const [source, setSource] = useState<ReportSource>({ status: "loading", records: [] });
  useEffect(() => onSnapshot(collection(db, "products"),
    snapshot => setSource({ status: "ready", records: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) }),
    () => setSource({ status: "error", records: [] })), []);
  // Retain the existing public-catalog listener, but hide data while unverified.
  if (!session.scope.segment) return null;
  return <CatalogReportPanel source={source} selection={session.selection} onSelection={onSelection} restricted={session.scope.restricted} />;
}
function AccountReports({ uid, plan, preference }: { uid: string; plan: unknown; preference: unknown }) {
  const [stored, setStored] = useState(() => reconcileReportSession(null, uid, plan, preference));
  const session = reconcileReportSession(stored, uid, plan, preference);
  // Reconcile before children render: no effect-time stale All frame on downgrade.
  if (session !== stored) setStored(session);
  return <>
    {session.scope.state === "preference_required" && <p role="status" className="text-slate-300">Your account has no valid segment preference. Contact support to confirm your catalog segment. No preference has been changed.</p>}
    {session.scope.state === "unavailable" && <p role="status" className="text-slate-300">Your account entitlement is unavailable. Reports will appear after verification.</p>}
    {session.loadCatalog && <CatalogDataset session={session} onSelection={selection => {
      if (session.scope.segment && (!session.scope.restricted || selection === session.scope.segment)) setStored({ ...session, selection });
    }} />}
  </>;
}
export default function AnalyticsPage() {
  const { user, appUser, entitlement, loading } = useAuth();
  const [tab, setTab] = useState<"usage" | "sales">("usage");
  const paid = !!entitlement && !entitlement.activeTrial && entitlement.subscription_status === "active"
    && ["Pro", "Pro Max", "Enterprise", "Unlimited"].includes(entitlement.plan);
  return <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
    <h1 className="text-3xl font-bold text-white">Analytics</h1>
    <div role="tablist" aria-label="Analytics views" className="flex gap-2">
      <button role="tab" aria-selected={tab === "usage"} onClick={() => setTab("usage")}
        className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200">API Usage &amp; Catalog</button>
      <button role="tab" aria-selected={tab === "sales"} onClick={() => setTab("sales")}
        className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200">Sales Analytics</button>
    </div>
    {loading ? <p role="status">Loading your account…</p> :
      !user || !appUser ? <p role="alert">Unable to load your account. Sign in again to view reports.</p> :
      tab === "usage" ? <AccountReports key={user.uid} uid={user.uid} plan={entitlement?.plan} preference={appUser.selectedSegment} /> :
      paid ? <SalesAnalyticsPanel key={user.uid} user={user} /> :
        <p role="status" className="text-slate-300">Sales Analytics is available with an active Pro or Pro Max subscription. <Link href="/dashboard/settings" className="text-indigo-300 underline">View plans</Link>.</p>}
  </div>;
}
