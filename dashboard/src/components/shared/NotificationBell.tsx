"use client";

import { useEffect, useState, useRef } from "react";
import {
  Notification,
  subscribeToNotifications,
  markNotificationRead,
  markAllRead,
} from "@/lib/firebase/notifications";
import {
  Bell,
  Check,
  CheckCheck,
  Package,
  ShieldAlert,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationBellProps {
  userId: string; // UID of the user or "admin"
  accentColor?: "indigo" | "blue"; // matches customer=indigo, admin=blue
}

const iconForType = (type: Notification["type"]) => {
  switch (type) {
    case "product_request_submitted":
      return <Package className="w-4 h-4 text-blue-400" />;
    case "product_request_approved":
      return <Check className="w-4 h-4 text-emerald-400" />;
    case "product_request_rejected":
      return <X className="w-4 h-4 text-rose-400" />;
    case "subscription_expiring":
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    default:
      return <ShieldAlert className="w-4 h-4 text-slate-400" />;
  }
};

function timeAgo(ts: Notification["createdAt"]): string {
  if (!ts) return "Just now";
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell({
  userId,
  accentColor = "indigo",
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ── real-time listener ─── */
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToNotifications(userId, setNotifications);
    return unsub;
  }, [userId]);

  /* ── close on outside click ─── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  const handleOpen = () => {
    setOpen((o) => !o);
  };

  const handleMarkOne = async (id: string) => {
    await markNotificationRead(id);
  };

  const handleMarkAll = async () => {
    await markAllRead(userId);
  };

  const accentBg = accentColor === "indigo" ? "bg-indigo-500" : "bg-blue-500";
  const accentBorder =
    accentColor === "indigo" ? "border-indigo-500/40" : "border-blue-500/40";
  const accentText =
    accentColor === "indigo" ? "text-indigo-400" : "text-blue-400";

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span
            className={cn(
              "absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
              accentBg
            )}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={cn(
            "absolute right-0 top-12 w-80 rounded-xl shadow-2xl border z-50 overflow-hidden",
            "bg-[#0d1632] border-slate-700/60"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
            <div className="flex items-center gap-2">
              <Bell className={cn("w-4 h-4", accentText)} />
              <span className="text-sm font-semibold text-white">
                Notifications
              </span>
              {unread > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    accentColor === "indigo"
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "bg-blue-500/20 text-blue-300"
                  )}
                >
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && handleMarkOne(n.id)}
                  className={cn(
                    "flex gap-3 px-4 py-3 border-b border-slate-800/60 last:border-0 cursor-pointer transition-colors",
                    n.read
                      ? "opacity-60 hover:opacity-80"
                      : "hover:bg-slate-800/30"
                  )}
                >
                  {/* Icon circle */}
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700/50 flex items-center justify-center flex-shrink-0">
                    {iconForType(n.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "text-xs font-semibold leading-tight",
                          n.read ? "text-slate-400" : "text-slate-100"
                        )}
                      >
                        {n.title}
                      </p>
                      {!n.read && (
                        <span
                          className={cn(
                            "mt-0.5 w-2 h-2 rounded-full flex-shrink-0",
                            accentBg
                          )}
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                      {n.body}
                    </p>
                    <p className="text-[10px] text-slate-600 mt-1">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div
              className={cn(
                "px-4 py-2.5 border-t border-slate-700/60 text-center"
              )}
            >
              <span className="text-[11px] text-slate-500">
                Showing {Math.min(notifications.length, 20)} of{" "}
                {notifications.length} notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
