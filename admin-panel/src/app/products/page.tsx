"use client";

import { useState, useEffect, use } from "react";
import { 
  Package, Plus, Edit2, Trash2, ShieldAlert, CheckCircle2, 
  Search, Filter, Download, Upload, Archive, XCircle
} from "lucide-react";
import { collection, getDocs, deleteDoc, doc, query, orderBy, where, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

// A robust client-side CSV export function
const exportCSV = (data: any[], filename: string) => {
  if (data.length === 0) return;
  const headers = ["Barcode", "Name", "Brand", "Category", "Price", "Stock", "Status", "Size", "Color", "Weight", "Description"];
  
  const csvRows = [];
  csvRows.push(headers.join(","));

  for (const row of data) {
    const values = [
      `"${row.barcode || ''}"`,
      `"${(row.name || '').replace(/"/g, '""')}"`,
      `"${(row.attributes?.brand || '').replace(/"/g, '""')}"`,
      `"${(row.category || '').replace(/"/g, '""')}"`,
      row.price || 0,
      row.stock || 0,
      `"${row.status || 'Active'}"`,
      `"${row.size || 'N/A'}"`,
      `"${row.color || 'N/A'}"`,
      `"${row.weight || 'N/A'}"`,
      `"${(row.description || '').replace(/"/g, '""')}"`
    ];
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("hidden", "");
  a.setAttribute("href", url);
  a.setAttribute("download", filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export default function MasterProductCatalogPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [segmentFilter, setSegmentFilter] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State for Add/Edit
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "", barcode: "", brand: "", category: "", price: 0, stock: 0, image: "", 
    size: "Standard", color: "Assorted", weight: "N/A", uom: "pcs", description: "", status: "Active", segment: "Hardware"
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, "products"));
      const dataList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      dataList.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
      setProducts(dataList);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "products", id), {
        status: newStatus,
        is_active: newStatus === "Active",
        updatedAt: serverTimestamp()
      });
      fetchProducts();
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to completely delete this product?")) {
      try {
        await deleteDoc(doc(db, "products", id));
        fetchProducts();
      } catch (error) {
        console.error("Error deleting product:", error);
      }
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        nameLower: formData.name.toLowerCase(),
        barcode: formData.barcode,
        segment: formData.segment,
        businessType: formData.segment.toLowerCase(), // keep for backward compatibility
        category: formData.category,
        description: formData.description,
        price: Number(formData.price),
        stock: Number(formData.stock),
        image_url: formData.image,
        image: formData.image,
        size: formData.size,
        color: formData.color,
        weight: formData.weight,
        uom: formData.uom,
        status: formData.status,
        is_active: formData.status === "Active",
        attributes: { brand: formData.brand },
        updatedAt: serverTimestamp()
      };

      if (isEditing && editId) {
        await updateDoc(doc(db, "products", editId), payload);
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
          variations: []
        });
      }

      setShowAddModal(false);
      setIsEditing(false);
      setEditId(null);
      fetchProducts();
    } catch (err) {
      console.error("Error saving product:", err);
    }
  };

  const openEdit = (p: any) => {
    setIsEditing(true);
    setEditId(p.id);
    setFormData({
      name: p.name || "",
      barcode: p.barcode || "",
      brand: p.attributes?.brand || "",
      category: p.category || "",
      price: p.price || 0,
      stock: p.stock || 0,
      image: p.image_url || p.image || "",
      size: p.size || "",
      color: p.color || "",
      weight: p.weight || "",
      uom: p.uom || "pcs",
      description: p.description || "",
      status: p.status || "Active",
      segment: p.segment || (p.businessType ? p.businessType.charAt(0).toUpperCase() + p.businessType.slice(1) : "Hardware")
    });
    setShowAddModal(true);
  };

  const openAdd = () => {
    setIsEditing(false);
    setEditId(null);
    setFormData({
      name: "", barcode: "", brand: "", category: "", price: 0, stock: 0, image: "", 
      size: "Standard", color: "Assorted", weight: "N/A", uom: "pcs", description: "", status: "Active", segment: "Hardware"
    });
    setShowAddModal(true);
  };

  const handleExport = () => {
    exportCSV(products, `master_catalog.csv`);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.name || "").toLowerCase().includes(search.toLowerCase()) || 
                          (p.barcode || "").includes(search);
    const matchesStatus = statusFilter === "All" || p.status === statusFilter;
    const matchesSegment = segmentFilter === "All" || p.segment === segmentFilter || (p.businessType && p.businessType.toLowerCase() === segmentFilter.toLowerCase());
    return matchesSearch && matchesStatus && matchesSegment;
  });

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
            <Package className="w-8 h-8 text-indigo-500" />
            Master Product Catalog
          </h1>
          <p className="text-slate-400">Manage all products, variations, and approvals across all segments.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 transition-colors flex items-center gap-2 border border-slate-700">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-200 transition-colors flex items-center gap-2 border border-slate-700 opacity-50 cursor-not-allowed" title="Coming soon">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button 
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20 ml-2"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden mt-8 border border-white/5">
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center bg-slate-900/50 gap-4">
          <div className="flex gap-2 flex-wrap">
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="All">All Segments</option>
              <option value="Hardware">Hardware</option>
              <option value="Grocery">Grocery</option>
              <option value="Pharmacy">Pharmacy</option>
            </select>
            {["All", "Active", "Pending", "Rejected", "Archived"].map(status => (
              <button 
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === status ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent'}`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder={`Search products by name or barcode...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product Info</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Specs (Size/Color/Wt)</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pricing & Stock</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                    <p className="text-xs">Loading catalog...</p>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <Package className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm">No products found matching your criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        {product.image_url || product.image ? (
                          <img src={product.image_url || product.image} alt={product.name} className="w-12 h-12 rounded-lg object-cover border border-white/10 shadow-sm" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center">
                            <Package className="w-6 h-6 text-slate-600" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-bold text-slate-200">{product.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-xs text-slate-500 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{product.barcode}</span>
                             <span className="text-[10px] uppercase text-indigo-400 font-medium">{product.attributes?.brand || 'Generic'}</span>
                             <span className="text-[10px] uppercase bg-slate-800 px-1.5 rounded text-slate-300 ml-1">{product.segment || product.businessType}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                       <div className="flex flex-col gap-1">
                          <span className="text-xs text-slate-400"><span className="text-slate-600">Size:</span> {product.size || 'N/A'}</span>
                          <span className="text-xs text-slate-400"><span className="text-slate-600">Color:</span> {product.color || 'N/A'}</span>
                          <span className="text-xs text-slate-400"><span className="text-slate-600">Wt:</span> {product.weight || 'N/A'}</span>
                       </div>
                    </td>
                    <td className="p-4 align-top">
                       <p className="text-sm text-emerald-400 font-bold">₱{Number(product.price).toFixed(2)}</p>
                       <p className="text-xs text-slate-400 mt-1">{product.stock} {product.uom || 'pcs'} left</p>
                    </td>
                    <td className="p-4 align-top">
                      <span className={`text-[10px] px-2 py-1 rounded-full border uppercase font-bold tracking-wider
                        ${product.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                          product.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                          product.status === 'Archived' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 
                          'bg-red-500/10 text-red-400 border-red-500/20'}
                      `}>
                        {product.status || 'Active'}
                      </span>
                    </td>
                    <td className="p-4 text-right align-top">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        
                        {product.status !== 'Active' && (
                          <button onClick={() => handleStatusChange(product.id, 'Active')} className="p-1.5 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors" title="Approve/Activate">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {product.status === 'Pending' && (
                          <button onClick={() => handleStatusChange(product.id, 'Rejected')} className="p-1.5 rounded hover:bg-orange-500/20 text-orange-400 transition-colors" title="Reject">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {product.status !== 'Archived' && (
                          <button onClick={() => handleStatusChange(product.id, 'Archived')} className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 transition-colors" title="Archive">
                            <Archive className="w-4 h-4" />
                          </button>
                        )}

                        <div className="w-px h-4 bg-slate-700 mx-1"></div>

                        <button onClick={() => openEdit(product)} className="p-1.5 rounded hover:bg-slate-700 text-slate-300 transition-colors" title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(product.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
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

      {/* Add/Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="glass-card w-full max-w-3xl rounded-2xl p-6 relative border-indigo-500/30 shadow-2xl my-8">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
               <Package className="w-5 h-5 text-indigo-400" /> {isEditing ? 'Edit Product' : 'Add New Product'}
            </h2>
            <form onSubmit={handleSaveProduct} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-indigo-400 border-b border-slate-800 pb-2">Basic Info</h3>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Product Name *</label>
                    <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Barcode / SKU *</label>
                      <input type="text" required value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Brand</label>
                      <input type="text" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Segment</label>
                      <select value={formData.segment} onChange={e => setFormData({...formData, segment: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
                        <option value="Hardware">Hardware</option>
                        <option value="Pharmacy">Pharmacy</option>
                        <option value="Grocery">Grocery</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Sub-Category</label>
                      <input type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Status</label>
                      <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
                        <option value="Active">Active</option>
                        <option value="Pending">Pending</option>
                        <option value="Archived">Archived</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Description</label>
                    <textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-none" />
                  </div>
                </div>

                {/* Specs & Pricing */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-indigo-400 border-b border-slate-800 pb-2">Specs & Pricing</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Price (₱) *</label>
                      <input type="number" required min="0" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Stock *</label>
                      <input type="number" required min="0" value={formData.stock} onChange={e => setFormData({...formData, stock: Number(e.target.value)})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Size / Dimension</label>
                      <input type="text" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Color</label>
                      <input type="text" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Weight</label>
                      <input type="text" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Unit of Measure</label>
                      <input type="text" value={formData.uom} onChange={e => setFormData({...formData, uom: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-medium text-slate-300">Image URL</label>
                    <input type="url" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" placeholder="https://..." />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-800">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-700 transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-colors">
                  {isEditing ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
