import { Suspense } from "react";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";

// Server-side data fetching — uses the Express backend (which has firebase-admin)
async function getDashboardData() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

  // Run both fetches in parallel
  const [productsRes, statsRes] = await Promise.allSettled([
    fetch(`${apiUrl}/api/v1/products`, { cache: "no-store" }),
    fetch(`${apiUrl}/api/v1/admin/stats`, { cache: "no-store" }),
  ]);

  // --- Products ---
  let productStats = { total: 0, grocery: 0, hardware: 0, pharmacy: 0 };
  if (productsRes.status === "fulfilled" && productsRes.value.ok) {
    const data = await productsRes.value.json();
    const products: any[] = data.products || [];
    productStats = {
      total:    products.length,
      grocery:  products.filter((p) => p.segment === "Grocery").length,
      hardware: products.filter((p) => p.segment === "Hardware").length,
      pharmacy: products.filter((p) => p.segment === "Pharmacy").length,
    };
  }

  // --- Admin Stats (users, audit logs) ---
  let usersCount = 0;
  let recentAuditLogs: any[] = [];
  if (statsRes.status === "fulfilled" && statsRes.value.ok) {
    const stats = await statsRes.value.json();
    usersCount      = stats.usersCount      ?? 0;
    recentAuditLogs = stats.recentAuditLogs ?? [];
  }

  return { productStats, usersCount, recentAuditLogs };
}


export default async function AdminDashboard() {
  const data = await getDashboardData();

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminDashboardClient
        productsCount={data.productStats.total}
        groceryCount={data.productStats.grocery}
        hardwareCount={data.productStats.hardware}
        pharmacyCount={data.productStats.pharmacy}
        usersCount={data.usersCount}
        recentAuditLogs={data.recentAuditLogs}
      />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 pb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="metric-card animate-pulse">
            <div className="h-3 w-24 bg-slate-800 rounded mb-3" />
            <div className="h-8 w-16 bg-slate-800 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="metric-card animate-pulse h-48" />
        ))}
      </div>
    </div>
  );
}
