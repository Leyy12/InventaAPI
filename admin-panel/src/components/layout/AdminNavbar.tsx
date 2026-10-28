"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import NotificationBell from "@/components/shared/NotificationBell";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { AdminMobileSidebar } from "./AdminSidebar";

export default function AdminNavbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => { setMenuOpen(false); menuButtonRef.current?.focus(); }, []);
  // Close the drawer when the page changes (e.g. browser back).
  useEffect(() => { queueMicrotask(() => setMenuOpen(false)); }, [pathname]);

  return (
    <header className="admin-navbar h-14 px-3 sm:px-5 flex items-center justify-between gap-3 sticky top-0 z-30">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" ref={menuButtonRef} onClick={() => setMenuOpen(true)}
          aria-label="Open admin navigation" aria-controls="admin-mobile-navigation" aria-expanded={menuOpen}
          className="lg:hidden shrink-0 rounded-lg p-2 text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="truncate text-sm font-medium text-slate-500">
          Admin Control Panel
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {/* Notification Bell — listens to userId="admin" */}
        <NotificationBell userId="admin" accentColor="blue" />
      </div>
      <AdminMobileSidebar open={menuOpen} onClose={closeMenu} />
    </header>
  );
}
