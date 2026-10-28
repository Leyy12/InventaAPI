"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogOut, X } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import SignOutDialog from '@/components/auth/SignOutDialog';
import { dashboardRoutes, routeActive } from './dashboard-navigation';

// Helper: Map legacy plan values to correct display names
function getPlanDisplayName(plan: string | undefined): string {
  if (!plan) return "Free";
  const planLower = plan.toLowerCase();
  if (planLower === "starter" || planLower === "free" || planLower === "deleted") return "Free";
  if (planLower === "pro" || planLower === "professional") return "Pro";
  if (planLower === "free trial") return "Free Trial";
  if (planLower === "upgrade required") return "Upgrade Required";
  if (planLower === "pro max") return "Pro Max";
  if (planLower === "enterprise" || planLower === "unlimited") return "Enterprise";
  return plan.charAt(0).toUpperCase() + plan.slice(1); // fallback with capitalized first letter
}

// Logo, pages, account and Sign Out. Shared by the desktop sidebar and the mobile drawer.
function SidebarBody({ onNavigate, onClose, drawer = false }: { onNavigate?: () => void; onClose?: () => void; drawer?: boolean }) {
  const pathname = usePathname();
  const { user, appUser, logout, loading } = useAuth();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const signOutButtonRef = useRef<HTMLButtonElement>(null);

  return <>
    <div className="h-16 shrink-0 flex items-center justify-between gap-2 px-6 border-b border-slate-800/60">
      <div className="flex items-center gap-2 text-indigo-400 font-bold text-lg tracking-tight">
        <div className="flex-shrink-0">
          <Image src="/inventa-logo.png" alt="InventaAPI Logo" width={drawer ? 44 : 56} height={drawer ? 44 : 56} className="object-contain" priority />
        </div>
        InventaAPI
      </div>
      {drawer && <button type="button" onClick={onClose} aria-label="Close workspace navigation"
        className="-mr-2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
        <X className="h-5 w-5" aria-hidden="true" />
      </button>}
    </div>

    <div className="flex-1 py-6 px-3 overflow-y-auto space-y-1 custom-scrollbar">
      <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Customer Workspace
      </div>
      {dashboardRoutes.map((route) => {
        const isActive = routeActive(pathname, route.href);
        return (
          <Link
            key={route.href}
            href={route.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              "flex items-center gap-3 px-3 rounded-lg text-sm font-medium transition-all duration-200 group",
              drawer ? "py-3" : "py-2",
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
      {(loading || !user) ? (
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-slate-800/80 animate-pulse"></div>
          <div className="flex flex-col gap-1">
            <div className="h-3.5 w-24 bg-slate-800/80 rounded animate-pulse"></div>
            <div className="h-2.5 w-16 bg-slate-800/80 rounded animate-pulse"></div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 border border-slate-500/30 flex items-center justify-center text-xs font-bold uppercase text-slate-100">
            {user?.email?.charAt(0) || "U"}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium text-slate-200 truncate max-w-[12rem]" title={user?.email || "User"}>
              {user?.email || "User"}
            </span>
            {(() => {
              const planName = getPlanDisplayName(appUser?.plan);
              const isPro = planName === "Pro" || planName === "Pro Max" || planName === "Enterprise";
              return (
                <Link href="/dashboard/plan-billing" aria-label={`Plan & Billing: ${planName}`} onClick={onNavigate} className={cn(
                  "text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full w-fit mt-1 border",
                  isPro
                    ? "bg-indigo-500/15 text-indigo-400 border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                    : "bg-slate-800/80 text-slate-400 border-slate-700"
                )}>
                  {planName === 'Free Trial' || planName === 'Upgrade Required' ? planName : `${planName} Plan`}
                </Link>
              );
            })()}
          </div>
        </div>
      )}
      <button
        type="button"
        ref={signOutButtonRef}
        onClick={() => { signOutButtonRef.current?.focus(); setSignOutOpen(true); }}
        className="flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors w-full"
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
      {drawer && <div className="mt-2 border-t border-slate-800/60 px-2 pt-3 text-xs text-slate-500">
        <p>
          <Link href="/terms-of-service" onClick={onNavigate} className="hover:text-slate-300">Terms of Service</Link>
          {" & "}
          <Link href="/privacy-policy" onClick={onNavigate} className="hover:text-slate-300">Privacy Policy</Link>
        </p>
        <p className="mt-1">© {new Date().getFullYear()} InventaAPI</p>
      </div>}
    </div>
    {signOutOpen && <SignOutDialog onClose={() => setSignOutOpen(false)} onSignOut={() => logout()} />}
  </>;
}

export default function Sidebar() {
  return (
    <aside className="w-64 glass border-r border-slate-800/60 hidden lg:flex flex-col relative z-20">
      {/* Called directly: the desktop sidebar is just this body (no extra component boundary). */}
      {SidebarBody({})}
    </aside>
  );
}

// Phones and tablets: the same sidebar slides in from the left over the page.
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  // Rendered into <body>: the blurred header would otherwise clip a full-screen overlay.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(<div className={cn("fixed inset-0 z-50 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open} inert={!open}>
    <div onClick={onClose} className={cn("absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300", open ? "opacity-100" : "opacity-0")} />
    <nav ref={panelRef} id="customer-mobile-navigation" aria-label="Customer workspace"
      className={cn("absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-800/60 bg-slate-950 shadow-2xl transition-transform duration-300 ease-out",
        open ? "translate-x-0" : "-translate-x-full")}>
      <SidebarBody drawer onNavigate={onClose} onClose={onClose} />
    </nav>
  </div>, document.body);
}
