"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  PackageSearch,
  AlertTriangle,
  ChevronDown,
  PieChart as PieIcon,
  LayoutGrid,
  DollarSign,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from "recharts";
import { useAuth } from "@/lib/firebase/auth-context";

type Category = "All" | "Hardware" | "Grocery" | "Pharmacy";

const CATEGORY_COLORS: Record<string, string> = {
  Hardware: "#f97316",
  Grocery: "#3b82f6",
  Pharmacy: "#22c55e",
};

const PRICE_BUCKET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a78bfa",
  "#c4b5fd",
  "#ddd6fe",
];

/* ── Custom Tooltip ─────────────────────────────── */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 shadow-2xl text-sm">
        {label && <p className="text-slate-400 mb-1 font-medium">{label}</p>}
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
            {p.name ? `${p.name}: ` : ""}
            {typeof p.value === "number"
              ? p.name?.toLowerCase().includes("value") || p.dataKey === "value"
                ? `₱${p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : p.value.toLocaleString()
              : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

/* ── Skeleton Card ──────────────────────────────── */
function SkeletonChart({ height = "h-64" }: { height?: string }) {
  return (
    <div className={`${height} rounded-xl bg-slate-800/50 animate-pulse flex flex-col gap-3 p-6`}>
      <div className="h-4 bg-slate-700/60 rounded w-1/3" />
      <div className="flex-1 flex items-end gap-3 pt-4">
        {[60, 90, 45, 75, 55, 80].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-slate-700/40 rounded-t"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Empty State ────────────────────────────────── */
function EmptyChart({ category }: { category: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
        <BarChart3 className="w-7 h-7 text-slate-600" />
      </div>
      <p className="text-slate-400 font-medium text-sm">No data available for this category</p>
      <p className="text-slate-600 text-xs">{category} has no products yet</p>
    </div>
  );
}

/* ── Chart Card Wrapper ─────────────────────────── */
function ChartCard({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  isFiltering,
  hasData,
  category,
  children,
}: {
  title: string;
  subtitle: string;
  icon: any;
  iconColor: string;
  isFiltering: boolean;
  hasData: boolean;
  category: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl p-6 border border-slate-700/60 transition-all duration-300">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {isFiltering ? (
        <SkeletonChart />
      ) : !hasData ? (
        <EmptyChart category={category} />
      ) : (
        <div className="transition-opacity duration-300">{children}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Main Page
═══════════════════════════════════════════════════ */
export default function AnalyticsPage() {
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category>("All");
  const { appUser } = useAuth();

  /* ── Fetch products once ── */
  useEffect(() => {
    if (!appUser) return;
    let isMounted = true;

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const { getAllProducts } = await import("@/lib/firebase/products-service");
        const data = await getAllProducts();
        if (isMounted) setAllProducts(data as any[]);
      } catch (err) {
        console.error("[Analytics] Error fetching products:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProducts();
    return () => { isMounted = false; };
  }, [appUser]);

  /* ── Smooth skeleton transition on category change ── */
  const handleCategoryChange = (cat: Category) => {
    setIsFiltering(true);
    setTimeout(() => {
      setSelectedCategory(cat);
      setIsFiltering(false);
    }, 420);
  };

  /* ── Filtered products ── */
  const products = useMemo(() => {
    if (selectedCategory === "All") return allProducts;
    return allProducts.filter((p) => p.segment === selectedCategory);
  }, [allProducts, selectedCategory]);

  /* ── KPI stats ── */
  const totalProducts = products.length;
  const totalValue = products.reduce(
    (sum, p) => sum + (p.price || 0) * (p.stock || 0),
    0
  );
  const outOfStock = products.filter((p) => (p.stock || 0) <= 0).length;
  const lowStock = products.filter(
    (p) => (p.stock || 0) > 0 && (p.stock || 0) <= 10
  ).length;

  /* ── Chart 1: Price Distribution (bar) ── */
  const priceDistribution = useMemo(() => {
    const buckets = [
      { range: "₱0–50", min: 0, max: 50, count: 0 },
      { range: "₱51–100", min: 51, max: 100, count: 0 },
      { range: "₱101–500", min: 101, max: 500, count: 0 },
      { range: "₱501–1k", min: 501, max: 1000, count: 0 },
      { range: "₱1k+", min: 1001, max: Infinity, count: 0 },
    ];
    products.forEach((p) => {
      const price = p.price || 0;
      const bucket = buckets.find((b) => price >= b.min && price <= b.max);
      if (bucket) bucket.count++;
    });
    return buckets.map((b, i) => ({
      range: b.range,
      count: b.count,
      fill: PRICE_BUCKET_COLORS[i],
    }));
  }, [products]);

  /* ── Chart 2: Stock by Category (bar) — always use all products ── */
  const stockByCategory = useMemo(() => {
    const segments = ["Hardware", "Grocery", "Pharmacy"];
    return segments.map((seg) => ({
      category: seg,
      stock: allProducts
        .filter((p) => p.segment === seg)
        .reduce((s, p) => s + (p.stock || 0), 0),
      products: allProducts.filter((p) => p.segment === seg).length,
      fill: CATEGORY_COLORS[seg],
    }));
  }, [allProducts]);

  /* ── Chart 3: Category Breakdown (donut) ── */
  const categoryBreakdown = useMemo(() => {
    if (selectedCategory !== "All") {
      // Show category breakdown of a single segment (by sub-category field)
      const catCount: Record<string, number> = {};
      products.forEach((p) => {
        const cat = p.category || "Uncategorized";
        catCount[cat] = (catCount[cat] || 0) + 1;
      });
      return Object.entries(catCount)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
    }
    return [
      {
        name: "Hardware",
        value: allProducts.filter((p) => p.segment === "Hardware").length,
      },
      {
        name: "Grocery",
        value: allProducts.filter((p) => p.segment === "Grocery").length,
      },
      {
        name: "Pharmacy",
        value: allProducts.filter((p) => p.segment === "Pharmacy").length,
      },
    ].filter((d) => d.value > 0);
  }, [allProducts, products, selectedCategory]);

  const donutColors =
    selectedCategory === "All"
      ? [CATEGORY_COLORS.Hardware, CATEGORY_COLORS.Grocery, CATEGORY_COLORS.Pharmacy]
      : ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#e0e7ff", "#4f46e5", "#4338ca"];

  /* ── Chart 4: Top 5 Products by Inventory Value (horizontal bar) ── */
  const top5Products = useMemo(() => {
    return [...products]
      .map((p) => ({
        name:
          p.name?.length > 20 ? p.name.substring(0, 20) + "…" : p.name || "Unknown",
        value: (p.price || 0) * (p.stock || 0),
        segment: p.segment,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [products]);

  /* ── Render ── */
  if (loading) {
    return (
      <div className="space-y-8 pb-10">
        <div>
          <div className="h-8 bg-slate-800 rounded-lg w-48 animate-pulse mb-3" />
          <div className="h-4 bg-slate-800/60 rounded w-72 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-6 animate-pulse">
              <div className="h-3 bg-slate-800 rounded w-3/4 mb-3" />
              <div className="h-8 bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <SkeletonChart key={i} height="h-80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-400" />
            Analytics
          </h1>
          <p className="text-slate-400">
            Deep dive into your inventory insights and product statistics.
          </p>
        </div>

        {/* Category Dropdown */}
        <div className="relative">
          <select
            id="analytics-category-filter"
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value as Category)}
            className="appearance-none pl-4 pr-10 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm font-medium text-slate-200
                       focus:outline-none focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20
                       hover:bg-slate-700/80 hover:border-slate-600 transition-all cursor-pointer min-w-[200px]"
          >
            <option value="All">All Categories</option>
            <option value="Hardware">Hardware</option>
            <option value="Grocery">Grocery</option>
            <option value="Pharmacy">Pharmacy</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Active category badge */}
      {selectedCategory !== "All" && (
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${
          selectedCategory === "Pharmacy"
            ? "bg-green-500/10 text-green-400 border-green-500/25"
            : selectedCategory === "Hardware"
            ? "bg-orange-500/10 text-orange-400 border-orange-500/25"
            : "bg-blue-500/10 text-blue-400 border-blue-500/25"
        }`}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{
            backgroundColor:
              selectedCategory === "Pharmacy" ? "#22c55e" :
              selectedCategory === "Hardware" ? "#f97316" : "#3b82f6"
          }} />
          Viewing: {selectedCategory} ({totalProducts} products)
        </div>
      )}

      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Products",
            value: isFiltering ? "—" : totalProducts.toLocaleString(),
            icon: PackageSearch,
            iconBg: "bg-blue-500/10",
            iconColor: "text-blue-400",
            valueColor: "text-white",
            sub: "Active SKUs in catalog",
          },
          {
            label: "Inventory Value",
            value: isFiltering
              ? "—"
              : `₱${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: DollarSign,
            iconBg: "bg-emerald-500/10",
            iconColor: "text-emerald-400",
            valueColor: "text-emerald-400",
            sub: "Total estimated value",
          },
          {
            label: "Out of Stock",
            value: isFiltering ? "—" : outOfStock.toLocaleString(),
            icon: AlertTriangle,
            iconBg: "bg-red-500/10",
            iconColor: "text-red-400",
            valueColor: outOfStock > 0 ? "text-red-400" : "text-white",
            sub: "Items with 0 inventory",
          },
          {
            label: "Low Stock",
            value: isFiltering ? "—" : lowStock.toLocaleString(),
            icon: TrendingUp,
            iconBg: "bg-amber-500/10",
            iconColor: "text-amber-400",
            valueColor: lowStock > 0 ? "text-amber-400" : "text-white",
            sub: "Items with ≤10 units",
          },
        ].map(({ label, value, icon: Icon, iconBg, iconColor, valueColor, sub }) => (
          <div
            key={label}
            className="glass-card p-5 rounded-xl border border-slate-700/60 transition-all duration-300"
          >
            <div className="flex justify-between items-start mb-3">
              <p className="text-xs font-medium text-slate-400">{label}</p>
              <div className={`p-2 ${iconBg} rounded-lg`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
            </div>
            <h3 className={`text-2xl font-bold ${valueColor} transition-all duration-300 ${isFiltering ? "opacity-40" : "opacity-100"}`}>
              {value}
            </h3>
            <p className="text-xs text-slate-600 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Charts Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Chart 1: Price Distribution */}
        <ChartCard
          title="Price Distribution"
          subtitle="Products grouped by price range"
          icon={BarChart3}
          iconColor="bg-indigo-500/10 text-indigo-400"
          isFiltering={isFiltering}
          hasData={priceDistribution.some((b) => b.count > 0)}
          category={selectedCategory}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={priceDistribution}
              margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="range"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="count" name="Products" radius={[6, 6, 0, 0]} maxBarSize={50}>
                {priceDistribution.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 2: Stock by Category (always shows all 3 categories) */}
        <ChartCard
          title="Stock Levels by Category"
          subtitle="Total inventory units per segment"
          icon={LayoutGrid}
          iconColor="bg-blue-500/10 text-blue-400"
          isFiltering={isFiltering}
          hasData={stockByCategory.some((c) => c.stock > 0)}
          category={selectedCategory}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={stockByCategory}
              margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="category"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="stock" name="Stock Units" radius={[6, 6, 0, 0]} maxBarSize={70}>
                {stockByCategory.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} fillOpacity={selectedCategory === "All" || selectedCategory === entry.category ? 0.85 : 0.25} />
                ))}
                <LabelList
                  dataKey="products"
                  position="top"
                  formatter={(v: any) => `${v} SKUs`}
                  style={{ fill: "#64748b", fontSize: 10 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 3: Category / Sub-category Breakdown (Donut) */}
        <ChartCard
          title={selectedCategory === "All" ? "Category Breakdown" : `${selectedCategory} — Sub-categories`}
          subtitle={selectedCategory === "All" ? "Share of products per segment" : "Distribution by product category"}
          icon={PieIcon}
          iconColor="bg-purple-500/10 text-purple-400"
          isFiltering={isFiltering}
          hasData={categoryBreakdown.length > 0 && categoryBreakdown.some((d) => d.value > 0)}
          category={selectedCategory}
        >
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={categoryBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                animationBegin={0}
                animationDuration={600}
              >
                {categoryBreakdown.map((_, index) => (
                  <Cell
                    key={index}
                    fill={donutColors[index % donutColors.length]}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 4: Top 5 Products by Inventory Value (horizontal bar) */}
        <ChartCard
          title="Top 5 by Inventory Value"
          subtitle="Highest value products (price × stock)"
          icon={TrendingUp}
          iconColor="bg-emerald-500/10 text-emerald-400"
          isFiltering={isFiltering}
          hasData={top5Products.length > 0}
          category={selectedCategory}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              layout="vertical"
              data={top5Products}
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`
                }
              />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="value" name="Inventory Value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {top5Products.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={CATEGORY_COLORS[entry.segment] || "#6366f1"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
