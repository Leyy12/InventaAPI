"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Key,
  BookOpen,
  Package,
  ShieldCheck,
  Settings,
  ShieldAlert,
  LogOut,
  FileText,
  Home
} from "lucide-react";
import { useAdminAuth } from "@/lib/firebase/admin-auth-context";

const adminRoutes = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Master Product Catalog", href: "/products", icon: Package },
  { name: "Pending Requests", href: "/requests", icon: FileText },
  { name: "API Consumers", href: "/consumers", icon: Key },
  { name: "Categories", href: "/categories", icon: BookOpen },
  { name: "Security Center", href: "/security", icon: ShieldCheck },
  { name: "Audit Logs", href: "/audit", icon: ShieldAlert },
  { name: "System Settings", href: "/settings", icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { adminUser, logout } = useAdminAuth();

  return (
    <aside className="w-64 glass border-r border-slate-800/60 hidden md:flex flex-col relative z-20">
      <div className="h-16 flex items-center px-6 border-b border-slate-800/60">
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-lg tracking-tight">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-white text-xs shadow-lg shadow-indigo-500/20">
            IV
          </div>
          InventaAPI Admin
        </div>
      </div>

      <div className="flex-1 py-6 px-3 overflow-y-auto space-y-1 custom-scrollbar">
        <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Super Admin
        </div>
        {adminRoutes.map((route) => {
          const isActive = pathname === route.href || (pathname.startsWith(route.href) && route.href !== "/");
          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-indigo-500/10 text-indigo-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <route.icon className={cn("w-4 h-4", isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300")} />
              {route.name}
            </Link>
          );
        })}

      </div>

      {/* User profile snippet at bottom */}
      <div className="p-4 border-t border-slate-800/60 flex flex-col gap-2">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-700 to-orange-600 border border-indigo-500/30 flex items-center justify-center text-xs font-bold uppercase text-white">
            {adminUser?.fullName?.charAt(0) || adminUser?.email?.charAt(0) || "A"}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-200 truncate w-32">{adminUser?.fullName || "Admin"}</span>
            <span className="text-xs text-slate-500 truncate w-32">{adminUser?.plan || "Unlimited"}</span>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-lg text-sm font-medium text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
