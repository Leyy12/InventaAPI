"use client";

import { useState, useEffect } from "react";
import { BookOpen, Plus, Trash2, Edit2, CheckCircle2 } from "lucide-react";
import { collection, getDocs, query, orderBy, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "categories"), orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      setCategories(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await addDoc(collection(db, "categories"), {
        name: newCatName.trim(),
        description: newCatDesc.trim(),
        createdAt: serverTimestamp()
      });
      setNewCatName("");
      setNewCatDesc("");
      fetchCategories();
    } catch (error) {
      console.error("Error adding category:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this category?")) {
      try {
        await deleteDoc(doc(db, "categories", id));
        fetchCategories();
      } catch (error) {
        console.error("Error deleting category:", error);
      }
    }
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-indigo-500" />
          Master Categories
        </h1>
        <p className="text-slate-400">Manage overarching product categories and segment definitions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 glass-card rounded-xl border border-white/5 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/30 border-b border-slate-800/60">
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category Name</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</th>
                <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mb-2"></div>
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">No categories found. Create one to get started.</td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="p-4">
                      <span className="text-sm font-bold text-slate-200">{cat.name}</span>
                    </td>
                    <td className="p-4 text-sm text-slate-400">{cat.description || "N/A"}</td>
                    <td className="p-4 text-right">
                      <button onClick={() => handleDelete(cat.id)} className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-card rounded-xl p-6 border border-white/5 h-fit">
          <h2 className="text-lg font-bold text-white mb-4">Add New Category</h2>
          <form onSubmit={handleAddCategory} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Name *</label>
              <input type="text" required value={newCatName} onChange={e => setNewCatName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" placeholder="e.g. Electronics" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Description</label>
              <textarea rows={3} value={newCatDesc} onChange={e => setNewCatDesc(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-none" placeholder="Brief description..." />
            </div>
            <button type="submit" className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Add Category
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
