"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, Search, Clock, User, FileText } from "lucide-react";
import { collection, getDocs, query, orderBy, limit, where } from "@/lib/data/data-client";
import { db } from "@/lib/supabase/config";
import { auditAction, auditActor, auditDetails, auditMatches, auditTimestamp, type AuditLogRecord } from "@/lib/audit-log-display";

const LOGS_PER_PAGE = 50;
// Where a page starts: logs at or before `at`, minus the ones with exactly that time
// already shown on the previous page (several logs can share one timestamp).
type PageStart = { at: unknown; shown: string[] } | null;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // starts[i] is where page i begins; page 0 is the newest logs.
  const [starts, setStarts] = useState<PageStart[]>([null]);
  const [page, setPage] = useState(0);
  const [nextStart, setNextStart] = useState<PageStart>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void fetchLogs(starts[page] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fetchLogs = async (start: PageStart) => {
    setLoading(true); setLoadError(false);
    try {
      const extra = start ? start.shown.length : 0;
      const q = start
        ? query(collection(db, "audit_logs"), where("timestamp", "<=", start.at), orderBy("timestamp", "desc"), limit(LOGS_PER_PAGE + extra + 1))
        : query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(LOGS_PER_PAGE + 1));
      const querySnapshot = await getDocs(q);
      const skip = new Set(start?.shown ?? []);
      const rows: AuditLogRecord[] = querySnapshot.docs.filter(doc => !skip.has(doc.id)).map(doc => ({ id: doc.id, ...doc.data() }));

      if (rows.length || start) {
        const pageRows = rows.slice(0, LOGS_PER_PAGE);
        setLogs(pageRows);
        const last = pageRows.at(-1);
        if (rows.length > LOGS_PER_PAGE && last) {
          const sameTime = (value: unknown) => JSON.stringify(value) === JSON.stringify(last.timestamp);
          const carried = start && sameTime(start.at) ? start.shown : [];
          setNextStart({ at: last.timestamp, shown: [...carried, ...pageRows.filter(row => sameTime(row.timestamp)).map(row => row.id)] });
        } else setNextStart(null);
      } else {
        setNextStart(null);
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
      setLogs([]); setNextStart(null); setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => auditMatches(log, search));
  const goNext = () => {
    if (!nextStart) return;
    setStarts(previous => [...previous.slice(0, page + 1), nextStart]);
    setPage(page + 1);
  };

  return (
    <div className="w-full px-6 max-sm:px-0 lg:px-8 space-y-8 pb-10">
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
              placeholder="Search this page by action or user email..."
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
                          {auditTimestamp(log.timestamp)}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-mono bg-slate-900 border border-slate-700 text-indigo-400 px-2 py-1 rounded">
                        {auditAction(log)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <User className="w-4 h-4 text-slate-500" />
                        <span className="text-sm">{auditActor(log)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {auditDetails(log)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
          <p className="text-[11px] text-slate-500">
            {loadError ? <span className="text-rose-300">Logs could not be loaded. Try again.</span>
              : <>Newest first · {LOGS_PER_PAGE} per page{page > 0 ? <> · entries {(page * LOGS_PER_PAGE + 1).toLocaleString()}–{(page * LOGS_PER_PAGE + logs.length).toLocaleString()}</> : null}</>}
          </p>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <button type="button" onClick={() => setPage(page - 1)} disabled={loading || page === 0}
              className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800 disabled:opacity-40">Previous</button>
            <span>Page {page + 1}</span>
            <button type="button" onClick={goNext} disabled={loading || !nextStart}
              className="rounded-lg border border-slate-700 px-3 py-1 hover:bg-slate-800 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
