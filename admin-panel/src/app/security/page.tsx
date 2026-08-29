"use client";

import { useState, useEffect, useMemo } from "react";
import { ShieldCheck, Key, Activity, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function SecurityCenterPage() {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, any>>({});
  const [usersReady, setUsersReady] = useState(false);
  const [keysReady, setKeysReady] = useState(false);
  const [search, setSearch] = useState("");

  const loading = !usersReady || !keysReady;

  useEffect(() => {
    // Listener 1: Users — build lookup map by userId
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const uMap: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        uMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setUsersMap(uMap);
      setUsersReady(true);
    });

    // Listener 2: API Keys — ordered by creation date desc
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
        (user.fullName || "").toLowerCase().includes(term) ||
        (k.userId || "").toLowerCase().includes(term)
      );
    });
  }, [apiKeys, usersMap, search]);

  const activeCount = useMemo(() => apiKeys.filter(k => k.status === 'active').length, [apiKeys]);
  const revokedCount = useMemo(() => apiKeys.filter(k => k.status !== 'active').length, [apiKeys]);

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-500" />
            Security Center
          </h1>
          <p className="text-slate-400">Monitor all API keys, usage limits, and real-time security events.</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-6 border border-white/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Key className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Total API Keys</p>
            <p className="text-2xl font-bold text-white">{apiKeys.length}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-6 border border-white/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Active Keys</p>
            <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
          </div>
        </div>
        <div className="glass-card rounded-xl p-6 border border-white/5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-red-500/20 flex items-center justify-center border border-red-500/30">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Revoked Keys</p>
            <p className="text-2xl font-bold text-red-400">{revokedCount}</p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden mt-2 border border-white/5">
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center bg-slate-900/50 gap-4">
          <h2 className="text-lg font-bold text-white">API Keys Management</h2>
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, business..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">API Key Name</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer / Business</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Plan & Usage</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Linked Products</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Timeline</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                    <p className="text-xs">Loading security data...</p>
                  </td>
                </tr>
              ) : filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">No keys found.</td>
                </tr>
              ) : (
                filteredKeys.map((k) => {
                  // Authoritative user lookup by userId stored on the key
                  const user = usersMap[k.userId] || {};
                  const usedPct = k.requestLimit ? Math.min(100, ((k.requestsUsed || 0) / k.requestLimit) * 100) : 0;
                  return (
                    <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* API Key Name + masked secret */}
                      <td className="p-4 align-top">
                        <span className="text-sm font-bold text-slate-200">{k.name || "Unnamed Key"}</span>
                        <p className="text-xs font-mono text-slate-500 mt-1">
                          {k.key
                            ? k.key.startsWith('daas_')
                              ? `daas_··········${k.key.slice(-6)}`
                              : `···${k.key.slice(-6)}`
                            : "N/A"}
                        </p>
                      </td>

                      {/* Customer — joined from users collection via userId */}
                      <td className="p-4 align-top">
                        <div className="text-sm font-semibold text-slate-200">
                          {user.businessName || user.fullName || "—"}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {k.userEmail || user.email || "No email"}
                        </div>
                        <div className="text-[10px] text-slate-600 font-mono mt-1">{k.userId}</div>
                      </td>

                      {/* Plan & Usage bar */}
                      <td className="p-4 align-top min-w-[160px]">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                          {k.plan || "Free"}
                        </span>
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                            <span>{k.requestsUsed || 0} used</span>
                            <span>{k.requestLimit ?? "—"} limit</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                            <div
                              className={`h-full transition-all ${usedPct > 80 ? 'bg-red-500' : 'bg-emerald-500'}`}
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Linked Products */}
                      <td className="p-4 align-top">
                        <div className="flex items-center gap-1.5">
                          <Activity className="w-3 h-3 text-slate-500" />
                          <span className="text-sm text-slate-300">
                            {k.linkedProductIds?.length ?? 0} products
                          </span>
                        </div>
                      </td>

                      {/* Timeline */}
                      <td className="p-4 align-top text-xs text-slate-400 space-y-1">
                        <div>
                          <span className="text-slate-500">Created: </span>
                          {k.createdAt ? new Date(k.createdAt).toLocaleDateString() : 'N/A'}
                        </div>
                        <div>
                          <span className="text-slate-500">Last Used: </span>
                          {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : 'Never'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-4 align-top">
                        <span className={`text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider
                          ${k.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                          {k.status || 'active'}
                        </span>
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
