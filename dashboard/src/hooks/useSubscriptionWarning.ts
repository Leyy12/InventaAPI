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
 * Uses remaining time and active state reported by the authenticated backend.
 */
export function useSubscriptionWarning(): SubscriptionWarning {
  const { entitlement } = useAuth();

  return useMemo(() => {
    const DEFAULT: SubscriptionWarning = { showWarning: false, daysLeft: 0, hoursLeft: 0 };

    if (!entitlement?.activePro) return DEFAULT;
    const msLeft = entitlement.secondsRemaining * 1000;
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
  }, [entitlement]);
}
