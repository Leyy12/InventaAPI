"use client";

import { useState, useEffect, useMemo } from "react";
import { Users, Search, Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function ConsumersPage() {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [usersReady, setUsersReady] = useState(false);
  const [keysReady, setKeysReady] = useState(false);
  const [search, setSearch] = useState("");

  const loading = !usersReady || !keysReady;

  useEffect(() => {
    // Listener 1: Users collection — authoritative customer profile data
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const uMap: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        uMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setUsersMap(uMap);
      setUsersReady(true);
    });

    // Listener 2: API Keys — one row per key, joined to user by userId
    const q = query(collection(db, "api_keys"), orderBy("createdAt", "desc"));
    const unsubKeys = onSnapshot(q, (snapshot) => {
      setApiKeys(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setKeysReady(true);
    });

    return () => {
      unsubUsers();
      unsubKeys();
    };
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

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" />
            API Consumers
          </h1>
          <p className="text-slate-400">
            Every row is an active API key joined to its authoritative customer profile. Updates in real-time.
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
              Total: <span className="text-white font-bold">{apiKeys.length}</span>
            </span>
            <span className="text-emerald-400">
              Active: <span className="font-bold">{apiKeys.filter(k => k.status === 'active').length}</span>
            </span>
            <span className="text-red-400">
              Revoked: <span className="font-bold">{apiKeys.filter(k => k.status !== 'active').length}</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer Info</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">API Key & Plan</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usage</th>
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
                    <p className="text-xs">Loading consumers...</p>
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
                filteredKeys.map((k) => {
                  // Authoritative join: api_key.userId → users/{userId}
                  const user = usersMap[k.userId] || {};
                  const usedPct = k.requestLimit
                    ? Math.min(100, ((k.requestsUsed || 0) / k.requestLimit) * 100)
                    : 0;
                  const isOverage = usedPct >= 80;

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
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                            {k.plan || "Free"}
                          </span>
                        </div>
                      </td>

                      {/* Usage with progress bar */}
                      <td className="p-4 align-top min-w-[160px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-400">Requests</span>
                          <span className={`text-xs font-bold ${isOverage ? 'text-red-400' : 'text-white'}`}>
                            {k.requestsUsed || 0} / {k.requestLimit ?? "∞"}
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full transition-all ${isOverage ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                        {k.requestLimit && (
                          <div className="text-[10px] text-slate-500 text-right mt-0.5">
                            {Math.max(0, (k.requestLimit || 0) - (k.requestsUsed || 0))} remaining
                          </div>
                        )}
                      </td>

                      {/* Linked Products */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-sm text-slate-300">
                            {k.linkedProductIds?.length ?? 0}
                          </span>
                        </div>
                        {k.linkedProductIds?.length > 0 && (
                          <p className="text-[10px] text-slate-600 mt-0.5">products linked</p>
                        )}
                      </td>

                      {/* Timeline */}
                      <td className="p-4 align-top text-xs text-slate-400 space-y-1">
                        <div>
                          <span className="text-slate-500">Created: </span>
                          {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "N/A"}
                        </div>
                        <div>
                          <span className="text-slate-500">Last Used: </span>
                          {k.lastUsed ? new Date(k.lastUsed).toLocaleString() : "Never"}
                        </div>
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
                                {k.status || "Revoked"}
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
      </div>
    </div>
  );
}
