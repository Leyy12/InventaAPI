"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import NotificationBell from "@/components/shared/NotificationBell";
import { notifySubscriptionExpiringSoon } from "@/lib/firebase/notifications";

export default function Navbar() {
  const { user, entitlement } = useAuth();

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
    <header className="h-16 glass border-b border-slate-800/60 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1">
        {/* Search bar placeholder */}
      </div>

      <div className="flex items-center gap-3">
        {/* Notification Bell */}
        {user && (
          <NotificationBell userId={user.uid} accentColor="indigo" />
        )}
      </div>
    </header>
  );
}
