"use client";

import { useState } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { Shield, Download, Trash2, AlertTriangle, FileJson } from "lucide-react";
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export default function PrivacySettingsPage() {
  const { user, appUser, logout } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDownloadData = async () => {
    if (!user || !appUser) return;
    setDownloading(true);
    
    try {
      // 1. Fetch API Keys
      let apiKeys = [];
      try {
        const token = await user.getIdToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
        const keysRes = await fetch(`${apiUrl}/api/v1/api-keys?userId=${user.uid}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          apiKeys = keysData.keys || [];
        }
      } catch (err) {
        console.error("Failed to fetch API keys for export:", err);
      }

      // 2. Fetch Product Requests
      let productRequests: any[] = [];
      try {
        const reqQuery = query(collection(db, "product_requests"), where("requested_by_uid", "==", user.uid));
        const reqSnap = await getDocs(reqQuery);
        productRequests = reqSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (err) {
        console.error("Failed to fetch product requests for export:", err);
      }

      // Compile Data
      const exportData = {
        profile: appUser,
        apiKeys,
        productRequests,
        exportedAt: new Date().toISOString(),
        compliance: "Data Privacy Act of 2012 (RA 10173)"
      };

      // Trigger Download
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `inventaapi_data_export_${user.uid}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (error) {
      console.error("Error exporting data:", error);
      alert("Failed to export your data. Please try again later.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    
    try {
      // 1. Mark account as deletion requested
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        deletionRequested: true,
        deletionRequestedAt: serverTimestamp(),
        status: "pending_deletion"
      });

      // 2. Revoke API Keys
      try {
        const token = await user.getIdToken();
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
        
        // Fetch keys first
        const keysRes = await fetch(`${apiUrl}/api/v1/api-keys?userId=${user.uid}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          const apiKeys = keysData.keys || [];
          
          // Delete each key
          for (const key of apiKeys) {
            await fetch(`${apiUrl}/api/v1/api-keys/${key.id}`, {
              method: "DELETE",
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ userId: user.uid })
            });
          }
        }
      } catch (err) {
        console.error("Failed to revoke API keys during deletion:", err);
      }

      // 3. Log out
      alert("Your account has been marked for deletion. You will now be signed out.");
      await logout();
      
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Failed to initiate account deletion. Please contact support.");
      setDeleting(false);
    }
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
          <Shield className="w-8 h-8 text-indigo-400" />
          Privacy & Data Settings
        </h1>
        <p className="text-slate-400">Manage your data in compliance with the Data Privacy Act of 2012</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* Download Data Section */}
        <div className="glass-card rounded-xl p-8 border border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Download className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Download My Data</h2>
              <p className="text-sm text-slate-400">Export a copy of your personal data</p>
            </div>
          </div>
          
          <p className="text-slate-300 mb-6 text-sm leading-relaxed">
            Get a complete machine-readable (JSON) copy of your personal profile, subscription details, generated API keys, and crowdsourced product requests.
          </p>

          <button
            onClick={handleDownloadData}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-colors disabled:opacity-50"
          >
            {downloading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <FileJson className="w-5 h-5" />
            )}
            {downloading ? "Preparing Export..." : "Download JSON Archive"}
          </button>
        </div>

        {/* Delete Account Section */}
        <div className="glass-card rounded-xl p-8 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Delete My Account</h2>
              <p className="text-sm text-red-400/80">Permanently remove your data</p>
            </div>
          </div>
          
          <p className="text-slate-300 mb-6 text-sm leading-relaxed">
            Initiating deletion will immediately revoke all your active API keys and sign you out. Your profile and associated data will be queued for permanent removal in accordance with our data retention policy.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-slate-800 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
              Request Account Deletion
            </button>
          ) : (
            <div className="p-4 rounded-lg bg-slate-900 border border-red-500/30 space-y-4">
              <div className="flex items-start gap-3 text-red-400">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm">
                  Are you absolutely sure? This action cannot be undone. All API integrations using your keys will immediately stop working.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Yes, Delete Account"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
