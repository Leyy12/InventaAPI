"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useAuth } from "@/lib/firebase/auth-context";
import NotificationBell from "@/components/shared/NotificationBell";
import { notifySubscriptionExpiringSoon } from "@/lib/firebase/notifications";
import { dashboardRoutes, routeActive } from './dashboard-navigation';
import { useWorkspaceHeaderSlot } from './WorkspaceHeaderSlot';

export default function Navbar() {
  const { user, entitlement } = useAuth();
  const pathname = usePathname();
  const headerSlot = useWorkspaceHeaderSlot();
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Subscription expiry warning ───────────────────────────────────────────
  // Fires once per session after user + appUser data are loaded
  useEffect(() => {
    if (!user || !entitlement?.activePro) return;
    const diffDays = Math.ceil(entitlement.secondsRemaining / 86400);

    // Warn if expiry is within 3 days (and hasn't already expired)
    if (diffDays > 0 && diffDays <= 3) {
      notifySubscriptionExpiringSoon({
        customerUid: user.uid,
        daysLeft: diffDays,
      });
    }
  }, [user, entitlement]);

  return (
    <header className="h-16 shrink-0 glass border-b border-slate-800/60 px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
      <div className="flex min-w-0 items-center gap-4 flex-1">
        <button type="button" className="md:hidden shrink-0 rounded-lg p-2 text-slate-200 hover:bg-slate-800" aria-label={menuOpen ? 'Close workspace navigation' : 'Open workspace navigation'}
          aria-controls="customer-mobile-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {pathname === '/dashboard/products' && <div ref={headerSlot?.register} className="contents" />}
      </div>
      {menuOpen && <nav id="customer-mobile-navigation" aria-label="Customer workspace" className="absolute left-0 right-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-slate-700 bg-slate-950 p-3 shadow-xl md:hidden">
        {dashboardRoutes.map(route => <Link key={route.href} href={route.href} onClick={() => setMenuOpen(false)}
          aria-current={routeActive(pathname, route.href) ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium ${routeActive(pathname, route.href) ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-300 hover:bg-slate-800'}`}>
          <route.icon className="h-4 w-4 shrink-0" aria-hidden="true" />{route.name}
        </Link>)}
      </nav>}

      <div className="flex shrink-0 items-center gap-3">
        {/* Notification Bell */}
        {user && (
          <NotificationBell userId={user.uid} accentColor="indigo" />
        )}
      </div>
    </header>
  );
}
