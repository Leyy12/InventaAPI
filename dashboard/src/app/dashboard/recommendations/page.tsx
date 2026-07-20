"use client";

import { useState, useEffect } from "react";
import { Sparkles, Check, X, PackagePlus } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { appUser } = useAuth();

  const fetchRecommendations = async () => {
    if (!appUser) return;
    setLoading(true);
    try {
      let mappedType = appUser.businessSegment.toLowerCase();
      if (mappedType.includes("hardware")) mappedType = "hardware";
      else if (mappedType.includes("grocery")) mappedType = "grocery";
      else if (mappedType.includes("pharmacy")) mappedType = "pharmacy";
      else if (mappedType.includes("clothing")) mappedType = "clothing";
      else mappedType = "hardware";

      let url = "/api/v1/products/recommendations/list";
      if (appUser.role !== "Admin" && appUser.role !== "Super Admin") {
        url += `?businessType=${encodeURIComponent(mappedType)}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      const list = data.recommendations || [];
      
      list.sort((a: any, b: any) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA;
      });
      setRecommendations(list);
    } catch (err) {
      console.error("Error fetching recommendations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
    // Poll every 5 seconds for updates
    const interval = setInterval(fetchRecommendations, 5000);
    return () => clearInterval(interval);
  }, [appUser]);

  const handleApprove = async (rec: any) => {
    if (!appUser) return;
    try {
      let mappedType = appUser.businessSegment.toLowerCase();
      if (mappedType.includes("hardware")) mappedType = "hardware";
      else if (mappedType.includes("grocery")) mappedType = "grocery";
      else if (mappedType.includes("pharmacy")) mappedType = "pharmacy";
      else if (mappedType.includes("clothing")) mappedType = "clothing";
      else mappedType = "hardware";

      // 1. Add to products collection via Express API
      const pRes = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: rec.barcode || "",
          name: rec.suggestedName || `Product ${rec.barcode}`,
          nameLower: (rec.suggestedName || `Product ${rec.barcode}`).toLowerCase(),
          price: 0,
          stock: 0,
          category: "Uncategorized",
          businessType: rec.businessType || mappedType,
        })
      });
      if (!pRes.ok) throw new Error("Failed to add product");
      
      // 2. Update recommendation status via Express API
      await fetch(`/api/v1/products/recommendations/${rec.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" })
      });
      
      fetchRecommendations();
    } catch (err: any) {
      alert("Error approving: " + err.message);
    }
  };

  const handleIgnore = async (id: string) => {
    try {
      await fetch(`/api/v1/products/recommendations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ignored" })
      });
      fetchRecommendations();
    } catch (err: any) {
      alert("Error ignoring: " + err.message);
    }
  };

  // Mock function to add a test recommendation
  const addTestRecommendation = async () => {
    if (!appUser?.businessSegment) return;
    try {
      let mappedType = appUser.businessSegment.toLowerCase();
      if (mappedType.includes("hardware")) mappedType = "hardware";
      else if (mappedType.includes("grocery")) mappedType = "grocery";
      else if (mappedType.includes("pharmacy")) mappedType = "pharmacy";
      else if (mappedType.includes("clothing")) mappedType = "clothing";
      else mappedType = "hardware";

      const mockBarcode = "8402" + Math.floor(Math.random() * 10000);
      await fetch("/api/v1/products/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: mockBarcode,
          suggestedName: "Unknown Item " + mockBarcode,
          businessType: mappedType,
        })
      });
      fetchRecommendations();
    } catch (err: any) {
      alert("Error adding test data: " + err.message);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-amber-400" />
            Recommendations
          </h1>
          <p className="text-slate-400">Manage intelligent product acquisition suggestions.</p>
        </div>
        <button onClick={addTestRecommendation} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm border border-slate-700 transition flex gap-2 items-center">
          <PackagePlus className="w-4 h-4" /> Simulate POS Scan
        </button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden border border-slate-700/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/50 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Barcode</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Suggested Name</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-3"></div>
                    <p className="text-sm font-medium">Loading recommendations...</p>
                  </td>
                </tr>
              ) : recommendations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">No recommendations found</p>
                    <p className="text-xs mt-1">When cashiers scan unregistered barcodes, they will appear here.</p>
                  </td>
                </tr>
              ) : (
                recommendations.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4">
                      <span className="text-sm font-mono text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20">{rec.barcode}</span>
                    </td>
                    <td className="p-4 text-sm text-slate-200">
                      {rec.suggestedName || "Unknown Product"}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        rec.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                        rec.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {rec.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {rec.timestamp ? new Date(rec.timestamp).toLocaleDateString() : "Just now"}
                    </td>
                    <td className="p-4 text-right">
                      {rec.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleApprove(rec)}
                            className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 rounded transition-colors"
                            title="Approve & Add to Inventory"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleIgnore(rec.id)}
                            className="p-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded transition-colors"
                            title="Ignore"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
