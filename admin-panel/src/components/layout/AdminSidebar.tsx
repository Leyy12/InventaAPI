"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appConfirm } from "@/components/shared/AppDialog";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Key,
  Package,
  Settings,
  ShieldAlert,
  LogOut,
  FileText,
  X,
} from "lucide-react";
import { useAdminAuth } from "@/lib/supabase/admin-auth-context";

const adminRoutes = [
  { name: "Dashboard",              href: "/",          icon: LayoutDashboard },
  { name: "Master Product Catalog", href: "/products",  icon: Package         },
  { name: "Product Submissions",    href: "/submissions", icon: FileText       },

  { name: "API Key Inventory",      href: "/consumers", icon: Key             },

  { name: "Audit Logs",             href: "/audit",     icon: ShieldAlert     },
  { name: "System Settings",        href: "/settings",  icon: Settings        },
];

// Logo, pages, account and Sign Out. Shared by the desktop sidebar and the mobile drawer.
function AdminSidebarBody({ onNavigate, onClose, drawer = false }: { onNavigate?: () => void; onClose?: () => void; drawer?: boolean }) {
  const pathname  = usePathname();
  const { adminUser, logout } = useAdminAuth();

  return (
    <>
      {/* Logo */}
      <div className="admin-sidebar-rule h-14 shrink-0 flex items-center px-5 gap-3 border-b border-[rgba(59,130,246,0.08)]">
        <Image
          src="/admin/inventa-logo.png"
          alt="InventaAPI Logo"
          width={56}
          height={56}
          className="object-contain flex-shrink-0"
          priority
        />
        <div className="flex-1">
          <p className="text-lg font-bold text-white leading-tight">InventaAPI</p>
        </div>
        {drawer && <button type="button" onClick={onClose} aria-label="Close admin navigation"
          className="-mr-2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>}
      </div>

      {/* Nav */}
      <div className="flex-1 py-4 px-2 overflow-y-auto space-y-0.5 custom-scrollbar">
        <p className="px-3 mb-2 text-xs font-semibold text-blue-900/80 uppercase tracking-widest">
          Admin
        </p>

        {adminRoutes.map((route) => {
          const isActive =
            pathname === route.href ||
            (pathname.startsWith(route.href) && route.href !== "/");

          return (
            <Link
              key={route.href}
              href={route.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 px-3 rounded-lg",
                drawer ? "py-3" : "py-2",
                " text-sm font-medium transition-all duration-150 group",
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
      <div className="admin-sidebar-rule p-3 border-t border-[rgba(59,130,246,0.08)]">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-blue-950/30 cursor-pointer transition-colors mb-1">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white [--color-white:#fff] flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)" }}
          >
            {adminUser?.fullName?.charAt(0) || adminUser?.email?.charAt(0) || "S"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200 truncate">
              {adminUser?.fullName ?? "Admin"}
            </p>
            <p className="text-xs text-blue-500/60 truncate capitalize">
              {adminUser?.role ?? "Admin"}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            void appConfirm({ title: "Sign out?", message: "You will need to log in again to use the admin panel.",
              confirmLabel: "Sign out", tone: "warning" }).then(ok => { if (ok) logout(); });
          }}
          className="flex items-center justify-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-3 h-3" />
          Sign Out
        </button>
        {drawer && <p className="mt-3 border-t border-slate-800/60 px-2 pt-3 text-xs text-slate-500">© {new Date().getFullYear()} InventaAPI</p>}
      </div>
    </>
  );
}

export default function AdminSidebar() {
  return (
    <aside className="admin-sidebar w-56 flex flex-col hidden lg:flex relative z-20">
      {/* Called directly: the desktop sidebar is just this body (no extra component boundary). */}
      {AdminSidebarBody({})}
    </aside>
  );
}

// Phones and tablets: the same sidebar slides in from the left over the page.
export function AdminMobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  // Rendered into <body>: the blurred header would otherwise clip a full-screen overlay.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(<div className={cn("fixed inset-0 z-50 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open} inert={!open}>
    <div onClick={onClose} className={cn("absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} />
    <nav ref={panelRef} id="admin-mobile-navigation" aria-label="Admin"
      className={cn("admin-sidebar absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col shadow-2xl transition-transform duration-300 ease-out",
        open ? "translate-x-0" : "-translate-x-full")}>
      <AdminSidebarBody drawer onNavigate={onClose} onClose={onClose} />
    </nav>
  </div>, document.body);
}
