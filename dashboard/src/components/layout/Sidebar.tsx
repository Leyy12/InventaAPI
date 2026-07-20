"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Key,
  BookOpen,
  Package,
  Sparkles,
  UploadCloud,
  BarChart3,
  ShieldCheck,
  Settings,
  Smartphone,
  ShieldAlert,
  LogOut,
  Globe
} from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";

const dashboardRoutes = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Products", href: "/dashboard/products", icon: Package },
  { name: "API Keys", href: "/dashboard/api-keys", icon: Key },
  { name: "Documentation", href: "/dashboard/docs", icon: BookOpen },
  { name: "Recommendations", href: "/dashboard/recommendations", icon: Sparkles },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
];

const adminRoutes = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Hardware Catalog", href: "/admin/products/hardware", icon: Package },
  { name: "Pharmacy Catalog", href: "/admin/products/pharmacy", icon: Package },
  { name: "Grocery Catalog", href: "/admin/products/grocery", icon: Package },
  { name: "Clothing Catalog", href: "/admin/products/clothing", icon: Package },
  { name: "Pending Requests", href: "/admin/requests", icon: Sparkles },
  { name: "API Consumers", href: "/admin/consumers", icon: Key },
  { name: "Categories", href: "/admin/categories", icon: BookOpen },
  { name: "Security Center", href: "/admin/security", icon: ShieldCheck },
  { name: "Audit Logs", href: "/admin/audit", icon: ShieldAlert },
  { name: "System Settings", href: "/admin/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, appUser, logout } = useAuth();

  return (
    <aside className="w-64 glass border-r border-slate-800/60 hidden md:flex flex-col relative z-20">
      <div className="h-16 flex items-center px-6 border-b border-slate-800/60">
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-lg tracking-tight">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs shadow-lg shadow-indigo-500/20">
            IV
          </div>
          InventaAPI
        </div>
      </div>

      <div className="flex-1 py-6 px-3 overflow-y-auto space-y-1 custom-scrollbar">
        <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {pathname.startsWith("/admin") ? "Super Admin" : "SME Consumer"}
        </div>
        {(pathname.startsWith("/admin") ? adminRoutes : dashboardRoutes).map((route) => {
          const isActive = pathname === route.href || (pathname.startsWith(route.href) && route.href !== "/dashboard" && route.href !== "/admin");
          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? pathname.startsWith("/admin") ? "bg-red-500/10 text-red-400" : "bg-indigo-500/10 text-indigo-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <route.icon className={cn("w-4 h-4", isActive ? (pathname.startsWith("/admin") ? "text-red-400" : "text-indigo-400") : "text-slate-500 group-hover:text-slate-300")} />
              {route.name}
            </Link>
          );
        })}

        <div className="mt-8 pt-6 border-t border-slate-800/60">
          <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            External Links
          </div>
          <a
            href="/?view=landing"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all duration-200 group"
          >
            <Globe className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
            Landing Page
          </a>
        </div>
      </div>

      {/* User profile snippet at bottom */}
      <div className="p-4 border-t border-slate-800/60 flex flex-col gap-2">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 border border-slate-500/30 flex items-center justify-center text-xs font-bold uppercase">
            {appUser?.fullName?.charAt(0) || user?.email?.charAt(0) || "U"}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-200 truncate w-32">{appUser?.fullName || user?.email || "Developer"}</span>
            <span className="text-xs text-slate-500 truncate w-32">{appUser?.plan || "Starter"} Plan</span>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
