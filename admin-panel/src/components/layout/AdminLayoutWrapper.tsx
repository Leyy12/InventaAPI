"use client";

import { usePathname } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import AdminNavbar from "./AdminNavbar";

export default function AdminLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Public routes that should not show sidebar/navbar
  const isPublicRoute = pathname === "/login";

  // If public route (e.g., /login), render children without layout chrome
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Otherwise, render full admin dashboard layout with sidebar and navbar
  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <AdminNavbar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className={pathname === "/products" ? "w-full" : "max-w-7xl mx-auto"}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
