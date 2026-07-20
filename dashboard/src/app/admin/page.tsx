"use client";

import { useState, useEffect } from "react";
import { 
  Package, Plus, Edit2, Trash2, ShieldAlert, CheckCircle2, 
  Search, Users, Activity, Settings, Filter, Download
} from "lucide-react";
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/firebase/auth-context";

export default function SuperAdminPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState("");
  const { appUser } = useAuth();

  // For the Master Catalog parent-child variations
  const [formData, setFormData] = useState({
    name: "",
    barcode: "",
    category: "Hardware",
    businessType: "hardware",
    price: 0,
    stock: 0,
    image_url: "",
    variationsRaw: "" // E.g., "Color:Red,Blue|Size:S,M,L"
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/products");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      const dataList = data.products || [];
      dataList.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
      setProducts(dataList);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Parse variations string into structured array if present
      let variations: { type: string; options: string[] }[] = [];
      if (formData.variationsRaw) {
         // simple parser for demo: "Color:Red,Blue|Size:S,M"
         const groups = formData.variationsRaw.split('|');
         variations = groups.map(g => {
           const [key, vals] = g.split(':');
           return { type: key?.trim(), options: vals?.split(',').map(v => v.trim()) || [] };
         });
      }

      await addDoc(collection(db, "products"), {
        name: formData.name,
        nameLower: formData.name.toLowerCase(),
        barcode: formData.barcode,
        category: formData.category,
        businessType: formData.businessType,
        price: Number(formData.price),
        stock: Number(formData.stock),
        image_url: formData.image_url,
        variations: variations,
        createdAt: serverTimestamp(),
      });
      setShowAddModal(false);
      setFormData({
        name: "", barcode: "", category: "Hardware", businessType: "hardware", price: 0, stock: 0, image_url: "", variationsRaw: ""
      });
      fetchProducts();
    } catch (error) {
      console.error("Error adding product:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this master product?")) {
      try {
        await deleteDoc(doc(db, "products", id));
        fetchProducts();
      } catch (error) {
        console.error("Error deleting product:", error);
      }
    }
  };

  const filteredProducts = products.filter(p => 
    (p.name || p.product_name)?.toLowerCase().includes(search.toLowerCase()) || 
    p.barcode?.includes(search)
  );

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-red-500" />
            Super Admin Control Panel
          </h1>
          <p className="text-slate-400">Manage the centralized DaaS platform, APIs, and Master Catalog.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium text-white transition-colors flex items-center gap-2 shadow-lg shadow-red-500/20"
        >
          <Plus className="w-4 h-4" />
          New Master Product
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-6 border border-white/5 relative overflow-hidden group">
          <p className="text-sm font-medium text-slate-400 mb-1">Master Catalog Items</p>
          <h3 className="text-3xl font-bold text-white">{products.length}</h3>
          <Package className="absolute bottom-4 right-4 w-12 h-12 text-white/5" />
        </div>
        <div className="glass-card rounded-xl p-6 border border-amber-500/20 relative overflow-hidden group bg-amber-500/5">
          <p className="text-sm font-medium text-amber-400/80 mb-1">Pending SME Requests</p>
          <h3 className="text-3xl font-bold text-amber-400">2</h3>
          <Activity className="absolute bottom-4 right-4 w-12 h-12 text-amber-500/10" />
        </div>
        <div className="glass-card rounded-xl p-6 border border-emerald-500/20 relative overflow-hidden group bg-emerald-500/5">
          <p className="text-sm font-medium text-emerald-400/80 mb-1">Active SME Consumers</p>
          <h3 className="text-3xl font-bold text-emerald-400">5</h3>
          <Users className="absolute bottom-4 right-4 w-12 h-12 text-emerald-500/10" />
        </div>
        <div className="glass-card rounded-xl p-6 border border-blue-500/20 relative overflow-hidden group bg-blue-500/5">
          <p className="text-sm font-medium text-blue-400/80 mb-1">API Requests (24h)</p>
          <h3 className="text-3xl font-bold text-blue-400">14.2K</h3>
          <Activity className="absolute bottom-4 right-4 w-12 h-12 text-blue-500/10" />
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden mt-8 border border-white/5">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-slate-400" />
            Master Product Catalog
          </h3>
          <div className="flex gap-3">
            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search master catalog..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50"
              />
            </div>
            <button className="px-3 py-1.5 bg-slate-800 rounded-md text-slate-300 text-xs hover:bg-slate-700 flex items-center gap-2"><Filter className="w-3 h-3"/> Filter</button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product & Barcode</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Industry Segment</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Price/Stock</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Variations</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500 mx-auto mb-2"></div>
                    <p className="text-xs">Loading master catalog...</p>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <p className="text-sm">No products found.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {product.image_url || product.image ? (
                          <img src={product.image_url || product.image} alt={product.name} className="w-10 h-10 rounded object-cover border border-white/10" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-slate-800 border border-white/10 flex items-center justify-center">
                            <Package className="w-5 h-5 text-slate-600" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-slate-200">{product.name || product.product_name}</p>
                          <p className="text-xs text-slate-500 font-mono">{product.barcode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                        {product.businessType || product.category}
                      </span>
                    </td>
                    <td className="p-4">
                       <p className="text-sm text-emerald-400 font-medium">₱{product.price}</p>
                       <p className="text-xs text-slate-500">{product.stock} in stock</p>
                    </td>
                    <td className="p-4">
                      {product.variations && product.variations.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(product.variations) ? product.variations.map((v: any, i: number) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              {v.type || v}: {v.options ? v.options.join(', ') : ''}
                            </span>
                          )) : (
                             <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Complex</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">No variants</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(product.id)} className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors border border-red-500/20">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-2xl rounded-2xl p-6 relative border-red-500/30 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
               <Package className="w-5 h-5 text-red-400" /> Add to Master Catalog
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-slate-300">Master Product Name</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500" placeholder="e.g. Classic Cotton T-Shirt" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Base Barcode / SKU</label>
                  <input type="text" required value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Industry Segment</label>
                  <select value={formData.businessType} onChange={e => setFormData({...formData, businessType: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500">
                    <option value="hardware">Hardware</option>
                    <option value="grocery">Grocery / SME Retail</option>
                    <option value="clothing">Clothing / Boutique</option>
                    <option value="electronics">Electronics</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Base Price (₱)</label>
                  <input type="number" required value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Initial Stock</label>
                  <input type="number" required value={formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-slate-300">Image URL</label>
                  <input type="url" value={formData.image_url} onChange={e => setFormData({...formData, image_url: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500" placeholder="https://..." />
                </div>
                
                <div className="space-y-1.5 col-span-2 p-4 rounded-xl bg-slate-900 border border-slate-800">
                   <label className="text-sm font-medium text-slate-200 block mb-2">Parent-Child Variations (Optional)</label>
                   <p className="text-xs text-slate-500 mb-3">Define variations as `Attribute:Option1,Option2`. Separate different attributes with a pipe `|`.</p>
                   <input type="text" value={formData.variationsRaw} onChange={e => setFormData({...formData, variationsRaw: e.target.value})} placeholder="e.g. Color:Black,White,Blue | Size:Small,Medium,Large" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500 font-mono" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-700">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700">Add to Master Catalog</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
