"use client";

import { useState } from "react";
import { 
  Package, Plus, Edit2, Trash2, Search, Filter 
} from "lucide-react";
import { collection, addDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useRouter } from "next/navigation";

interface AdminProductTableProps {
  initialProducts: any[];
}

export default function AdminProductTable({ initialProducts }: AdminProductTableProps) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    sku: "",
    category: "Hardware",
    segment: "Hardware",
    price: 0,
    size: "",
    image_url: "",
    description: "",
    expirationDate: ""
  });
  const [variants, setVariants] = useState<Array<{
    id: string;
    sku: string;
    variantName: string;
    value: string;
    price: number;
    image_url: string;
  }>>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsUploading(true);
      let finalImageUrl = formData.image_url;

      if (imageFile) {
        const storageRef = ref(storage, `products/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        finalImageUrl = await getDownloadURL(snapshot.ref);
      } else if (!finalImageUrl) {
        finalImageUrl = "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800";
      }

      await addDoc(collection(db, "products"), {
        name: formData.name,
        sku: formData.sku,
        category: formData.category,
        segment: formData.segment,
        price: Number(formData.price),
        size: formData.size || null,
        image_url: finalImageUrl,
        description: formData.description || "",
        metadata: {},
        tags: [],
        is_active: true,
        is_featured: false,
        variants: variants.length > 0 ? variants : [],
        expirationDate: formData.expirationDate ? new Date(formData.expirationDate).toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      setShowAddModal(false);
      setFormData({
        name: "", sku: "", category: "Hardware", segment: "Hardware", 
        price: 0, size: "", image_url: "", description: "", expirationDate: ""
      });
      setVariants([]);
      setImageFile(null);
      setImagePreview(null);
      
      // Refresh the page to show new product
      router.refresh();
    } catch (error) {
      console.error("Error adding product:", error);
      alert("Failed to add product. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validate file size (2MB limit)
      const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB in bytes
      if (file.size > MAX_FILE_SIZE) {
        alert('Image file is too large. Please select an image smaller than 2MB.');
        e.target.value = ''; // Clear the file input
        return;
      }
      
      // Validate file type (JPG, PNG, WebP only)
      const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
        alert('Invalid file type. Please upload a JPG, PNG, or WebP image.');
        e.target.value = ''; // Clear the file input
        return;
      }
      
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this product?")) {
      try {
        await deleteDoc(doc(db, "products", id));
        setProducts(products.filter(p => p.id !== id));
      } catch (error) {
        console.error("Error deleting product:", error);
        alert("Failed to delete product. Please try again.");
      }
    }
  };

  const addVariant = () => {
    setVariants([...variants, {
      id: `var_${Date.now()}`,
      sku: "",
      variantName: "",
      value: "",
      price: 0,
      image_url: ""
    }]);
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase()) || 
    p.sku?.includes(search)
  );

  return (
    <>
      {/* Search Bar */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
        <div className="flex gap-3 flex-1 items-center">
          <div className="relative w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search master catalog..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
          <button className="px-3 py-1.5 bg-slate-800 rounded-md text-slate-300 text-xs hover:bg-slate-700 flex items-center gap-2">
            <Filter className="w-3 h-3"/> Filter
          </button>
          {/* Product count badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md">
            <Package className="w-3 h-3 text-indigo-400" />
            <span className="text-xs font-semibold text-indigo-300">
              {filteredProducts.length}
              {search && <span className="text-indigo-400/60"> / {products.length}</span>}
              <span className="text-indigo-400/60 ml-1">products</span>
            </span>
          </div>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white transition-colors flex items-center gap-2 shadow shadow-indigo-500/20"
        >
          <Plus className="w-3.5 h-3.5" />
          New Product
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/30 border-b border-slate-800/60">
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Product & SKU</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Segment</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Price</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Size</th>
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredProducts.length === 0 ? (
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
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded object-cover border border-white/10" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-slate-800 border border-white/10 flex items-center justify-center">
                          <Package className="w-5 h-5 text-slate-600" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-200">{product.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{product.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                      {product.segment}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="text-sm text-emerald-400 font-medium">₱{product.price?.toFixed(2)}</p>
                  </td>
                  <td className="p-4">
                    <span className="text-xs text-slate-400">{product.size || 'N/A'}</span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-all border border-slate-600 hover:border-slate-500"
                        title="Edit product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)} 
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-medium transition-all border border-red-500/20 hover:border-red-500/40"
                        title="Delete product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-2xl rounded-2xl p-6 relative border-indigo-500/30 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-400" /> Add to Master Catalog
            </h2>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-slate-300">Product Name *</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                    placeholder="e.g. Amoxicillin 500mg" 
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">SKU *</label>
                  <input 
                    type="text" 
                    required 
                    value={formData.sku} 
                    onChange={e => setFormData({...formData, sku: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                    placeholder="PH-MED-001"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Segment *</label>
                  <select 
                    value={formData.segment} 
                    onChange={e => setFormData({...formData, segment: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Pharmacy">Pharmacy</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Grocery">Grocery</option>
                  </select>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Price (₱) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    required 
                    value={formData.price} 
                    onChange={e => setFormData({...formData, price: Number(e.target.value)})} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Size</label>
                  <input 
                    type="text" 
                    value={formData.size} 
                    onChange={e => setFormData({...formData, size: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                    placeholder="e.g. 500mg, 1L, 12mm"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Expiration Date</label>
                  <input 
                    type="date" 
                    value={formData.expirationDate} 
                    onChange={e => setFormData({...formData, expirationDate: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                  />
                  <p className="text-[10px] text-slate-500">Optional: For Pharmacy/Grocery items</p>
                </div>
                
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-slate-300">Description</label>
                  <textarea 
                    value={formData.description} 
                    onChange={e => setFormData({...formData, description: e.target.value})} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" 
                    rows={2}
                    placeholder="Brief product description"
                  />
                </div>
                
                {/* Product Variants Section */}
                <div className="space-y-3 col-span-2 border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-medium text-slate-300">Product Variants</label>
                      <p className="text-[10px] text-slate-500 mt-0.5">Optional: Add size/dosage/color variations</p>
                    </div>
                    <button 
                      type="button"
                      onClick={addVariant}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Variant
                    </button>
                  </div>
                  
                  {variants.length > 0 && (
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {variants.map((variant, index) => (
                        <div key={variant.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-slate-400">VARIANT #{index + 1}</span>
                            <button 
                              type="button"
                              onClick={() => removeVariant(index)}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="text"
                              placeholder="Variant Name (e.g. Size, Dosage)"
                              value={variant.variantName}
                              onChange={e => updateVariant(index, 'variantName', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                            <input 
                              type="text"
                              placeholder="Value (e.g. Large, 500mg)"
                              value={variant.value}
                              onChange={e => updateVariant(index, 'value', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                            <input 
                              type="text"
                              placeholder="Variant SKU"
                              value={variant.sku}
                              onChange={e => updateVariant(index, 'sku', e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                            <input 
                              type="number"
                              step="0.01"
                              placeholder="Price (₱)"
                              value={variant.price}
                              onChange={e => updateVariant(index, 'price', Number(e.target.value))}
                              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-slate-300">Product Image *</label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <input 
                        type="file" 
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageChange}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20 transition-all cursor-pointer"
                      />
                    </div>
                    {(imagePreview || formData.image_url) && (
                      <div className="w-16 h-16 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden shrink-0">
                        <img 
                          src={imagePreview || formData.image_url} 
                          alt="Preview" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Upload a real photo (JPG, PNG, or WebP • Max 2MB) to accurately represent this product.</p>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)} 
                  className="px-4 py-2 rounded-lg bg-slate-800 text-sm font-medium text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isUploading}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isUploading ? "Uploading & Saving..." : "Add to Catalog"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
