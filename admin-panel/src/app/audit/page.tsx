"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, Search, Clock, User, FileText } from "lucide-react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // First try to fetch from an audit_logs collection
      const q = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(50));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        setLogs(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } else {
        // Fallback: fetch from transactions if audit_logs is empty
        const tq = query(collection(db, "transactions"), orderBy("createdAt", "desc"), limit(50));
        const tSnapshot = await getDocs(tq);
        setLogs(tSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          action: "PAYMENT_TRANSACTION", 
          userEmail: doc.data().customerEmail || "System", 
          details: `Amount: ${doc.data().amount || 0}`, 
          timestamp: doc.data().createdAt 
        })));
      }
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(l => 
    (l.action || "").toLowerCase().includes(search.toLowerCase()) || 
    (l.userEmail || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-indigo-500" />
            System Audit Logs
          </h1>
          <p className="text-slate-400">Track administrative actions, transactions, and system events.</p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden mt-8 border border-white/5">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search logs by action or user email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Timestamp</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                    <p className="text-xs">Loading logs...</p>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-500">
                    <FileText className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm">No audit logs found.</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <span className="text-sm">
                          {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-mono bg-slate-900 border border-slate-700 text-indigo-400 px-2 py-1 rounded">
                        {log.action || "UNKNOWN"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <User className="w-4 h-4 text-slate-500" />
                        <span className="text-sm">{log.userEmail || log.userId || "System"}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {log.details || JSON.stringify(log.metadata || {})}
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
