"use client";

import Link from "next/link";
import Image from "next/image";
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
} from "lucide-react";
import { useAdminAuth } from "@/lib/firebase/admin-auth-context";

const adminRoutes = [
  { name: "Dashboard",              href: "/",          icon: LayoutDashboard },
  { name: "Master Product Catalog", href: "/products",  icon: Package         },
  { name: "Pending Requests",       href: "/requests",  icon: FileText        },
  { name: "API Consumers",          href: "/consumers", icon: Key             },
  { name: "Categories",             href: "/categories",icon: BookOpen        },
  { name: "Security Center",        href: "/security",  icon: ShieldCheck     },
  { name: "Audit Logs",             href: "/audit",     icon: ShieldAlert     },
  { name: "System Settings",        href: "/settings",  icon: Settings        },
];

export default function AdminSidebar() {
  const pathname  = usePathname();
  const { adminUser, logout } = useAdminAuth();

  return (
    <aside className="w-56 flex flex-col hidden md:flex relative z-20"
      style={{
        background: "linear-gradient(180deg, #07102a 0%, #060d1f 100%)",
        borderRight: "1px solid rgba(59,130,246,0.1)",
      }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-5 gap-3"
        style={{ borderBottom: "1px solid rgba(59,130,246,0.08)" }}
      >
        <Image
          src="/inventa-logo.png"
          alt="InventaAPI Logo"
          width={56}
          height={56}
          className="object-contain flex-shrink-0"
          priority
        />
        <div>
          <p className="text-lg font-bold text-white leading-tight">InventaAPI</p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-4 px-2 overflow-y-auto space-y-0.5 custom-scrollbar">
        <p className="px-3 mb-2 text-xs font-semibold text-blue-900/80 uppercase tracking-widest">
          Super Admin
        </p>

        {adminRoutes.map((route) => {
          const isActive =
            pathname === route.href ||
            (pathname.startsWith(route.href) && route.href !== "/");

          return (
            <Link
              key={route.href}
              href={route.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group",
                isActive
                  ? "text-blue-300"
                  : "text-slate-500 hover:text-slate-200"
              )}
              style={
                isActive
                  ? {
                      background: "rgba(59,130,246,0.12)",
                      borderLeft: "2px solid #3b82f6",
                      paddingLeft: "10px",
                    }
                  : {}
              }
            >
              <route.icon
                className={cn(
                  "w-3.5 h-3.5 flex-shrink-0",
                  isActive ? "text-blue-400" : "text-slate-600 group-hover:text-slate-400"
                )}
              />
              {route.name}
            </Link>
          );
        })}
      </div>

      {/* User footer */}
      <div className="p-3" style={{ borderTop: "1px solid rgba(59,130,246,0.08)" }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-blue-950/30 cursor-pointer transition-colors mb-1">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}
          >
            {adminUser?.fullName?.charAt(0) || adminUser?.email?.charAt(0) || "S"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200 truncate">
              {adminUser?.fullName ?? "Super Admin"}
            </p>
            <p className="text-xs text-blue-500/60 truncate capitalize">
              {adminUser?.role ?? "Admin"}
            </p>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="flex items-center justify-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:text-blue-300 hover:bg-blue-950/30 transition-colors"
        >
          <LogOut className="w-3 h-3" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
