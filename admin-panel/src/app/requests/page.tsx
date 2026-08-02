"use client";

import { useState, useEffect } from "react";
import { Inbox, CheckCircle, XCircle, Clock, User, Package, Tag, Calendar, AlertCircle, Sparkles } from "lucide-react";
import { collection, query, where, orderBy, getDocs, doc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";

interface ProductRequest {
  id: string;
  productName: string;
  category: string;
  sku?: string;
  details?: string;
  searchQuery?: string;
  imageUrl?: string;
  requestedBy: {
    uid: string;
    email: string;
  };
  status: "pending" | "approved" | "rejected";
  createdAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
  notes?: string;
}

export default function ProductRequestsPage() {
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      let q = query(
        collection(db, "product_requests"),
        orderBy("createdAt", "desc")
      );

      if (filter !== "all") {
        q = query(
          collection(db, "product_requests"),
          where("status", "==", filter),
          orderBy("createdAt", "desc")
        );
      }

      const snapshot = await getDocs(q);
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ProductRequest[];

      setRequests(requestsData);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: ProductRequest) => {
    if (!confirm(`Approve and add "${request.productName}" to the product catalog?`)) return;

    setProcessing(request.id);
    try {
      // 1. Add to products collection
      await addDoc(collection(db, "products"), {
        name: request.productName,
        category: request.category,
        sku: request.sku || `AUTO-${Date.now()}`,
        price: 0, // Admin needs to update this later
        size: null,
        image_url: request.imageUrl || "https://via.placeholder.com/400x400?text=Image+Needed",
        description: request.details || "Product added via crowdsourcing. Details pending.",
        createdAt: serverTimestamp(),
        addedVia: "crowdsourcing",
        requestId: request.id
      });

      // 2. Update request status
      await updateDoc(doc(db, "product_requests", request.id), {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser?.email || "admin",
        notes: "Approved and added to product catalog"
      });

      // 3. Refresh list
      await fetchRequests();
      alert("Product approved and added to catalog!");
    } catch (error) {
      console.error("Error approving request:", error);
      alert("Failed to approve request. Please try again.");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (request: ProductRequest) => {
    const reason = prompt(`Reject "${request.productName}"? Please provide a reason:`);
    if (!reason) return;

    setProcessing(request.id);
    try {
      await updateDoc(doc(db, "product_requests", request.id), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser?.email || "admin",
        notes: reason
      });

      await fetchRequests();
      alert("Product request rejected.");
    } catch (error) {
      console.error("Error rejecting request:", error);
      alert("Failed to reject request. Please try again.");
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
          <Inbox className="w-8 h-8 text-indigo-400" />
          Product Requests
          {pendingCount > 0 && (
            <span className="px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm font-medium">
              {pendingCount} Pending
            </span>
          )}
        </h1>
        <p className="text-slate-400">Review and manage crowdsourced product submissions from customers</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {[
          { key: "pending", label: "Pending", icon: Clock, color: "yellow" },
          { key: "approved", label: "Approved", icon: CheckCircle, color: "emerald" },
          { key: "rejected", label: "Rejected", icon: XCircle, color: "red" },
          { key: "all", label: "All", icon: Package, color: "slate" }
        ].map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
              filter === key
                ? `bg-${color}-500/20 border border-${color}-500/30 text-${color}-400`
                : "bg-slate-800/50 border border-slate-700 text-slate-400 hover:border-slate-600"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="glass-card rounded-xl p-12 border border-white/5 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3" />
          <p className="text-slate-400">Loading requests...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="glass-card rounded-xl p-12 border border-white/5 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-8 h-8 text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No {filter !== "all" ? filter : ""} requests</h3>
          <p className="text-slate-400 text-sm">
            {filter === "pending" 
              ? "All product requests have been reviewed" 
              : `No ${filter} product requests at the moment`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <div key={request.id} className="glass-card rounded-xl border border-white/5 overflow-hidden">
              <div className="p-6">
                <div className="flex items-start justify-between gap-6 mb-4">
                  {request.imageUrl && (
                    <div className="w-32 h-32 rounded-lg overflow-hidden border-2 border-slate-700 flex-shrink-0">
                      <img 
                        src={request.imageUrl} 
                        alt={request.productName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-white">{request.productName}</h3>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          request.status === "pending"
                            ? "bg-yellow-500/20 border border-yellow-500/30 text-yellow-400"
                            : request.status === "approved"
                            ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
                            : "bg-red-500/20 border border-red-500/30 text-red-400"
                        }`}
                      >
                        {request.status.toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-4 h-4" />
                        {request.category}
                      </div>
                      {request.sku && (
                        <div className="flex items-center gap-1.5">
                          <Package className="w-4 h-4" />
                          SKU: {request.sku}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4" />
                        {request.requestedBy.email}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {request.createdAt?.toDate?.()?.toLocaleDateString() || "N/A"}
                      </div>
                    </div>
                  </div>
                </div>

                {request.details && (
                  <div className="mb-4 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                    <p className="text-xs font-medium text-slate-300 mb-1">Additional Details:</p>
                    <p className="text-sm text-slate-400">{request.details}</p>
                  </div>
                )}

                {request.searchQuery && (
                  <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Triggered by search: "{request.searchQuery}"</span>
                  </div>
                )}

                {request.notes && (
                  <div className="mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <p className="text-xs font-medium text-blue-400 mb-1">Review Notes:</p>
                    <p className="text-sm text-slate-300">{request.notes}</p>
                    {request.reviewedBy && (
                      <p className="text-xs text-slate-500 mt-1">
                        Reviewed by {request.reviewedBy} on{" "}
                        {request.reviewedAt?.toDate?.()?.toLocaleDateString() || "N/A"}
                      </p>
                    )}
                  </div>
                )}

                {request.status === "pending" && (
                  <div className="flex gap-3 pt-4 border-t border-slate-800">
                    <button
                      onClick={() => handleApprove(request)}
                      disabled={processing === request.id}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-all flex items-center justify-center gap-2"
                    >
                      {processing === request.id ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Approve & Add to Catalog
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleReject(request)}
                      disabled={processing === request.id}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 font-medium transition-all flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Banner */}
      <div className="glass-card rounded-xl p-6 border border-indigo-500/20 bg-indigo-500/5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">Crowdsourcing Product Data</h4>
            <p className="text-sm text-slate-400 leading-relaxed">
              When customers can't find a product in their catalog, they can submit a request. Approved requests 
              are automatically added to the products collection. Remember to update the price and image URL later 
              for newly added products.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
