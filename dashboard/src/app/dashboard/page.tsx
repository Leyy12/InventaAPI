import { 
  Activity, 
  CreditCard, 
  Database, 
  Server, 
  ArrowUpRight, 
  ArrowRight,
  Code
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-8 pb-10">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Welcome to InventaAPI</h1>
          <p className="text-slate-400">Your centralized product data platform</p>
        </div>
      </div>

      {/* Empty State / Placeholder */}
      <div className="glass-card rounded-xl p-12 text-center">
        <Database className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-white mb-2">Dashboard Overview</h3>
        <p className="text-slate-400 max-w-md mx-auto">
          Your dashboard statistics and analytics will appear here.
        </p>
      </div>
    </div>
  );
}
