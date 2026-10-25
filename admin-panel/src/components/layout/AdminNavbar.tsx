"use client";

import NotificationBell from "@/components/shared/NotificationBell";
import ThemeToggle from "@/components/shared/ThemeToggle";

export default function AdminNavbar() {
  return (
    <header className="admin-navbar h-14 px-5 flex items-center justify-between sticky top-0 z-30">
      {/* Left */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-500">
          Super Admin Control Panel
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {/* Notification Bell — listens to userId="admin" */}
        <NotificationBell userId="admin" accentColor="blue" />
      </div>
    </header>
  );
}
