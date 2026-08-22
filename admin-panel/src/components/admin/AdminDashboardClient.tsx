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
  pendingCount = 0,
  recentAuditLogs = [],
}: {
  productsCount: number;
  groceryCount:  number;
  hardwareCount: number;
  pharmacyCount: number;
  usersCount?: number;
  pendingCount?: number;
  recentAuditLogs?: any[];
}) {
  const [trafficData] = useState(generateTrafficData);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [realUsersCount, setRealUsersCount] = useState(usersCount);
  const [realPendingCount, setRealPendingCount] = useState(pendingCount);
  const [realPendingRequests, setRealPendingRequests] = useState<any[]>([]);
  const [realAuditLogs, setRealAuditLogs] = useState<any[]>(recentAuditLogs);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Listen to users count — exclude admins, same as Consumers page "All" tab
    const usersUnsub = onSnapshot(collection(db, "users"), (snap) => {
      const nonAdminCount = snap.docs.filter(d => {
        const role = (d.data().role || "").toUpperCase();
        return role !== "ADMIN";
      }).length;
      setRealUsersCount(nonAdminCount);
    });

    // 2. Listen to pending product requests
    const pendingQ = query(collection(db, "product_requests"), where("status", "==", "pending"));
    const pendingUnsub = onSnapshot(pendingQ, (snap) => {
      setRealPendingCount(snap.size);
      const reqs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort by created_at desc manually since we can't easily compound index right now
      reqs.sort((a, b) => {
        const tA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
        const tB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
        return tB - tA;
      });
      setRealPendingRequests(reqs);
    });

    // 3. Listen to recent audit logs
    const auditQ = query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(10));
    const auditUnsub = onSnapshot(auditQ, (snap) => {
      const logs = snap.docs.map(doc => {
        const d = doc.data();
        let color = "text-cyan-400";
        if (d.action?.includes("Logout")) color = "text-slate-400";
        if (d.action?.includes("Approved")) color = "text-green-400";
        if (d.action?.includes("Deleted")) color = "text-red-400";
        
        let timeStr = "N/A";
        if (d.timestamp) {
          const date = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
          timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        }
        
        return {
          id: doc.id,
          time: timeStr,
          message: `${d.action} by ${d.email || d.userId || 'System'}`,
          color
        };
      });
      setRealAuditLogs(logs);
    });

    return () => {
      usersUnsub();
      pendingUnsub();
      auditUnsub();
    };
  }, []);

  const handleApprove = async (req: any) => {
    const productName = req.product_name || req.productName || "Unknown";
    if (!confirm(`Approve and add "${productName}" to the product catalog?`)) return;

    setProcessingId(req.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
      const adminEmail = auth.currentUser?.email || "admin";

      const res = await fetch(`${apiUrl}/api/v1/product-requests/${req.id}/approve`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          reviewed_by: adminEmail,
          review_notes: "Approved from dashboard widget",
          create_product: true,
          product_data: {
            name: productName,
            category: req.category || "Uncategorized",
            image_url: req.imageUrl || req.image_url,
            description: req.details || req.notes || "Product added via crowdsourcing."
          }
        })
      });

      if (!res.ok) throw new Error("Failed to approve request via API");
    } catch (error: any) {
      console.error("Error approving request:", error);
      alert(error.message || "Failed to approve request.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: any) => {
    const productName = req.product_name || req.productName || "Unknown";
    const reason = prompt(`Reject "${productName}"? Please provide a reason:`);
    if (!reason) return;

    setProcessingId(req.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
      const adminEmail = auth.currentUser?.email || "admin";

      const res = await fetch(`${apiUrl}/api/v1/product-requests/${req.id}/reject`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          reviewed_by: adminEmail,
          review_notes: reason
        })
      });

      if (!res.ok) throw new Error("Failed to reject request via API");
    } catch (error: any) {
      console.error("Error rejecting request:", error);
      alert(error.message || "Failed to reject request.");
    } finally {
      setProcessingId(null);
    }
  };

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-5 animate-fadeIn">
      
      {/* 1. TOP KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1 */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-5 flex items-center gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/20">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{productsCount || 0}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Master Catalog</div>
            <div className="text-sm text-slate-500 font-medium mt-0.5">Real-time sync</div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-5 flex items-center gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-cyan-500/20">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{realPendingCount}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Pending Requests</div>
            <div className="text-sm text-cyan-400 font-medium mt-0.5">Awaiting review</div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-5 flex items-center gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{realUsersCount}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">API Consumers</div>
            <div className="text-sm text-slate-500 font-medium mt-0.5">Registered accounts</div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-5 flex items-center gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-purple-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">0</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Today&apos;s API Calls</div>
            <div className="text-sm text-slate-500 font-medium mt-0.5">No traffic yet</div>
          </div>
        </div>

      </div>

      {/* NEW: LIVE SECURITY FEED ABOVE TRAFFIC */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-5 flex flex-col justify-between shadow-lg relative">
        <div>
          <div className="flex justify-between items-center border-b border-[#1e293b] pb-3 mb-3">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Live Security Feed</span>
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          </div>

          <div className="space-y-3 font-mono text-sm bg-[#090d16] p-3 rounded border border-[#1e293b] h-36 overflow-y-auto custom-scrollbar flex flex-col-reverse">
            <div ref={logsEndRef} />
            {realAuditLogs.length > 0 ? (
              realAuditLogs.map(log => (
                <div key={log.id}>
                  <span className="text-slate-500 text-xs">{log.time}</span>
                  <div className={log.color}>{log.message}</div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 text-xs text-center pb-4">No recent audit logs found.</div>
            )}
          </div>
        </div>
      </div>

      {/* 2. MIDDLE SECTION: TRAFFIC OVERVIEW & GOAL COMPLETION */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg overflow-hidden shadow-lg">
        <div className="px-5 py-3 border-b border-[#1e293b] flex justify-between items-center bg-[#0b1329]">
          <div className="flex items-center gap-3">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">API Traffic Overview</span>
            <span className="text-sm text-slate-400 uppercase tracking-wide">Real-time throughput metrics</span>
          </div>
          <div className="text-slate-500 text-xs flex gap-2">
            <Minus className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
            <X className="w-3.5 h-3.5 cursor-pointer hover:text-white" />
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Line Chart */}
          <div className="lg:col-span-2">
            <div className="flex gap-4 text-sm mb-2 text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-blue-500"></span> Current Period</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-cyan-400"></span> Previous Period</span>
            </div>
            <div className="h-64 flex items-center justify-center text-slate-500">
              {trafficData.length === 0 ? "No historical traffic data yet." : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trafficData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="current" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="previous" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Progress Bars */}
          <div className="space-y-4 text-xs justify-center flex flex-col border-l border-[#1e293b] pl-0 lg:pl-8">
            <div className="font-bold text-slate-300 uppercase tracking-wider mb-1">System Metrics</div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Total Catalog Size</span>
                <span className="font-bold text-white">{productsCount} items</span>
              </div>
              <div className="w-full bg-[#1b2a4a] h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full w-[100%]"></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-slate-400 mb-1">
                <span>Active API Consumers</span>
                <span className="font-bold text-white">{realUsersCount} users</span>
              </div>
              <div className="w-full bg-[#1b2a4a] h-1.5 rounded-full overflow-hidden">
                <div className="bg-cyan-400 h-full w-[100%]"></div>
              </div>
            </div>
            
            <div className="text-slate-500 italic text-[10px] mt-4">
              * Capacity and request limits will populate once traffic processing begins.
            </div>
          </div>

        </div>

        {/* Bottom Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-[#1e293b] bg-[#0b1329] p-4 text-center">
          <div className="border-r border-[#1e293b] last:border-0">
            <div className="text-slate-500 font-bold text-xs">-</div>
            <div className="text-slate-300 font-extrabold text-lg">0</div>
            <div className="text-slate-500 text-xs font-semibold uppercase">Total Requests</div>
          </div>
          <div className="border-r border-[#1e293b] last:border-0">
            <div className="text-slate-500 font-bold text-xs">-</div>
            <div className="text-slate-300 font-extrabold text-lg">0ms</div>
            <div className="text-slate-500 text-xs font-semibold uppercase">Avg Latency</div>
          </div>
          <div className="border-r border-[#1e293b] last:border-0">
            <div className="text-slate-500 font-bold text-xs">-</div>
            <div className="text-slate-300 font-extrabold text-lg">N/A</div>
            <div className="text-slate-500 text-xs font-semibold uppercase">Success Rate</div>
          </div>
          <div>
            <div className="text-slate-500 font-bold text-xs">-</div>
            <div className="text-slate-300 font-extrabold text-lg">0%</div>
            <div className="text-slate-500 text-xs font-semibold uppercase">Error Rate</div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM SECTION: 2 EQUAL COLUMNS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Box 1: Segment Distribution */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-5 flex flex-col justify-between shadow-lg">
          <div className="flex justify-between items-center border-b border-[#1e293b] pb-3 mb-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Segment Distribution</span>
            <Minus className="text-slate-500 w-3.5 h-3.5" />
          </div>
          
          <div className="h-48 my-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={segmentData} cx="50%" cy="50%" innerRadius="60%" outerRadius="85%" paddingAngle={0} dataKey="value" stroke="none">
                  {segmentData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 text-xs border-t border-[#1e293b] pt-3 text-slate-300">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Hardware</span>
              <span className="font-bold text-white">{hardwareCount || 0} items</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Pharmacy</span>
              <span className="font-bold text-white">{pharmacyCount || 0} items</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span> Grocery</span>
              <span className="font-bold text-white">{groceryCount || 0} items</span>
            </div>
          </div>
        </div>

        {/* Box 2: Priority Review Queue */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-5 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex justify-between items-center border-b border-[#1e293b] pb-3 mb-4">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Priority Review Queue</span>
              <span className="bg-blue-900/60 border border-blue-500/40 text-cyan-300 text-xs font-bold px-2 py-0.5 rounded">{realPendingCount} Pending</span>
            </div>

            <div className="space-y-4">
              {realPendingRequests.length === 0 ? (
                <div className="text-slate-500 text-sm py-4 text-center">No pending requests to review.</div>
              ) : (
                <div className="space-y-3">
                  {realPendingRequests.slice(0, 5).map(req => (
                    <div key={req.id} className="bg-slate-900 border border-[#1e293b] rounded-lg p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="text-sm font-bold text-white truncate max-w-[150px]">{req.product_name || req.productName || "Unknown"}</h4>
                          <span className="text-[10px] text-slate-500">{req.category || "Uncategorized"}</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleApprove(req)}
                            disabled={processingId === req.id}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded p-1" title="Approve">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleReject(req)}
                            disabled={processingId === req.id}
                            className="bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/20 rounded p-1" title="Reject">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between">
                        <span>by {req.requested_by || req.requestedBy?.email || "anonymous"}</span>
                      </div>
                    </div>
                  ))}
                  
                  {realPendingCount > 5 && (
                    <div className="text-center pt-2">
                      <Link href="/requests" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                        View all {realPendingCount} pending requests →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
