"use client";

import { useState } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Settings2, Building2, AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const SEGMENTS = ["Grocery", "Pharmacy", "Hardware"] as const;
type SegmentId = typeof SEGMENTS[number];

export default function SettingsPage() {
  const { appUser, user, loading, refreshUserDoc } = useAuth();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<SegmentId | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="w-full px-6 lg:px-8 space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-slate-800 rounded"></div>
        <div className="h-64 glass-card rounded-xl"></div>
      </div>
    );
  }

  // Only show this setting for Free plan users
  const isFreePlan = appUser?.plan === "Free";

  const handleOpenModal = () => {
    setSelectedSegment(appUser?.selectedSegment as SegmentId | null);
    setIsModalOpen(true);
    setSuccess(false);
    setError(null);
  };

  const handleSaveSegment = async () => {
    if (!selectedSegment || !user) return;
    
    setSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      await updateDoc(doc(db, "users", user.uid), {
        selectedSegment: selectedSegment,
      });
      await refreshUserDoc();
      setSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to update segment:", err);
      setError("Failed to update business segment. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3">
          <Settings2 className="w-8 h-8 text-indigo-400" />
          Settings
        </h1>
        <p className="text-slate-400">Manage your account preferences and configurations.</p>
      </div>

      <div className="glass-card rounded-xl p-6 md:p-8">
        <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-400" />
          Business Configuration
        </h2>

        {isFreePlan ? (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-lg border border-slate-800 bg-slate-900/50">
              <div>
                <h3 className="text-white font-medium mb-1">Business Segment</h3>
                <p className="text-sm text-slate-400 max-w-xl">
                  Your current product catalog is restricted to this segment. 
                  Changing this will immediately update your available products on the dashboard and via the API.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-sm">
                  <span className="text-slate-400">Current:</span>
                  <span className="text-white font-medium">{appUser?.selectedSegment || "None"}</span>
                </div>
              </div>
              <button 
                onClick={handleOpenModal}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700 whitespace-nowrap"
              >
                Change Segment
              </button>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-sm text-indigo-200">
              <span className="text-indigo-400 mt-0.5">ℹ</span>
              <p>
                To unlock all business segments and custom products, consider upgrading to the{" "}
                <Link href="/?choosePlan=true" className="text-indigo-400 font-medium hover:underline">
                  Pro plan
                </Link>.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-lg border border-slate-800 bg-slate-900/50">
            <h3 className="text-white font-medium mb-1">Business Segment</h3>
            <p className="text-sm text-slate-400 mb-3">
              You are on the <span className="text-indigo-400 font-medium">{appUser?.plan}</span> plan. 
              You have unrestricted access to all business segments.
            </p>
          </div>
        )}
      </div>

      {/* Change Segment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2">Change Business Segment</h3>
              <p className="text-sm text-slate-400 mb-6">
                Select the new product segment you want to access.
              </p>

              <div className="space-y-3 mb-6">
                {SEGMENTS.map((seg) => (
                  <button
                    key={seg}
                    onClick={() => setSelectedSegment(seg)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                      selectedSegment === seg 
                        ? "border-indigo-500 bg-indigo-500/10" 
                        : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                    }`}
                  >
                    <span className={`font-medium ${selectedSegment === seg ? "text-indigo-400" : "text-white"}`}>
                      {seg}
                    </span>
                    {selectedSegment === seg && <CheckCircle2 className="w-5 h-5 text-indigo-500" />}
                  </button>
                ))}
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/80 mb-6">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p>
                  <strong>Warning:</strong> Your existing API keys will continue to work, but they will 
                  now only return products from this new segment.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Successfully updated segment!
                </div>
              )}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving || success}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSegment}
                  disabled={saving || success || !selectedSegment || selectedSegment === appUser?.selectedSegment}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
