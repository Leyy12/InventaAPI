"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { customerPublicPath, navigationDecision, profileRole, adminLoginDestination, authScreen, customerLogoutDestination } from '../../../../services/auth-navigation';
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import SubscriptionExpiryBanner from "@/components/shared/SubscriptionExpiryBanner";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, appUser, loading, logout, authStatus, logoutError, logoutBusy, retryVerification } = useAuth();
  const role = user ? profileRole(appUser) : null;
  const isPublicRoute = customerPublicPath(pathname);
  const rejected = authStatus === 'denied' || authStatus === 'invalid';
  const screen = authScreen(authStatus);
  const destination = rejected && pathname !== '/signup' && pathname !== '/login' ? '/login'
    : navigationDecision({ path: pathname, initializing: screen !== 'ready', role, entryFlow: true });
  useEffect(() => {
    // Read the synchronous logout intent when the effect executes, including
    // effects scheduled before the SDK published its unauthenticated state.
    const targetDestination = customerLogoutDestination(destination);
    if (targetDestination === 'admin-app') {
      const target = adminLoginDestination(process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN, window.location.hostname);
      if (target && new URL(target).origin !== window.location.origin) window.location.replace(target);
    } else if (targetDestination && targetDestination !== pathname) router.replace(targetDestination);
  }, [destination, router, pathname, logoutBusy]);

  const logoutNotice = logoutError && <div role="alert">
    <p>{logoutError}</p>
    <button disabled={logoutBusy} onClick={() => { void logout(); }}>Retry logout</button>
  </div>;
  if (screen === 'retry' && pathname !== '/signup') return <div role="alert">
    <p>We couldn&apos;t verify your account right now. Please try again.</p>
    <button onClick={retryVerification}>Retry verification</button>
    {logoutNotice}
  </div>;
  if (!loading && role === 'admin') return <div>
    <p role="status">Use the separate Admin application. If navigation does not continue, contact the operator for its configured address.</p>
    <button disabled={logoutBusy} onClick={() => { void logout(); }}>Sign out</button>
    {logoutNotice}
  </div>;
  if (!isPublicRoute && (loading || role !== 'customer')) return <p role="status">Checking session…</p>;

  if (isPublicRoute) {
    return (
      <main className="min-h-screen w-full relative z-10">
        {rejected && <p role="alert">{authStatus === 'invalid' ? 'Your session ended. Please sign in again.' : 'Account access is unavailable. Sign out or contact support.'}
          <button disabled={logoutBusy} onClick={() => { void logout(); }}>Sign out</button></p>}
        {logoutNotice}
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
          {logoutNotice}
          {children}
        </main>
      </div>
    </div>
  );
}

