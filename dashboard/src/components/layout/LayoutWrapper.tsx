"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import SubscriptionExpiryBanner from "@/components/shared/SubscriptionExpiryBanner";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const isPublicRoute = 
    pathname === "/" || 
    pathname === "/signup";

  // Onboarding (Quick Setup / segment selection) is a fullscreen flow that
  // must NOT render inside the dashboard shell (sidebar/navbar).
  const isOnboardingRoute = pathname === "/dashboard/welcome";

  if (isPublicRoute || isOnboardingRoute) {
    return (
      <main className="min-h-screen w-full relative z-10">
        {children}
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <Navbar />
        {/* Subscription expiry warning — appears for Pro users within 3 days of expiry */}
        <SubscriptionExpiryBanner />
        <main className="flex-1 overflow-y-auto p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}

