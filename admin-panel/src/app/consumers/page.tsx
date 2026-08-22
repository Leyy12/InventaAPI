"use client";

import { useState, useEffect } from "react";
import { Users, Search, Activity, ShieldAlert, Key, CheckCircle2 } from "lucide-react";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function ConsumersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const dataList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      dataList.sort((a: any, b: any) => (a.email || "").localeCompare(b.email || ""));
      setUsers(dataList);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.email || "").toLowerCase().includes(search.toLowerCase()) || 
                          (u.fullName || "").toLowerCase().includes(search.toLowerCase());
    const isAdmin = (u.role || "").toUpperCase() === "ADMIN";
    
    let matchesRole = false;
    if (roleFilter === "Admins") {
      matchesRole = isAdmin;
    } else if (roleFilter === "Customers") {
      matchesRole = !isAdmin;
    } else { // "All"
      matchesRole = !isAdmin; // Exclude admins from "All" view as well
    }
    
    return matchesSearch && matchesRole;
  });

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-500" />
            API Consumers
          </h1>
          <p className="text-slate-400">Manage registered users, view API usage limits, and active plans.</p>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden mt-8 border border-white/5">
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center bg-slate-900/50 gap-4">
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search users by email or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            {['All', 'Admin', 'Merchant', 'Developer'].map(role => (
              <button 
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${roleFilter === role ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'}`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User Info</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role & Plan</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">API Usage</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                    <p className="text-xs">Loading consumers...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-500">
                    <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm">No users found.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                           <span className="text-sm font-bold text-slate-300">{(user.fullName || user.email || "?").charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-bold text-slate-200">{user.fullName || "N/A"}</p>
                            {user.businessSegment && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium tracking-wide">
                                {user.businessSegment}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {user.email} 
                            {user.businessName && <span className="ml-1 text-slate-400">• {user.businessName}</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                       <span className={`text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider mr-2 ${user.role === 'admin' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                         {user.role || 'customer'}
                       </span>
                       <span className={`text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider ${user.plan === 'Pro' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                         {user.plan || 'Free'}
                       </span>
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-slate-500" />
                        <span className="text-sm text-slate-300">{user.apiRequestsCount || 0} / {user.apiRequestLimit || 1000}</span>
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-medium">Active</span>
                      </div>
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
