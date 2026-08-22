"use client";

import { useEffect } from "react";
import { Terminal } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";
import NotificationBell from "@/components/shared/NotificationBell";
import { notifySubscriptionExpiringSoon } from "@/lib/firebase/notifications";

export default function Navbar() {
  const { user, appUser } = useAuth();

  // ── Subscription expiry warning ───────────────────────────────────────────
  // Fires once per session after user + appUser data are loaded
  useEffect(() => {
    if (!user || !appUser?.subscriptionExpiresAt) return;

    const expiresAt = new Date(appUser.subscriptionExpiresAt);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Warn if expiry is within 3 days (and hasn't already expired)
    if (diffDays > 0 && diffDays <= 3) {
      notifySubscriptionExpiringSoon({
        customerUid: user.uid,
        daysLeft: diffDays,
      });
    }
  }, [user, appUser]);

  return (
    <header className="h-16 glass border-b border-slate-800/60 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1">
        {/* Search bar placeholder */}
      </div>

      <div className="flex items-center gap-3">
        {/* API Status pill */}
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
          <Terminal className="w-3.5 h-3.5" />
          API Status:{" "}
          <span className="text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
            Operational
          </span>
        </button>

        {/* Notification Bell */}
        {user && (
          <NotificationBell userId={user.uid} accentColor="indigo" />
        )}
      </div>
    </header>
  );
}
