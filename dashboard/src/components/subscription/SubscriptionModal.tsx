"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check, ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/firebase/auth-context";
import { SUBSCRIPTION_PLANS, PlanId, getCumulativeFeatures } from "@/config/plans";
import EnterpriseContactForm from "./EnterpriseContactForm";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan?: PlanId;
}

// No local plan details needed - using shared config from @/config/plans

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function SubscriptionModal({
  isOpen,
  onClose,
  selectedPlan = "pro",
}: SubscriptionModalProps) {
  const { user, appUser } = useAuth();
  const router = useRouter();

  // Step 1: Plan selection
  // Step 2: Redirecting to GCash (loading state)
  // Step 3: Error state
  // Step 4: Enterprise contact form
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [showEnterpriseForm, setShowEnterpriseForm] = useState(false);

  if (!isOpen) return null;

  const currentPlan = SUBSCRIPTION_PLANS[selectedPlan];
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  // ── HANDLERS ──────────────────────────────────────────────────────────────

  const handleSelectFree = () => {
    // Free plan: no payment needed. User is already on Free from signup.
    // Close modal and redirect to dashboard.
    onClose();
    router.push('/dashboard');
  };

  const handleSelectEnterprise = () => {
    setShowEnterpriseForm(true);
    setStep(4);
  };

  const handleEnterpriseFormClose = () => {
    setShowEnterpriseForm(false);
    setStep(1);
  };

  const handleEnterpriseFormSuccess = () => {
    setShowEnterpriseForm(false);
    setStep(1);
    onClose();
    // Show success message (could be a toast/notification in production)
    alert("Thank you! Your inquiry has been submitted. Our team will contact you within 24 hours.");
  };

  const handleProCheckout = async () => {
    if (!user?.uid) {
      setErrorMessage("You are not logged in. Please log in before subscribing.");
      setStep(3);
      return;
    }

    setStep(2); // Show loading state

    try {
      const response = await fetch(`${API_BASE}/api/v1/checkout/create-gcash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.uid,
          userEmail: user.email || appUser?.email || "",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 409) {
          setErrorMessage(
            `You already have an active Pro subscription expiring on ${
              data.expiresAt
                ? new Date(data.expiresAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "a future date"
            }.`
          );
        } else {
          setErrorMessage(data.error || "Could not create payment session. Please try again.");
        }
        setStep(3);
        return;
      }

      if (!data.checkoutUrl) {
        setErrorMessage("No checkout URL provided. Please try again or contact support.");
        setStep(3);
        return;
      }

      // Redirect to PayMongo hosted GCash payment page
      // After payment, user is redirected to /dashboard?payment=success
      window.location.href = data.checkoutUrl;

    } catch (err) {
      console.error("[SUBSCRIPTION MODAL] Checkout error:", err);
      setErrorMessage(
        "Could not connect to payment server. Please check your internet connection and try again."
      );
      setStep(3);
    }
  };

  const handleContinue = () => {
    if (selectedPlan === "free") return handleSelectFree();
    if (selectedPlan === "enterprise") return handleSelectEnterprise();
    if (selectedPlan === "pro") return handleProCheckout();
  };

  const resetAndClose = () => {
    setStep(1);
    setErrorMessage("");
    onClose();
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={step !== 2 ? resetAndClose : undefined}
      />

      <div className="w-full max-w-lg glass-card rounded-2xl relative z-10 shadow-2xl border border-white/10 bg-slate-900/70 backdrop-blur-md animate-in fade-in zoom-in duration-200 overflow-hidden">
        {/* Header */}
        {step !== 2 && (
          <div className="flex items-center justify-between px-6 pt-6 pb-0">
            <div>
              <h2 className="text-xl font-bold text-white">
                {step === 1 ? "Choose Your Plan" : "Something Went Wrong"}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 1
                  ? "Upgrade your access to InventaAPI"
                  : "Your subscription could not be completed"}
              </p>
            </div>
            <button
              onClick={resetAndClose}
              id="subscription-modal-close-btn"
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ── STEP 1: Plan Selection ── */}
        {step === 1 && (
          <div className="p-6">
            {/* Single selected plan display */}
            <div className="mb-6">
              {(() => {
                const plan = SUBSCRIPTION_PLANS[selectedPlan];
                const Icon = plan.icon;
                const cumulativeFeatures = getCumulativeFeatures(selectedPlan);

                return (
                  <div
                    className={`w-full text-left p-4 rounded-xl border-2 ${plan.accent} border-opacity-100 shadow-lg ring-1 ring-indigo-500/30`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center flex-shrink-0 shadow-md`}
                      >
                        <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-white text-sm">{plan.name}</span>
                          {plan.id === "pro" && (
                            <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 uppercase tracking-wide">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mb-1">{plan.tagline}</p>
                        <p className={`text-xs font-medium ${plan.badgeColor}`}>{plan.requestLimitDisplay}</p>
                      </div>

                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-lg font-extrabold text-white">{plan.priceDisplay}</div>
                        <div className="text-xs text-slate-500">{plan.billingCycle}</div>
                      </div>
                    </div>

                    {/* Features (always shown for the selected plan) */}
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 gap-1">
                      {cumulativeFeatures.header && (
                        <div className="text-[11px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                          {cumulativeFeatures.header}
                        </div>
                      )}
                      {cumulativeFeatures.features.map((feature: string) => (
                        <div key={feature} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
                          <span className="text-xs text-slate-300">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CTA */}
            <button
              onClick={handleContinue}
              id="subscription-modal-continue-btn"
              className={`
                w-full font-bold py-3.5 rounded-xl transition-all shadow-lg text-white
                ${selectedPlan === "pro"
                  ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-indigo-500/30"
                  : selectedPlan === "enterprise"
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
                  : "bg-slate-700 hover:bg-slate-600"
                }
              `}
            >
              {selectedPlan === "pro" && "Pay with GCash →"}
              {selectedPlan === "free" && "Use Free Plan"}
              {selectedPlan === "enterprise" && "Contact Sales →"}
            </button>

            {selectedPlan === "pro" && (
              <p className="text-xs text-slate-500 text-center mt-3">
                🔒 Secure checkout via PayMongo · GCash · DPA 2012 Compliant
              </p>
            )}
          </div>
        )}

        {/* ── STEP 2: Redirecting to GCash ── */}
        {step === 2 && (
          <div className="p-10 text-center">
            {/* Animated logo area */}
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 opacity-20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-xl shadow-blue-500/30">
                <span className="text-3xl font-black text-white">G</span>
              </div>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Redirecting to GCash...
            </h2>
            <p className="text-sm text-slate-400 mb-6 max-w-xs mx-auto">
              We're taking you to the secure GCash payment page. Please don't close this tab.
            </p>

            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-400" aria-hidden="true" />
              <span>Preparing payment session...</span>
            </div>

            <div className="mt-8 bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
              <p className="text-xs text-slate-500">
                <strong className="text-slate-400">Note:</strong> After successful payment,
                you'll automatically receive Pro access. No manual confirmation needed.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Error ── */}
        {step === 3 && (
          <div className="p-6">
            <div className="bg-red-950/50 border border-red-500/30 rounded-xl p-5 mb-5 text-center">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <X className="w-6 h-6 text-red-400" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-red-300 mb-1">Checkout could not be completed</p>
              <p className="text-xs text-red-400/80">{errorMessage}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep(1); setErrorMessage(""); }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Go Back
              </button>
              <button
                onClick={handleProCheckout}
                id="subscription-modal-retry-btn"
                className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25 text-sm flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── STEP 4: Enterprise Contact Form (rendered separately over backdrop) ── */}
      {showEnterpriseForm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            onClick={handleEnterpriseFormClose}
          />
          <div className="relative z-10">
            <EnterpriseContactForm
              onClose={handleEnterpriseFormClose}
              onSuccess={handleEnterpriseFormSuccess}
            />
          </div>
        </div>
      )}
    </div>
  );
}
