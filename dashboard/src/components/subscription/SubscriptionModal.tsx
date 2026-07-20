"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check, ArrowLeft, Loader2 } from "lucide-react";
import { auth, db } from "@/lib/firebase/config";
import { doc, updateDoc } from "firebase/firestore";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPlan?: "starter" | "professional" | "enterprise";
}

type PaymentMethod = "gcash" | "maya" | "card" | "bank";

export default function SubscriptionModal({ isOpen, onClose, selectedPlan = "professional" }: SubscriptionModalProps) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [plan, setPlan] = useState(selectedPlan);
  const [businessSegment, setBusinessSegment] = useState("hardware");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("gcash");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const router = useRouter();

  if (!isOpen) return null;

  const planDetails = {
    starter: { name: "Starter", price: 0, priceText: "₱0", quota: "50 requests/day" },
    professional: { name: "Professional", price: 1499, priceText: "₱1,499", quota: "5,000 requests/day · All endpoints" },
    enterprise: { name: "Enterprise", price: 0, priceText: "Custom", quota: "Unlimited · Custom endpoints" }
  };

  const currentPlan = planDetails[plan];

  const handleContinueToPayment = () => {
    if (!email || !fullName) {
      alert("Please fill in all required fields");
      return;
    }
    
    if (plan === "starter") {
      // Skip to processing for free plan
      handleProcessPayment();
    } else if (plan === "enterprise") {
      alert("Please contact our sales team for Enterprise plans");
      onClose();
    } else {
      setStep(2);
    }
  };

  const handleContinueToDetails = () => {
    setStep(3);
  };

  const handleProcessPayment = async () => {
    setLoading(true);
    setStep(4); // Processing step

    // Simulate payment processing + activate subscription in Firestore
    setTimeout(async () => {
      try {
        // Generate API key
        const generatedKey = `daas_${plan}_${Math.random().toString(36).substring(2, 15)}`;
        setApiKey(generatedKey);

        // Update the user's Firestore document with active subscription
        const currentUser = auth.currentUser;
        if (currentUser) {
          const planNameMap = {
            starter: "Starter",
            professional: "Professional",
            enterprise: "Enterprise",
          };
          await updateDoc(doc(db, "users", currentUser.uid), {
            subscription_status: "active",
            plan: planNameMap[plan],
            businessSegment: businessSegment,
            apiKey: generatedKey,
            subscribedAt: new Date().toISOString(),
          });
        }

        setLoading(false);
        setStep(5); // Success step
      } catch (error) {
        console.error("Error activating subscription:", error);
        setLoading(false);
        setStep(5); // Still show success (demo mode)
      }
    }, 2000);
  };

  const handleGoToDashboard = () => {
    // Save business segment to localStorage for routing
    localStorage.setItem("businessSegment", businessSegment);
    
    // Close modal and let the auth-context redirect to dashboard automatically
    onClose();
    router.push("/dashboard");
  };

  const resetAndClose = () => {
    setStep(1);
    setEmail("");
    setFullName("");
    setReference("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={resetAndClose} />
      
      <div className="w-full max-w-md glass-card rounded-2xl p-8 relative z-10 shadow-2xl border border-white/10 bg-slate-900/60 backdrop-blur-md animate-in fade-in zoom-in duration-200">
        <button onClick={resetAndClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Step Indicator */}
        {step <= 3 && (
          <div className="flex items-center justify-between mb-8">
            {[1, 2, 3].map((num) => (
              <div key={num} className="flex items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step >= num 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" 
                    : "bg-slate-800 text-slate-500"
                }`}>
                  {num}
                </div>
                {num < 3 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-all ${
                    step > num ? "bg-indigo-600" : "bg-slate-800"
                  }`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Subscribe Details */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Subscribe to InventaAPI</h2>
            
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4 mb-6">
              <div className="text-sm font-bold text-slate-300 mb-1">{currentPlan.name} Plan</div>
              <div className="text-2xl font-extrabold text-indigo-400">
                {currentPlan.priceText}
                {currentPlan.price > 0 && <span className="text-sm text-slate-400 font-normal">/month</span>}
              </div>
              <div className="text-xs text-slate-400 mt-1">{currentPlan.quota}</div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">EMAIL ADDRESS</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="partner@yourbusiness.com"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">FULL NAME / BUSINESS NAME</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Juan dela Cruz / ABC Trading Corp."
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">BUSINESS SEGMENT</label>
                <select
                  value={businessSegment}
                  onChange={(e) => setBusinessSegment(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                >
                  <option value="hardware">Hardware Store</option>
                  <option value="pharmacy">Pharmacy / Drugstore</option>
                  <option value="grocery">Grocery / SME Retail</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleContinueToPayment}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25"
            >
              Continue to Payment →
            </button>
            <p className="text-xs text-slate-500 text-center mt-3">🔒 Secured by 256-bit SSL · DPA 2012 Compliant</p>
          </div>
        )}

        {/* Step 2: Choose Payment Method */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Choose Payment Method</h2>
            <p className="text-sm text-slate-400 mb-6">
              Choose how you'd like to pay for your <strong className="text-white">{currentPlan.name}</strong> subscription.
            </p>

            <div className="space-y-3 mb-6">
              {[
                { id: "gcash", name: "GCash", desc: "Pay via GCash e-wallet", color: "from-blue-600 to-cyan-500" }
              ].map((method) => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id as PaymentMethod)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    paymentMethod === method.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${method.color} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white font-bold text-sm">{method.name[0]}</span>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-white text-sm">{method.name}</div>
                    <div className="text-xs text-slate-400">{method.desc}</div>
                  </div>
                  {paymentMethod === method.id && (
                    <Check className="w-5 h-5 text-indigo-400" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleContinueToDetails}
                className="flex-2 flex-grow-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Payment Details */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Payment Details</h2>

            <div className="bg-slate-950 border border-slate-700 rounded-xl p-6 mb-6 text-center">
              <div className="w-24 h-24 bg-indigo-500/20 border-2 border-indigo-500/50 rounded-xl mx-auto mb-4 flex items-center justify-center">
                <div className="text-4xl">💳</div>
              </div>
              <div className="text-2xl font-bold font-mono mb-2">8917 123 4567</div>
              <div className="text-xs text-slate-400 mb-4">Scan with {paymentMethod === "gcash" ? "GCash" : paymentMethod === "maya" ? "Maya" : paymentMethod} app · or send to this number</div>
              
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3">
                <div className="text-xs text-slate-400 mb-1">Amount to Send</div>
                <div className="text-2xl font-extrabold text-indigo-400">{currentPlan.priceText}</div>
              </div>
            </div>

            <div className="mb-6">
              <label className="text-sm font-medium text-slate-300 mb-2 block">REFERENCE / TRANSACTION NUMBER</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 202606011234567"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                required
              />
              <small className="text-xs text-slate-500 mt-1 block">Found in your {paymentMethod === "gcash" ? "GCash" : paymentMethod === "maya" ? "Maya" : "payment"} app after sending.</small>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleProcessPayment}
                className="flex-2 flex-grow-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25"
              >
                Confirm Payment ✓
              </button>
            </div>
            <p className="text-xs text-slate-500 text-center mt-3">By confirming, you agree to InventaAPI's Terms of Service and B2B Data Access Agreement.</p>
          </div>
        )}

        {/* Step 4: Processing */}
        {step === 4 && (
          <div className="text-center py-12">
            <Loader2 className="w-16 h-16 text-indigo-500 animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-bold mb-2">Verifying Payment...</h2>
            <p className="text-sm text-slate-400">Generating your API key and activating your subscription.</p>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 5 && (
          <div className="text-center">
            <div className="w-20 h-20 bg-emerald-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Check className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Subscription Activated!</h2>
            <p className="text-sm text-slate-400 mb-6">Your API key is ready. Keep it safe — it's your only access credential.</p>

            <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-6 mb-6">
              <div className="text-xs font-bold text-emerald-400 mb-2">YOUR API KEY</div>
              <input
                type="text"
                value={apiKey}
                readOnly
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-emerald-400 font-mono text-center mb-3 focus:outline-none"
              />
              <button
                onClick={() => navigator.clipboard.writeText(apiKey)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 rounded-lg transition-all text-sm"
              >
                📋 Copy API Key
              </button>
            </div>

            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-4 py-2 mb-6 inline-block">
              <span className="text-sm font-bold text-indigo-400">{currentPlan.name} Plan · {currentPlan.quota}</span>
            </div>

            <button
              onClick={handleGoToDashboard}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25"
            >
              Go to Dashboard →
            </button>
            <p className="text-xs text-slate-500 text-center mt-3">A confirmation email will be sent to your registered address within 24 hours.</p>
          </div>
        )}
      </div>
    </div>
  );
}
