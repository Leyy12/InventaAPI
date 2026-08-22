"use client";

import { Terminal } from "lucide-react";
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
        {/* API Status pill */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-slate-400 border border-blue-900/30"
          style={{ background: "rgba(59,130,246,0.06)" }}
        >
          <Terminal className="w-3 h-3 text-blue-500" />
          API Status:
          <span className="text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Operational
          </span>
        </div>

        {/* Notification Bell — listens to userId="admin" */}
        <NotificationBell userId="admin" accentColor="blue" />
      </div>
    </header>
  );
}
