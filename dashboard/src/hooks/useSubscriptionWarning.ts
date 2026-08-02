"use client";

import { useAuth } from "@/lib/firebase/auth-context";
import { useMemo } from "react";

interface SubscriptionWarning {
  showWarning: boolean;
  daysLeft: number;
  hoursLeft: number;
}

/**
 * useSubscriptionWarning
 *
 * Computes whether to show the "your Pro subscription is expiring soon" banner.
 *
 * Rules:
 * - Only shows for users on the "Pro" plan
 * - Only shows when 3 days or fewer remain before expiry AND expiry has not yet passed
 * - Returns { showWarning: false } for Free-plan users (no expiry concept)
 * - Returns { showWarning: false } if already expired (they are being downgraded to Free)
 *
 * No extra Firestore field needed — computed purely from subscriptionExpiresAt.
 */
export function useSubscriptionWarning(): SubscriptionWarning {
  const { appUser } = useAuth();

  return useMemo(() => {
    const DEFAULT: SubscriptionWarning = { showWarning: false, daysLeft: 0, hoursLeft: 0 };

    // Only relevant for Pro plan users
    if (!appUser || appUser.plan !== "Pro") return DEFAULT;

    // Must have an expiry date
    if (!appUser.subscriptionExpiresAt) return DEFAULT;

    const now = new Date();
    const expiresAt = new Date(appUser.subscriptionExpiresAt);
    const msLeft = expiresAt.getTime() - now.getTime();

    // Already expired — do not show "expiring soon" banner
    // (checkout.js auto-downgrade will handle setting plan back to Free)
    if (msLeft <= 0) return DEFAULT;

    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    if (msLeft <= THREE_DAYS_MS) {
      const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
      const hoursLeft = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      return {
        showWarning: true,
        daysLeft,
        hoursLeft,
      };
    }

    return DEFAULT;
  }, [appUser]);
}
