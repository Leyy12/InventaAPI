"use client";

import { useState } from "react";
import { UploadCloud, CheckCircle, Package } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/firebase/auth-context";
import { useRouter } from "next/navigation";

export default function SubmitProductPage() {
  const { appUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    barcode: "",
    name: "",
    price: "",
    stock: "",
    category: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.businessSegment) {
      alert("Business segment not found. Please login again.");
      return;
    }
    setLoading(true);

    try {
      const response = await fetch("/api/v1/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          barcode: formData.barcode,
          name: formData.name,
          nameLower: formData.name.toLowerCase(),
          price: parseFloat(formData.price),
          stock: parseInt(formData.stock),
          category: formData.category,
          businessType: appUser.businessSegment,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to add product");
      }
      setSuccess(true);
      setFormData({ barcode: "", name: "", price: "", stock: "", category: "" });
      setTimeout(() => setSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error adding document: ", error);
      alert("Error adding product: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
          <UploadCloud className="w-8 h-8 text-emerald-400" />
          Submit Product
        </h1>
        <p className="text-slate-400">Add a new product to your inventory database.</p>
      </div>

      <div className="glass-card rounded-xl p-8 border border-slate-700/60">
        {success ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
            <CheckCircle className="w-16 h-16 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Product Added Successfully!</h2>
            <p className="text-slate-400">The product is now in your inventory.</p>
            <button
              onClick={() => router.push("/dashboard/products")}
              className="mt-4 px-6 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/30 transition"
            >
              View Products
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Barcode</label>
                <input
                  type="text"
                  name="barcode"
                  required
                  value={formData.barcode}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Scan or enter barcode"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Product Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="e.g. Hammer, Paracetamol"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Price (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  name="price"
                  required
                  value={formData.price}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Initial Stock</label>
                <input
                  type="number"
                  name="stock"
                  required
                  value={formData.stock}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Category</label>
              <input
                type="text"
                name="category"
                required
                value={formData.category}
                onChange={handleChange}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="e.g. Hardware, Grocery, Pharmacy"
              />
            </div>

            <div className="pt-4 border-t border-slate-700/50">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Package className="w-5 h-5" />
                {loading ? "Saving Product..." : "Add to Inventory"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
