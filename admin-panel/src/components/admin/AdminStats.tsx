"use client";

import { Package, Activity, Users, ShoppingCart, Wrench, Pill } from "lucide-react";

interface AdminStatsProps {
  productsCount: number;
  groceryCount: number;
  hardwareCount: number;
  pharmacyCount: number;
}

export default function AdminStats({ productsCount, groceryCount, hardwareCount, pharmacyCount }: AdminStatsProps) {
  return (
    <div className="space-y-4">
      {/* Top row: Total + segment breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total */}
        <div className="glass-card rounded-xl p-6 border border-white/5 relative overflow-hidden group">
          <p className="text-sm font-medium text-slate-400 mb-1">Master Catalog Items</p>
          <h3 className="text-3xl font-bold text-white">{productsCount}</h3>
          <p className="text-xs text-slate-500 mt-1">Total products in system</p>
          <Package className="absolute bottom-4 right-4 w-12 h-12 text-white/5" />
        </div>

        {/* Grocery */}
        <div className="glass-card rounded-xl p-6 border border-blue-500/20 relative overflow-hidden group bg-blue-500/5">
          <p className="text-sm font-medium text-blue-400/80 mb-1">Grocery</p>
          <h3 className="text-3xl font-bold text-blue-400">{groceryCount}</h3>
          <p className="text-xs text-blue-400/40 mt-1">products</p>
          <ShoppingCart className="absolute bottom-4 right-4 w-12 h-12 text-blue-500/10" />
        </div>

        {/* Hardware */}
        <div className="glass-card rounded-xl p-6 border border-orange-500/20 relative overflow-hidden group bg-orange-500/5">
          <p className="text-sm font-medium text-orange-400/80 mb-1">Hardware</p>
          <h3 className="text-3xl font-bold text-orange-400">{hardwareCount}</h3>
          <p className="text-xs text-orange-400/40 mt-1">products</p>
          <Wrench className="absolute bottom-4 right-4 w-12 h-12 text-orange-500/10" />
        </div>

        {/* Pharmacy */}
        <div className="glass-card rounded-xl p-6 border border-emerald-500/20 relative overflow-hidden group bg-emerald-500/5">
          <p className="text-sm font-medium text-emerald-400/80 mb-1">Pharmacy</p>
          <h3 className="text-3xl font-bold text-emerald-400">{pharmacyCount}</h3>
          <p className="text-xs text-emerald-400/40 mt-1">products</p>
          <Pill className="absolute bottom-4 right-4 w-12 h-12 text-emerald-500/10" />
        </div>
      </div>
    </div>
  );
}
