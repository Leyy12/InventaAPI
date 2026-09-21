"use client";

import NotificationBell from "@/components/shared/NotificationBell";

export default function AdminNavbar() {
  return (
    <header
      className="h-14 px-5 flex items-center justify-between sticky top-0 z-30"
      style={{
        background: "rgba(7,16,42,0.85)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(59,130,246,0.1)",
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-500">
          Super Admin Control Panel
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Notification Bell — listens to userId="admin" */}
        <NotificationBell userId="admin" accentColor="blue" />
      </div>
    </header>
  );
}
