"use client";

import { useState, useEffect, useMemo } from "react";
import { Inbox, CheckCircle, XCircle, Clock, User, Package, Tag, Calendar, AlertCircle, Sparkles, ChevronRight } from "lucide-react";
import { collection, query, orderBy, getDocs, doc, updateDoc, serverTimestamp, addDoc, where } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { notifyCustomerApproved, notifyCustomerRejected } from "@/lib/firebase/notifications";

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
    name?: string;
  };
  status: "pending" | "approved" | "rejected";
  createdAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
  notes?: string;
}

interface GroupedRequest {
  id: string; // use the first request's ID as the main ID
  productName: string;
  category: string;
  details: string;
  imageUrl?: string;
  requestedBy: { uid: string; email: string; name?: string };
  status: "pending" | "approved" | "rejected";
  createdAt: any;
  duplicateCount: number;
  duplicateIds: string[];
}

export default function ProductRequestsPage() {
  const [allRequests, setAllRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Fetch ALL requests so we can group them and show counts in tabs
      const q = query(
        collection(db, "product_requests"),
        orderBy("created_at", "desc")
      );

      const snapshot = await getDocs(q);
      const requestsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          productName: data.product_name || data.productName || "Unknown",
          category: data.category || "Uncategorized",
          sku: data.sku,
          details: data.notes || data.details || "",
          searchQuery: data.searchQuery,
          imageUrl: data.imageUrl || data.image_url,
          requestedBy: {
            uid: data.requested_by_uid || "anonymous",
            email: data.requested_by || data.requestedBy?.email || "anonymous",
            name: data.requested_by_name || data.requestedBy?.name
          },
          status: data.status || "pending",
          createdAt: data.created_at || data.createdAt,
          reviewedAt: data.reviewed_at || data.reviewedAt,
          reviewedBy: data.reviewed_by || data.reviewedBy,
          notes: data.review_notes || data.notes || ""
        };
      }) as ProductRequest[];

      setAllRequests(requestsData);
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (group: GroupedRequest) => {
    if (!confirm(`Approve and add "${group.productName}" to the product catalog?`)) return;

    setProcessing(group.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
      const adminEmail = auth.currentUser?.email || "admin";

      // Approve the primary doc (creates the product)
      const res = await fetch(`${apiUrl}/api/v1/product-requests/${group.id}/approve`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          reviewed_by: adminEmail,
          review_notes: "Approved and added to product catalog",
          create_product: true,
          product_data: {
            name: group.productName,
            category: group.category,
            image_url: group.imageUrl,
            description: group.details || "Product added via crowdsourcing. Details pending."
          }
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to approve request via API");
      }

      // Also reject all duplicate docs (same product submitted multiple times)
      // so they don't remain stuck as phantom pending records
      if (group.duplicateIds.length > 0) {
        await Promise.all(group.duplicateIds.map(dupId =>
          fetch(`${apiUrl}/api/v1/product-requests/${dupId}/reject`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              reviewed_by: adminEmail,
              review_notes: "Duplicate request — resolved via primary approval"
            })
          })
        ));
      }

      await fetchRequests();
      alert("Product approved and added to catalog!");
    } catch (error: any) {
      console.error("Error approving request:", error);
      alert(error.message || "Failed to approve request. Please try again.");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (group: GroupedRequest) => {
    const reason = prompt(`Reject "${group.productName}"? Please provide a reason:`);
    if (!reason) return;

    setProcessing(group.id);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      if (!token) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
      const adminEmail = auth.currentUser?.email || "admin";

      // Reject the primary doc
      const res = await fetch(`${apiUrl}/api/v1/product-requests/${group.id}/reject`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          reviewed_by: adminEmail,
          review_notes: reason
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to reject request via API");
      }

      // Also reject all duplicate docs so none remain as phantom pending records
      if (group.duplicateIds.length > 0) {
        await Promise.all(group.duplicateIds.map(dupId =>
          fetch(`${apiUrl}/api/v1/product-requests/${dupId}/reject`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              reviewed_by: adminEmail,
              review_notes: `Duplicate request — ${reason}`
            })
          })
        ));
      }

      await fetchRequests();
      alert("Product request rejected.");
    } catch (error: any) {
      console.error("Error rejecting request:", error);
      alert(error.message || "Failed to reject request. Please try again.");
    } finally {
      setProcessing(null);
    }
  };

  // Group the requests
  const groupedRequests = useMemo(() => {
    const groups = new Map<string, GroupedRequest>();
    
    // Filter first before grouping so we only group within the active tab
    const filtered = filter === "all" 
      ? allRequests 
      : allRequests.filter(r => r.status === filter);

    filtered.forEach(req => {
      const key = `${req.productName.toLowerCase().trim()}|${req.requestedBy.email}|${req.status}`;
      
      if (groups.has(key)) {
        const existing = groups.get(key)!;
        existing.duplicateCount += 1;
        existing.duplicateIds.push(req.id);
      } else {
        groups.set(key, {
          id: req.id,
          productName: req.productName,
          category: req.category,
          details: req.details || "",
          imageUrl: req.imageUrl,
          requestedBy: req.requestedBy,
          status: req.status,
          createdAt: req.createdAt,
          duplicateCount: 1,
          duplicateIds: []
        });
      }
    });

    return Array.from(groups.values());
  }, [allRequests, filter]);

  const counts = {
    pending: allRequests.filter(r => r.status === "pending").length,
    approved: allRequests.filter(r => r.status === "approved").length,
    rejected: allRequests.filter(r => r.status === "rejected").length,
    all: allRequests.length
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
          <Inbox className="w-8 h-8 text-indigo-400" />
          Product Requests
          {counts.pending > 0 && (
            <span className="px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-sm font-medium">
              {counts.pending} Pending
            </span>
          )}
        </h1>
        <p className="text-slate-400">Review and manage crowdsourced product submissions from customers</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-px">
        {[
          { key: "all", label: "All", icon: Package, count: counts.all },
          { key: "pending", label: "Pending", icon: Clock, count: counts.pending },
          { key: "approved", label: "Approved", icon: CheckCircle, count: counts.approved },
          { key: "rejected", label: "Rejected", icon: XCircle, count: counts.rejected },
        ].map(({ key, label, icon: Icon, count }) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`px-5 py-3 font-medium text-sm transition-all flex items-center gap-2 border-b-2 ${
                isActive
                  ? "border-indigo-500 text-white bg-slate-800/30"
                  : "border-transparent text-slate-400 hover:text-slate-300 hover:bg-slate-800/20"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-indigo-400" : ""}`} />
              {label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                isActive ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-500"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="glass-card rounded-xl p-12 border border-white/5 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-3" />
          <p className="text-slate-400">Loading requests...</p>
        </div>
      ) : groupedRequests.length === 0 ? (
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
          {groupedRequests.map((group) => (
            <div key={group.id} className="glass-card rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="p-5 flex flex-col sm:flex-row gap-5">
                
                {/* Left: Image (if any) */}
                {group.imageUrl && (
                  <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden border border-slate-700 bg-slate-800 flex-shrink-0">
                    <img 
                      src={group.imageUrl} 
                      alt={group.productName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                
                {/* Center: Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-white truncate">{group.productName}</h3>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        group.status === "pending"
                          ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-500"
                          : group.status === "approved"
                          ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                          : "bg-red-500/10 border border-red-500/20 text-red-500"
                      }`}
                    >
                      {group.status}
                    </span>
                    {group.duplicateCount > 1 && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold">
                        Submitted {group.duplicateCount}x
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-4">
                    <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> {group.category}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {group.createdAt?.toDate?.()?.toLocaleDateString() || "N/A"}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer Info */}
                    <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5"><User className="w-3 h-3" /> Requested By</p>
                      {group.requestedBy.name && group.requestedBy.name !== "Anonymous User" ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-200">{group.requestedBy.name}</span>
                          <span className="text-xs text-slate-400">{group.requestedBy.email}</span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-slate-300">{group.requestedBy.email}</span>
                      )}
                    </div>

                    {/* Notes */}
                    {group.details && (
                      <div className="bg-indigo-500/5 rounded-lg p-3 border border-indigo-500/10">
                        <p className="text-[10px] text-indigo-400/80 uppercase tracking-wider mb-1">Customer Notes</p>
                        <p className="text-sm text-slate-300 line-clamp-2" title={group.details}>"{group.details}"</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Actions */}
                {group.status === "pending" && (
                  <div className="flex sm:flex-col gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l border-slate-800 sm:pl-5">
                    <button
                      onClick={() => handleApprove(group)}
                      disabled={processing === group.id}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {processing === group.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400" />
                      ) : (
                        <><CheckCircle className="w-4 h-4" /> Approve</>
                      )}
                    </button>
                    <button
                      onClick={() => handleReject(group)}
                      disabled={processing === group.id}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-red-500/10 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/20 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Banner */}
      <div className="glass-card rounded-xl p-6 border border-indigo-500/20 bg-indigo-500/5 mt-8">
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
