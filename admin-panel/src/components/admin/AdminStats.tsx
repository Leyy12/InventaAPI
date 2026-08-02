"use client";

import { Package, Activity, Users } from "lucide-react";

interface AdminStatsProps {
  productsCount: number;
}

export default function AdminStats({ productsCount }: AdminStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="glass-card rounded-xl p-6 border border-white/5 relative overflow-hidden group">
        <p className="text-sm font-medium text-slate-400 mb-1">Master Catalog Items</p>
        <h3 className="text-3xl font-bold text-white">{productsCount}</h3>
        <Package className="absolute bottom-4 right-4 w-12 h-12 text-white/5" />
      </div>
      
      <div className="glass-card rounded-xl p-6 border border-amber-500/20 relative overflow-hidden group bg-amber-500/5">
        <p className="text-sm font-medium text-amber-400/80 mb-1">Pending SME Requests</p>
        <h3 className="text-3xl font-bold text-amber-400">2</h3>
        <Activity className="absolute bottom-4 right-4 w-12 h-12 text-amber-500/10" />
      </div>
      
      <div className="glass-card rounded-xl p-6 border border-emerald-500/20 relative overflow-hidden group bg-emerald-500/5">
        <p className="text-sm font-medium text-emerald-400/80 mb-1">Active SME Consumers</p>
        <h3 className="text-3xl font-bold text-emerald-400">5</h3>
        <Users className="absolute bottom-4 right-4 w-12 h-12 text-emerald-500/10" />
      </div>
      
      <div className="glass-card rounded-xl p-6 border border-blue-500/20 relative overflow-hidden group bg-blue-500/5">
        <p className="text-sm font-medium text-blue-400/80 mb-1">API Requests (24h)</p>
        <h3 className="text-3xl font-bold text-blue-400">14.2K</h3>
        <Activity className="absolute bottom-4 right-4 w-12 h-12 text-blue-500/10" />
      </div>
    </div>
  );
}
