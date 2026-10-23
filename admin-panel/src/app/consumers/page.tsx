"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { collection, onSnapshot } from "@/lib/data/firestore-client";
import { db } from "@/lib/firebase/config";
import { useAccountEntitlements } from "@/lib/use-account-entitlements";
import { useAdminKeyInventory } from "@/lib/use-admin-key-inventory";
import { LinkedProducts, useLinkedProductNames } from "@/components/admin/LinkedProducts";
import { activeAccountProductCounts } from "@/lib/api-key-inventory";
import { InventoryPlanBadge, InventoryPlanUsage, InventoryTimeline } from "@/components/admin/InventoryDetails";

const KEYS_PER_PAGE = 25;
type OwnerRow = { id: string; businessName?: string; fullName?: string; email?: string };
export default function ConsumersPage() {
  const [usersMap, setUsersMap] = useState<Record<string, OwnerRow>>({});
  const [readError, setReadError] = useState(false);
  const [usersReady, setUsersReady] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [refreshVersion, setRefreshVersion] = useState(0);
  const { records: apiKeys, status: inventoryState } = useAdminKeyInventory(refreshVersion);
  const loading = !usersReady || inventoryState === 'loading';
  const { accounts: entitlements, status: entitlementState } = useAccountEntitlements(apiKeys.map(k => k.userId).filter(Boolean), JSON.stringify([usersMap, apiKeys]), refreshVersion, true);
  const productCounts = useMemo(() => activeAccountProductCounts(apiKeys), [apiKeys]);
  const linkedProducts = useLinkedProductNames(apiKeys);
  const displayState = inventoryState === 'refreshing' && entitlementState === 'ready' ? 'refreshing' : entitlementState;

  useEffect(() => {
    const unavailable = () => { setReadError(true); setUsersMap({}); };
    // Listener 1: Users collection — authoritative customer profile data
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const uMap: Record<string, OwnerRow> = {};
      snapshot.docs.forEach(doc => {
        uMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setUsersMap(uMap);
      setUsersReady(true);
    }, unavailable);

    return unsubUsers;
  }, []);

  const filteredKeys = useMemo(() => {
    const term = search.toLowerCase();
    return apiKeys.filter(k => {
      const user = usersMap[k.userId] || {};
      return (
        (k.name || "").toLowerCase().includes(term) ||
        (k.userEmail || "").toLowerCase().includes(term) ||
        (user.businessName || "").toLowerCase().includes(term) ||
        (user.fullName || "").toLowerCase().includes(term)
      );
    });
  }, [apiKeys, usersMap, search]);
  // 25 keys per page; a new search starts from the first page.
  useEffect(() => { setPage(0); }, [search]);
  const pageCount = Math.max(1, Math.ceil(filteredKeys.length / KEYS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * KEYS_PER_PAGE;
  const pageKeys = filteredKeys.slice(pageStart, pageStart + KEYS_PER_PAGE);

  if (readError) return <p role="alert" className="p-6 text-rose-300">API key inventory could not be verified. Reload to retry; previous rows have been cleared.</p>;
  if (inventoryState === 'unavailable') return <div role="alert" className="p-6 text-rose-300">
    <p>API key inventory could not be verified. Previous rows have been cleared.</p>
    <button type="button" onClick={() => setRefreshVersion(value => value + 1)} className="mt-3 text-sm text-indigo-300">Retry inventory</button>
  </div>;

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10 animate-fadeIn">
      <button type="button" disabled={loading || inventoryState === 'refreshing' || entitlementState === 'loading' || entitlementState === 'refreshing'} onClick={() => setRefreshVersion(value => value + 1)} className="text-sm text-indigo-300 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">{inventoryState === 'refreshing' || entitlementState === 'refreshing' ? 'Refreshing inventory…' : 'Refresh inventory & entitlements'}</button>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" />
            API Key Inventory
          </h1>
          <p className="text-slate-400">
            One row per key, including inactive keys, joined to its customer owner. This is not a downstream consumer registry. Account usage is shared across all of the owner&apos;s keys, not an allowance per row. Active is the stored key status, not proof of current account authorization or unexpired credentials.
          </p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden border border-white/5">
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center bg-slate-900/50 gap-4">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by key name, email, or business..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
          <div className="flex items-center gap-4 text-sm shrink-0">
            <span className="text-slate-400">
              Total: <span className="text-white font-bold">{loading ? '—' : apiKeys.length}</span>
            </span>
            <span className="text-emerald-400">
              Active: <span className="font-bold">{loading ? '—' : apiKeys.filter(k => k.status === 'active').length}</span>
            </span>
            <span className="text-red-400">
              Revoked: <span className="font-bold">{loading ? '—' : apiKeys.filter(k => k.status === 'revoked').length}</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer Info</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">API Key & Plan</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan Usage & Limits</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Linked Products</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Timeline</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mb-2" />
                    <p className="text-xs">Loading API key inventory...</p>
                  </td>
                </tr>
              ) : filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm">No API keys found.</p>
                  </td>
                </tr>
              ) : (
                pageKeys.map((k) => {
                  // Authoritative join: api_key.userId → users/{userId}
                  const user = usersMap[k.userId] || {};
                  const entitlement = entitlements[k.userId];

                  return (
                    <tr key={k.id} className="hover:bg-slate-800/30 transition-colors group">
                      {/* Customer Info — from users collection via userId */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 shrink-0 text-sm font-bold text-slate-300">
                            {(user.businessName || user.fullName || user.email || "?").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-200">
                              {user.businessName || user.fullName || "Unnamed Customer"}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {k.userEmail || user.email || "—"}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* API Key Name + Plan — using canonical 'name' field */}
                      <td className="p-4 align-top">
                        <div className="text-sm font-bold text-slate-200">{k.name || "Unnamed Key"}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <InventoryPlanBadge account={entitlement} state={displayState} />
                        </div>
                      </td>

                      {/* Current allowance is shared by the owner, including on historical rows. */}
                      <td className="p-4 align-top min-w-[160px]">
                        <InventoryPlanUsage account={entitlement} products={productCounts[k.userId] ?? 0} state={displayState} />
                        {entitlement?.holdUntil && <p className="mt-1 text-xs text-amber-300">Monthly activation hold until {entitlement.holdUntil}</p>}
                      </td>

                      {/* Linked Products */}
                      <td className="p-4 align-top">
                        <LinkedProducts link={k} {...linkedProducts} />
                      </td>

                      {/* Timeline */}
                      <td className="p-4 align-top">
                        <InventoryTimeline createdAt={k.createdAt} lastUsed={k.lastUsed} />
                      </td>

                      {/* Status */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5">
                          {k.status === "active" ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span className="text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                Active
                              </span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                              <span className="text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider bg-red-500/10 text-red-400 border-red-500/20">
                                {k.status || "Unknown"}
                              </span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && filteredKeys.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
            <p className="text-[11px] text-slate-500">
              Showing <span className="font-semibold text-slate-300">{pageStart + 1}–{pageStart + pageKeys.length}</span> of{" "}
              <span className="font-semibold text-slate-300">{filteredKeys.length}</span> keys
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}
                  className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800 disabled:opacity-40">Previous</button>
                <span>Page {currentPage + 1} of {pageCount}</span>
                <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1}
                  className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800 disabled:opacity-40">Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
