"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Key, Webhook, Activity, Search } from "lucide-react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function SecurityCenterPage() {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "api_keys"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      setApiKeys(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching api keys:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredKeys = apiKeys.filter(k => 
    (k.keyName || "").toLowerCase().includes(search.toLowerCase()) || 
    (k.userId || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-indigo-500" />
            Security Center
          </h1>
          <p className="text-slate-400">Monitor active API keys, usage limits, and webhook security events.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <Webhook className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Webhook Endpoints</p>
            <p className="text-2xl font-bold text-white">Protected</p>
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden mt-8 border border-white/5">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by name or user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
          <h2 className="text-lg font-bold text-white">Active API Keys</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Key Name</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Owner / User ID</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Linked Products</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                  </td>
                </tr>
              ) : filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-500">No active keys found.</td>
                </tr>
              ) : (
                filteredKeys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4">
                      <span className="text-sm font-bold text-slate-200">{k.keyName || "Unnamed Key"}</span>
                      <p className="text-xs font-mono text-slate-500 mt-1">{k.key ? `***${k.key.slice(-4)}` : "N/A"}</p>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-slate-200">{k.userEmail || "No Email"}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-1">{k.userId || "Unknown"}</div>
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {k.linkedProductIds ? k.linkedProductIds.length : 0} items
                    </td>
                    <td className="p-4">
                      <span className={`text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider ${k.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
                        {k.status || 'active'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
