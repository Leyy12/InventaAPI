"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { useAuth } from "@/lib/firebase/auth-context";
import { ShoppingCart, Pill, Hammer, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import Image from "next/image";

// ─────────────────────────────────────────────────────────────────────────────
// Segment definitions — values MUST match the product `segment` field exactly
// ─────────────────────────────────────────────────────────────────────────────
const SEGMENTS = [
  {
    id: "Grocery" as const,
    label: "Grocery",
    sublabel: "Supermarkets, sari-sari stores, wet markets, convenience stores",
    icon: ShoppingCart,
    color: "from-blue-500 to-cyan-500",
    borderColor: "border-blue-500/50",
    bgColor: "bg-blue-500/10",
    checkColor: "bg-blue-500",
    selectedBorder: "border-blue-400",
    selectedGlow: "shadow-blue-500/20",
  },
  {
    id: "Pharmacy" as const,
    label: "Pharmacy",
    sublabel: "Drugstores, medical supply shops, health & wellness stores",
    icon: Pill,
    color: "from-green-500 to-emerald-500",
    borderColor: "border-green-500/50",
    bgColor: "bg-green-500/10",
    checkColor: "bg-green-500",
    selectedBorder: "border-green-400",
    selectedGlow: "shadow-green-500/20",
  },
  {
    id: "Hardware" as const,
    label: "Hardware",
    sublabel: "Construction supplies, tools, building materials, electrical",
    icon: Hammer,
    color: "from-orange-500 to-amber-500",
    borderColor: "border-orange-500/50",
    bgColor: "bg-orange-500/10",
    checkColor: "bg-orange-500",
    selectedBorder: "border-orange-400",
    selectedGlow: "shadow-orange-500/20",
  },
] as const;

type SegmentId = "Grocery" | "Pharmacy" | "Hardware";

export default function WelcomePage() {
  const router = useRouter();
  const { refreshUserDoc } = useAuth();
  const [selected, setSelected] = useState<SegmentId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selected) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("Your session has expired. Please log in again.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Write selectedSegment to the user's Firestore document.
      // This is allowed by Firestore rules (selectedSegment is not a protected field).
      await updateDoc(doc(db, "users", currentUser.uid), {
        selectedSegment: selected,
      });

      // Refresh the auth context so the dashboard + products restriction pick up
      // the newly selected segment immediately (no stale appUser in this session).
      await refreshUserDoc();

      // Navigate to Products — the user has completed onboarding, so they may now
      // enter the dashboard. The fullscreen welcome will no longer show.
      router.push("/dashboard/products");
    } catch (err: any) {
      console.error("[Welcome] Failed to save segment:", err);
      setError("Failed to save your selection. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <Image
              src="/inventa-logo.png"
              alt="InventaAPI Logo"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-medium text-indigo-400 mb-4">
            <Sparkles className="w-3 h-3" />
            Quick Setup — Step 1 of 1
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-3">
            Welcome to InventaAPI
          </h1>
          <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
            To get started on the <span className="text-white font-medium">Free plan</span>, select the
            business segment that best describes your store. Your product catalog will be
            tailored to this selection.
          </p>
        </div>

        {/* Segment Cards */}
        <div className="grid gap-4 mb-8">
          {SEGMENTS.map((seg) => {
            const Icon = seg.icon;
            const isSelected = selected === seg.id;

            return (
              <button
                key={seg.id}
                onClick={() => setSelected(seg.id)}
                className={`relative glass-card rounded-2xl p-5 text-left transition-all duration-200 border-2 w-full hover:scale-[1.01] group ${
                  isSelected
                    ? `${seg.selectedBorder} shadow-xl ${seg.selectedGlow}`
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div
                    className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected
                        ? `bg-gradient-to-br ${seg.color} shadow-lg`
                        : `${seg.bgColor} border ${seg.borderColor}`
                    }`}
                  >
                    <Icon
                      className={`w-7 h-7 ${
                        isSelected ? "text-white" : "text-slate-400 group-hover:text-slate-300"
                      }`}
                    />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-white mb-0.5">{seg.label}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{seg.sublabel}</p>
                  </div>

                  {/* Check indicator */}
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected
                        ? `${seg.checkColor} border-transparent`
                        : "border-slate-600 bg-slate-800"
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Info note */}
        <div className="flex items-start gap-3 rounded-xl bg-slate-800/60 border border-slate-700 p-4 mb-6 text-sm text-slate-400">
          <span className="text-indigo-400 font-bold text-base mt-0.5">ℹ</span>
          <span>
            Your product catalog will only show items from your selected segment on the Free plan.
            You can change this later in{" "}
            <span className="text-slate-300 font-medium">Settings → Business Segment</span>.
            Upgrade to <span className="text-indigo-400 font-medium">Pro</span> to unlock all segments.
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <span className="font-bold">⚠</span> {error}
          </div>
        )}

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="w-full py-4 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-base transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
              Saving your selection...
            </>
          ) : (
            <>
              {selected ? `Continue with ${selected}` : "Select a segment to continue"}
              {selected && <ArrowRight className="w-5 h-5" />}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
