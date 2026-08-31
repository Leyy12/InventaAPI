"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { notifyCustomerApproved, notifyCustomerRejected } from "@/lib/firebase/notifications";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import {
  Package,
  Clock,
  Users,
  Activity,
  Minus,
  X,
  Check,
  Send,
} from "lucide-react";

/* ─── Traffic data ───────────────────────────────────────────────────────── */
function generateTrafficData() {
  // Real data: no historical traffic yet, so return an empty array or flat line.
  return [];
}

/* ─── Donut segments ─────────────────────────────────────────────────────── */
const segmentData = [
  { name: "Hardware", value: 58, color: "#3b82f6" },
  { name: "Pharmacy", value: 22, color: "#22d3ee" },
  { name: "Grocery",  value: 20, color: "#60a5fa" },
];

/* ─── Custom tooltip ─────────────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="bg-[#0f172a] border border-[#1e293b] rounded p-2 text-xs text-white shadow-xl">
        <p className="font-bold mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function AdminDashboardClient({
  productsCount,
  groceryCount,
  hardwareCount,
  pharmacyCount,
  usersCount = 0,
  recentAuditLogs = [],
}: {
  productsCount: number;
  groceryCount:  number;
  hardwareCount: number;
  pharmacyCount: number;
  usersCount?: number;
  recentAuditLogs?: any[];
}) {
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [realProductsCount, setRealProductsCount] = useState(productsCount);
  const [realHardwareCount, setRealHardwareCount] = useState(hardwareCount);
  const [realPharmacyCount, setRealPharmacyCount] = useState(pharmacyCount);
  const [realGroceryCount, setRealGroceryCount] = useState(groceryCount);

  const [todaysCalls, setTodaysCalls] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [avgLatency, setAvgLatency] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [errorRate, setErrorRate] = useState(0);

  const [realUsersCount, setRealUsersCount] = useState(usersCount);
  const [activeConsumersCount, setActiveConsumersCount] = useState(0);
  const [realAuditLogs, setRealAuditLogs] = useState<any[]>(recentAuditLogs);

  useEffect(() => {
    // 1. Listen to users count — exclude admins, same as Consumers page "All" tab
    const usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
      const nonAdminCount = snap.docs.filter(d => {
        const role = (d.data().role || "").toUpperCase();
        return role !== "ADMIN";
      }).length;
      setRealUsersCount(nonAdminCount);
    });

    // 3. Listen to recent audit logs
    const auditQ = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(20));
    const auditUnsub = onSnapshot(auditQ, (snap) => {
      const logs = snap.docs.map(doc => {
        const d = doc.data();
        let color = "text-cyan-400";
        if (d.action?.includes("Logout")) color = "text-slate-400";
        if (d.action?.includes("Approved") || d.action?.includes("Generated")) color = "text-green-400";
        if (d.action?.includes("Deleted") || d.action?.includes("Failed") || d.action?.includes("Failure") || d.action?.includes("Invalid") || d.action?.includes("Revoked")) color = "text-red-400";
        
        let timeStr = "N/A";
        if (d.timestamp) {
          // Handle both Firestore Timestamp objects and Date objects
          const date = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
          timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        }
        
        return {
          id: doc.id,
          time: timeStr,
          // Login events store 'userEmail', DaaS events store 'email'
          message: `${d.action}${d.endpoint ? ` [${d.endpoint}]` : ''} — ${d.email || d.userEmail || d.userId || 'System'}`,
          color
        };
      });
      setRealAuditLogs(logs);
    });

    // 3b. Listen to api_keys to count distinct active API consumers
    const apiKeysUnsub = onSnapshot(collection(db, "api_keys"), (snap) => {
      const distinctUsers = new Set<string>();
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'active' && data.userId) {
          distinctUsers.add(data.userId);
        }
      });
      setActiveConsumersCount(distinctUsers.size);
    });

    // 4. Listen to master catalog (products)
    const productsUnsub = onSnapshot(collection(db, "products"), (snap) => {
      setRealProductsCount(snap.size);
      let hw = 0, ph = 0, gr = 0;
      snap.docs.forEach(d => {
        const seg = (d.data().segment || "").toLowerCase();
        if (seg === "hardware") hw++;
        else if (seg === "pharmacy") ph++;
        else if (seg === "grocery") gr++;
      });
      setRealHardwareCount(hw);
      setRealPharmacyCount(ph);
      setRealGroceryCount(gr);
    });

    // 5. Listen to API telemetry for Today's Calls and Traffic metrics
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    
    // Listen to the last 500 telemetry events to calculate metrics.
    const telemetryQ = query(collection(db, "api_telemetry"), orderBy("timestamp", "desc"), limit(500));
    const telemetryUnsub = onSnapshot(telemetryQ, (snap) => {
      let todayCount = 0;
      let total = snap.size;
      let successCount = 0;
      let totalLatency = 0;
      
      const hourlyData: Record<string, { current: number }> = {};
      
      snap.docs.forEach(doc => {
        const d = doc.data();
        // CRITICAL: Firestore Timestamp objects must be converted via .toDate()
        // not via new Date(d.timestamp) which only works for ISO strings.
        const ts = d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
        
        if (ts >= startOfDay) todayCount++;
        if (d.success) successCount++;
        if (typeof d.latencyMs === 'number') totalLatency += d.latencyMs;
        
        // Group by time for traffic chart
        const timeKey = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (!hourlyData[timeKey]) hourlyData[timeKey] = { current: 0 };
        hourlyData[timeKey].current += 1;
      });

      setTodaysCalls(todayCount);
      setTotalRequests(total);
      
      if (total > 0) {
        setAvgLatency(Math.round(totalLatency / total));
        const sRate = Math.round((successCount / total) * 100);
        setSuccessRate(sRate);
        setErrorRate(100 - sRate);
      } else {
        setAvgLatency(0);
        setSuccessRate(0);
        setErrorRate(0);
      }
      
      // Format chart data — last 15 time buckets, sorted chronologically
      const tData = Object.keys(hourlyData).sort().slice(-15).map(k => ({
         name: k,
         current: hourlyData[k].current,
         previous: Math.max(0, hourlyData[k].current - 1)
      }));
      setTrafficData(tData);
    });

    return () => {
      usersUnsub();
      auditUnsub();
      apiKeysUnsub();
      productsUnsub();
      telemetryUnsub();
    };
  }, []);



  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-[calc(100vh-90px)] w-full px-6 lg:px-8 pb-6 gap-4 animate-fadeIn overflow-hidden">
      
      {/* ─── 1. TOP KPI CARDS (Fixed Height) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
        
        {/* Card 1: Master Catalog */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 p-5 flex items-center gap-4 group transition-colors hover:bg-slate-900/80 hover:border-indigo-500/50">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Package className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white leading-none tracking-tight">{realProductsCount}</div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mt-1">Master Catalog</div>
            <div className="text-[10px] text-emerald-400 font-medium mt-1.5 flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Real-time sync
            </div>
          </div>
        </div>

        {/* Card 2: API Consumers */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 p-5 flex items-center gap-4 group transition-colors hover:bg-slate-900/80 hover:border-blue-500/50">
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white leading-none tracking-tight">{activeConsumersCount}</div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mt-1">API Consumers</div>
            <div className="text-[10px] text-emerald-400 font-medium mt-1.5 flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Active key holders
            </div>
          </div>
        </div>

        {/* Card 3: Today's Calls */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 p-5 flex items-center gap-4 group transition-colors hover:bg-slate-900/80 hover:border-amber-500/50">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Activity className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white leading-none tracking-tight">{todaysCalls}</div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mt-1">Today's API Calls</div>
            <div className="text-[10px] text-emerald-400 font-medium mt-1.5 flex items-center gap-1.5">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Live traffic monitoring
            </div>
          </div>
        </div>

        {/* Card 4: Success Rate */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 p-5 flex items-center gap-4 group transition-colors hover:bg-slate-900/80 hover:border-emerald-500/50">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white leading-none tracking-tight">{successRate}%</div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold mt-1">API Success Rate</div>
            <div className="text-[10px] text-slate-500 font-medium mt-1.5 flex items-center gap-1.5">
               Total Req: {totalRequests} / Avg: {avgLatency}ms
            </div>
          </div>
        </div>

      </div>

      {/* ─── 2. MIDDLE ROW (Flex Grow - Traffic & Pie Chart) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-[250px] overflow-hidden">
        
        {/* API Traffic Overview (2/3 width) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-900/80">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30">
                <Activity className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">API Traffic Overview</h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-0.5 rounded bg-blue-500" /> Current</span>
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-0.5 rounded bg-cyan-400" /> Previous</span>
            </div>
          </div>
          
          <div className="flex-1 p-5 overflow-hidden flex items-center justify-center">
            {trafficData.length === 0 ? (
              <div className="text-sm font-medium text-slate-600">No historical traffic data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trafficData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Line type="monotone" dataKey="current" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#3b82f6', stroke: '#0f172a', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="previous" stroke="#22d3ee" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#22d3ee', stroke: '#0f172a', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Segment Distribution (1/3 width) */}
        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-900/80">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Segment Share</h2>
            <div className="p-1 rounded bg-slate-800/80 border border-slate-700/50">
              <PieChart className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>
          
          <div className="flex-1 flex flex-col p-5 overflow-hidden">
            <div className="flex-1 min-h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={[
                      { name: "Hardware", value: realHardwareCount, color: "#3b82f6" },
                      { name: "Pharmacy", value: realPharmacyCount, color: "#22d3ee" },
                      { name: "Grocery",  value: realGroceryCount, color: "#60a5fa" },
                    ]} 
                    cx="50%" cy="50%" innerRadius="65%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
                    {[
                      { name: "Hardware", color: "#3b82f6" },
                      { name: "Pharmacy", color: "#22d3ee" },
                      { name: "Grocery",  color: "#60a5fa" },
                    ].map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-300"><div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" /> Hardware</span>
                <span className="text-white bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">{realHardwareCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-300"><div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" /> Pharmacy</span>
                <span className="text-white bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">{realPharmacyCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-2 text-slate-300"><div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" /> Grocery</span>
                <span className="text-white bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">{realGroceryCount}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ─── 3. BOTTOM ROW (Live Security Feed - Fixed Height/Scrollable) ─── */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/30 flex flex-col shrink-0 h-48 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <Activity className="w-3.5 h-3.5 text-red-400" />
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">Live Security Feed</span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div> Live
          </span>
        </div>

        <div className="flex-1 p-4 bg-slate-950/40 overflow-y-auto custom-scrollbar flex flex-col-reverse font-mono text-[11px] leading-relaxed">
          <div ref={logsEndRef} />
          {realAuditLogs.length > 0 ? (
            realAuditLogs.map(log => (
              <div key={log.id} className="mb-2.5 last:mb-0 hover:bg-slate-800/30 px-2 py-1 -mx-2 rounded transition-colors flex items-start gap-3">
                <span className="text-slate-500 shrink-0 select-none">[{log.time}]</span>
                <span className={`${log.color} break-all`}>{log.message}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-600 text-xs text-center flex-1 flex flex-col justify-center">No recent security events recorded.</div>
          )}
        </div>
      </div>

    </div>
  );
}
