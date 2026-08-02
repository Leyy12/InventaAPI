"use client";

import { AlertTriangle, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSubscriptionWarning } from "@/hooks/useSubscriptionWarning";

/**
 * SubscriptionExpiryBanner
 *
 * Shown at the top of every dashboard page when the user's Pro subscription
 * is expiring within 3 days. Dismissible within the current session only
 * (reappears on next page load).
 *
 * Placement: inside LayoutWrapper.tsx, above <main>
 */
export default function SubscriptionExpiryBanner() {
  const { showWarning, daysLeft, hoursLeft } = useSubscriptionWarning();
  const [dismissed, setDismissed] = useState(false);

  if (!showWarning || dismissed) return null;

  // Build human-readable time string
  const timeLabel =
    daysLeft > 0
      ? `${daysLeft} araw${daysLeft === 1 ? "" : ""}`
      : `${hoursLeft} oras`;

  const urgencyLevel = daysLeft === 0 ? "critical" : daysLeft === 1 ? "high" : "medium";

  const urgencyStyles = {
    critical: {
      banner: "bg-red-950/80 border-red-500/60",
      icon: "text-red-400",
      text: "text-red-200",
      subtext: "text-red-300/70",
      button: "bg-red-500 hover:bg-red-400 text-white",
      dismiss: "text-red-400 hover:text-red-200 hover:bg-red-500/20",
      glow: "shadow-red-900/50",
    },
    high: {
      banner: "bg-orange-950/80 border-orange-500/60",
      icon: "text-orange-400",
      text: "text-orange-200",
      subtext: "text-orange-300/70",
      button: "bg-orange-500 hover:bg-orange-400 text-white",
      dismiss: "text-orange-400 hover:text-orange-200 hover:bg-orange-500/20",
      glow: "shadow-orange-900/50",
    },
    medium: {
      banner: "bg-amber-950/80 border-amber-500/40",
      icon: "text-amber-400",
      text: "text-amber-200",
      subtext: "text-amber-300/70",
      button: "bg-amber-500 hover:bg-amber-400 text-white",
      dismiss: "text-amber-400 hover:text-amber-200 hover:bg-amber-500/20",
      glow: "shadow-amber-900/50",
    },
  };

  const s = urgencyStyles[urgencyLevel];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        relative flex items-center gap-4 px-5 py-3.5
        border-b backdrop-blur-md shadow-lg
        ${s.banner} ${s.glow}
        animate-in slide-in-from-top duration-300
      `}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 ${s.icon}`}>
        <AlertTriangle className="w-5 h-5" aria-hidden="true" />
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${s.text}`}>
          Ang iyong <span className="font-bold">Pro subscription</span> ay mag-e-expire sa loob ng{" "}
          <span className="font-bold underline decoration-dotted">{timeLabel}</span>.
        </p>
        <p className={`text-xs mt-0.5 ${s.subtext}`}>
          Mag-renew na para hindi ma-interrupt ang iyong API access at bumalik sa Free plan limits.
        </p>
      </div>

      {/* CTA Button */}
      <Link
        href="/?renew=true"
        id="subscription-expiry-renew-btn"
        className={`
          flex-shrink-0 flex items-center gap-1.5
          text-xs font-bold px-4 py-2 rounded-lg
          transition-all duration-150 shadow-md whitespace-nowrap
          ${s.button}
        `}
      >
        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        Mag-Renew
      </Link>

      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        id="subscription-expiry-dismiss-btn"
        aria-label="Isara ang notification"
        className={`
          flex-shrink-0 p-1.5 rounded-lg
          transition-all duration-150
          ${s.dismiss}
        `}
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
