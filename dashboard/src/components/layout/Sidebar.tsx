"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Key,
  BookOpen,
  Package,
  BarChart3,
  LogOut,
  Home,
  Shield,
  Settings
} from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";

const dashboardRoutes = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Products", href: "/dashboard/products", icon: Package },
  { name: "API Keys", href: "/dashboard/api-keys", icon: Key },
  { name: "Documentation", href: "/dashboard/docs", icon: BookOpen },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Privacy", href: "/dashboard/privacy", icon: Shield },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

// Helper: Map legacy plan values to correct display names
function getPlanDisplayName(plan: string | undefined): string {
  if (!plan) return "Free";
  const planLower = plan.toLowerCase();
  if (planLower === "starter" || planLower === "free") return "Free";
  if (planLower === "pro" || planLower === "professional") return "Pro";
  if (planLower === "enterprise" || planLower === "unlimited") return "Enterprise";
  return plan.charAt(0).toUpperCase() + plan.slice(1); // fallback with capitalized first letter
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user, appUser, logout, loading } = useAuth();

  // Prevent SSR/hydration mismatch: only render real user info after client mounts
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  return (
    <aside className="w-64 glass border-r border-slate-800/60 hidden md:flex flex-col relative z-20">
      <div className="h-16 flex items-center px-6 border-b border-slate-800/60">
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-lg tracking-tight">
          <div className="flex-shrink-0">
            <Image
              src="/inventa-logo.png"
              alt="InventaAPI Logo"
              width={56}
              height={56}
              className="object-contain"
              priority
            />
          </div>
          InventaAPI
        </div>
      </div>

      <div className="flex-1 py-6 px-3 overflow-y-auto space-y-1 custom-scrollbar">
        <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          SME Consumer
        </div>
        {dashboardRoutes.map((route) => {
          const isActive = pathname === route.href || (pathname.startsWith(route.href) && route.href !== "/dashboard");
          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "text-indigo-400"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
              style={
                isActive
                  ? {
                    background: "rgba(99,102,241,0.12)",
                    borderLeft: "2px solid #6366f1",
                    paddingLeft: "10px",
                  }
                  : {}
              }
            >
              <route.icon className={cn("w-4 h-4", isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300")} />
              {route.name}
            </Link>
          );
        })}

        {/* External Links Section */}
        <div className="pt-4 mt-4 border-t border-slate-800/60">
          <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            External Links
          </div>
          <Link
            href="/?view=landing"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all duration-200 group"
          >
            <Home className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
            Landing Page
          </Link>
        </div>
      </div>

      {/* User profile snippet at bottom */}
      <div className="p-4 border-t border-slate-800/60 flex flex-col gap-2">
        {(!isMounted || loading || !user) ? (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-slate-800/80 animate-pulse"></div>
            <div className="flex flex-col gap-1">
              <div className="h-3.5 w-24 bg-slate-800/80 rounded animate-pulse"></div>
              <div className="h-2.5 w-16 bg-slate-800/80 rounded animate-pulse"></div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800/50 cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 border border-slate-500/30 flex items-center justify-center text-xs font-bold uppercase text-slate-100">
              {user?.email?.charAt(0) || "U"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-200 truncate w-32" title={user?.email || "User"}>
                {user?.email || "User"}
              </span>
              <span className="text-xs text-slate-500 truncate w-32">{getPlanDisplayName(appUser?.plan)} Plan</span>
            </div>
          </div>
        )}
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
