import { Suspense } from "react";
import { ShieldAlert, Package } from "lucide-react";
import AdminProductTable from "@/components/admin/AdminProductTable";
import AdminStats from "@/components/admin/AdminStats";
import ErrorState from "@/components/admin/ErrorState";

// Server-side data fetching function
async function getProducts() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const response = await fetch(`${apiUrl}/api/v1/products`, {
      cache: 'no-store', // Always fetch fresh data
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.products || [];
  } catch (error) {
    console.error('[Admin Page] Error fetching products:', error);
    throw error;
  }
}

// Server Component (default)
export default async function AdminDashboard() {
  let products = [];
  let fetchError = null;

  try {
    products = await getProducts();
    // Sort products by name
    products.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
  } catch (error) {
    fetchError = error instanceof Error ? error.message : 'Failed to load products';
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-indigo-500" />
            Super Admin Control Panel
          </h1>
          <p className="text-slate-400">Manage the centralized DaaS platform, APIs, and Master Catalog.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <Suspense fallback={<StatsLoadingSkeleton />}>
        <AdminStats productsCount={products.length} />
      </Suspense>

      {/* Product Table */}
      <div className="glass-card rounded-xl overflow-hidden mt-8 border border-white/5">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-400" />
            Master Product Catalog
          </h3>
        </div>

        {fetchError ? (
          <ErrorState error={fetchError} />
        ) : (
          <Suspense fallback={<TableLoadingSkeleton />}>
            <AdminProductTable initialProducts={products} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

// Loading Skeletons
function StatsLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl p-6 border border-white/5 animate-pulse">
          <div className="h-4 bg-slate-800 rounded w-24 mb-2"></div>
          <div className="h-8 bg-slate-800 rounded w-16"></div>
        </div>
      ))}
    </div>
  );
}

function TableLoadingSkeleton() {
  return (
    <div className="p-8">
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 animate-pulse">
            <div className="w-10 h-10 bg-slate-800 rounded"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-800 rounded w-48"></div>
              <div className="h-3 bg-slate-800 rounded w-32"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
