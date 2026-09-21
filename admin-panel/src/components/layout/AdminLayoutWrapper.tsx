"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from 'react';
import { useAdminAuth } from '@/lib/firebase/admin-auth-context';
import { navigationDecision, profileRole, authScreen } from '../../../../services/auth-navigation';
import AdminSidebar from "./AdminSidebar";
import AdminNavbar from "./AdminNavbar";

export default function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, adminUser, loading, authStatus, logoutError, logoutBusy, logout, retryVerification } = useAdminAuth();
  const role = user ? profileRole(adminUser) : null;
  const screen = authScreen(authStatus);
  const destination = navigationDecision({ app: 'admin', path: pathname, initializing: screen !== 'ready', role });
  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);
  const logoutNotice = logoutError && <div role="alert">
    <p>{logoutError}</p>
    <button disabled={logoutBusy} onClick={() => { void logout(); }}>Retry logout</button>
  </div>;
  if (screen === 'retry') return <div role="alert">
    <p>We couldn&apos;t verify your account right now. Please try again.</p>
    <button onClick={retryVerification}>Retry verification</button>
    {logoutNotice}
  </div>;
  if (loading || destination || (pathname !== '/login' && role !== 'admin')) return <p role="status">Checking session…</p>;
  
  // Public routes that should not show sidebar/navbar
  const isPublicRoute = pathname === "/login";

  // If public route (e.g., /login), render children without layout chrome
  if (isPublicRoute) {
    return <>
      {(authStatus === 'denied' || authStatus === 'invalid') && <p role="alert">
        {authStatus === 'invalid' ? 'Your session ended. Please sign in again.' : 'Admin access is unavailable. Sign out or contact support.'}
        <button disabled={logoutBusy} onClick={() => { void logout(); }}>Sign out</button></p>}
      {logoutNotice}{children}</>;
  }

  // Otherwise, render full admin dashboard layout with sidebar and navbar
  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <AdminNavbar />
        <main className="flex-1 overflow-y-auto p-3 lg:p-4 custom-scrollbar">
          {logoutNotice}
          {children}
        </main>
      </div>
    </div>
  );
}
