"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Database, Code, Zap, Server, ShieldCheck, Smartphone } from "lucide-react";
import LoginModal from "@/components/auth/LoginModal";
import SubscriptionModal from "@/components/subscription/SubscriptionModal";
import { useAuth } from "@/lib/firebase/auth-context";
import { SUBSCRIPTION_PLANS, PlanId } from "@/config/plans";

// Paid plans that block the checkout when already active (single source of truth
// shared by openSubscription and the routing effect).
const ACTIVE_PAID_PLANS = ["Pro", "Enterprise", "Professional", "Unlimited"];

function LandingPageInner() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("pro");
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [modalError, setModalError] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Pre-check: already-active Pro modal shown BEFORE checkout is opened.
  const [showAlreadyProModal, setShowAlreadyProModal] = useState(false);

  console.log("[LANDING PAGE] Rendered - user:", !!user, "loading:", loading);

  console.log("[LANDING PAGE] Rendered - user:", !!user, "loading:", loading);

  // Check for error query params from admin panel redirects.
  // Each handler runs ONCE, then the consumed params are stripped from the URL
  // so a reload/back-navigation does not re-open the modals or toasts.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    let handled = false;

    const error = searchParams.get("error");
    if (error) {
      const errorMessages: Record<string, string> = {
        admin_auth_failed: "⚠️ Admin authentication failed. Please try logging in again.",
        token_expired: "⏱️ Your login session expired. Please login again.",
        admin_only: "🔒 Access denied. Admin privileges required.",
        user_not_found: "❌ User account not found. Please contact support.",
      };
      
      const message = errorMessages[error] || "❌ An error occurred. Please try again.";
      setErrorMessage(message);
      // Auto-clear after 6 seconds
      setTimeout(() => setErrorMessage(null), 6000);
      handled = true;
    }

    // Auto-open login modal when a visitor clicks "Login" on the signup page.
    if (searchParams.get("login") === "true") {
      setShowLoginModal(true);
      handled = true;
    }

    // Show success banner when coming from signup and auto-open the login modal
    // so the user can log in their freshly created account and enter the dashboard.
    if (searchParams.get("registered") === "true") {
      setSuccessMessage("✅ Account created successfully! Please log in to continue.");
      setTimeout(() => setSuccessMessage(null), 8000);
      setShowLoginModal(true);
      handled = true;
    }

    // After a new Pro-intent signup, the user arrives with choosePlan=true.
    // Do NOT open the SubscriptionModal directly here — the user just signed out
    // after registration and is unauthenticated. Instead, set pendingPlan so the
    // routing useEffect (which waits for auth to resolve) opens the correct modal:
    // LoginModal for unauthenticated visitors, SubscriptionModal for logged-in ones.
    if (searchParams.get("choosePlan") === "true") {
      setPendingPlan("pro");
      handled = true;
    }

    // Handle checkout cancellations.
    // As explicitly requested, cancellation should return the user to the Login Modal
    // so they start the Pro plan journey over and re-confirm their login.
    if (searchParams.get("payment") === "cancelled") {
      setPendingPlan("pro");
      setShowLoginModal(true);
      setModalError("Payment was not completed. You can try again below.");
      handled = true;
    }

    if (handled) {
      ["error", "login", "registered", "choosePlan", "payment"].forEach((key) =>
        params.delete(key)
      );
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "/", { scroll: false });
    }
  }, [searchParams, router]);

  // Single decision point for plan clicks, run only AFTER Firebase auth has settled.
  // During the initial onAuthStateChanged, `user` is still null even for logged-in
  // visitors; deciding earlier would wrongly open the login modal (and the previous
  // auto-conversion here would later hijack it once the session resolved — the cause
  // of "login modal gone on the second Subscribe Now click").
  useEffect(() => {
    if (loading || !pendingPlan) return;

    if (user) {
      // Prevent race condition: if the user JUST logged in via LoginModal,
      // let LoginModal's own handleLogin finish fetching the Firestore user
      // document and executing its own plan checks (which redirects already-Pro
      // users to the dashboard). Do not aggressively hijack the flow here.
      if (showLoginModal) {
        return;
      }

      // Free plan needs no upgrade — the LoginModal handles onboarding
      // (segment selection) and routes the user straight into the dashboard.
      if (pendingPlan === "free") {
        setPendingPlan(null);
        return; // keep the login modal open — do NOT open the subscription modal
      }
      // Already-active paid plan check. openSubscription runs the same check when
      // auth has already settled, but a click that landed during the initial
      // loading window is deferred here — so this pre-check MUST be duplicated in
      // the routing effect for the "already Pro" modal to open (otherwise the
      // checkout/GCash modal would wrongly appear for paid subscribers).
      const currentPlan: string = appUser?.plan ?? "";
      if (ACTIVE_PAID_PLANS.includes(currentPlan)) {
        const expiresAt = appUser?.subscriptionExpiresAt;
        const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
        if (!isExpired) {
          setPendingPlan(null);
          setShowAlreadyProModal(true);
          return;
        }
        // Expired Pro — fall through to the normal checkout so they can renew.
      }
      // Logged in + paid: open the upgrade/subscription modal directly, no login.
      setSelectedPlan(pendingPlan);
      setPendingPlan(null);
      setShowLoginModal(false);
      setShowSubscriptionModal(true);
      return;
    }

    // Logged out: (any plan) open the login modal; pendingPlan stays set so a
    // successful login continues into the correct post-login flow.
    setShowLoginModal(true);
  }, [loading, user, pendingPlan, showLoginModal]);

  const openSubscription = (plan: PlanId) => {
    setSelectedPlan(plan);

    // Firebase auth still resolving — record the intent only; the effect above
    // routes it to the right modal the moment `loading` flips to false.
    if (loading) {
      setPendingPlan(plan);
      return;
    }

    // Auth is settled: decide NOW (and always reset both modals first, so a second
    // click after closing re-opens the correct one even if pendingPlan didn't change).
    setPendingPlan(plan);
    setShowLoginModal(false);
    setShowSubscriptionModal(false);

    // ── PRE-CHECK: already-active Pro subscription ──────────────────────────
    // Only applies when the visitor is logged in AND clicking a paid plan CTA.
    // If their current plan is already Pro (or Enterprise) AND the subscription
    // has not yet expired, block the checkout flow entirely and show a friendly
    // informational modal instead.  This prevents the UX anti-pattern where the
    // user goes all the way through the GCash transition screen only to hit a
    // 409 "already subscribed" error from the backend.
    //
    // Expiry check: subscriptionExpiresAt is an ISO string written by the PayMongo
    // webhook.  If it's missing (legacy accounts or free trials with no expiry
    // recorded) we treat the subscription as active — the backend 409 guard is
    // still the final safety net, but we avoid showing the checkout UI.
    //
    // Expired-Pro bypass: if the expiry date is in the past, we let the user
    // proceed to the normal checkout flow so they can renew/resubscribe.
    if (user && plan !== "free") {
      const currentPlan: string = appUser?.plan ?? "";
      const isCurrentlyPaid = ACTIVE_PAID_PLANS.includes(currentPlan);

      if (isCurrentlyPaid) {
        const expiresAt = appUser?.subscriptionExpiresAt;
        const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

        if (!isExpired) {
          // Active Pro/Enterprise — show the "already subscribed" modal, skip checkout.
          setPendingPlan(null);
          setShowAlreadyProModal(true);
          return;
        }
        // Expired Pro — fall through to normal checkout so they can renew.
      }

      // Free user (or expired Pro) — open the checkout/subscription modal.
      setShowSubscriptionModal(true);
      return;
    }

    // Logged out, or the Free plan CTA: open the login modal first; after a
    // successful login the LoginModal handles onboarding and routing.
    setShowLoginModal(true);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const proExpiryDisplay = (() => {
    const expiresAt = appUser?.subscriptionExpiresAt;
    if (!expiresAt) return null;
    return new Date(expiresAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  })();

  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Error Toast Notification */}
      {errorMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[150] animate-in slide-in-from-top duration-300">
          <div className="bg-red-500/10 border-2 border-red-500/50 rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl backdrop-blur-md min-w-[400px]">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0"></div>
            <span className="text-red-100 font-medium text-sm flex-1">{errorMessage}</span>
            <button 
              onClick={() => setErrorMessage(null)}
              className="ml-2 text-red-300 hover:text-white transition-colors text-lg font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Success Toast Notification (e.g. after signup) */}
      {successMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[150] animate-in slide-in-from-top duration-300">
          <div className="bg-emerald-500/10 border-2 border-emerald-500/50 rounded-xl px-6 py-4 flex items-center gap-3 shadow-2xl backdrop-blur-md min-w-[400px]">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse flex-shrink-0"></div>
            <span className="text-emerald-100 font-medium text-sm flex-1">{successMessage}</span>
            <button 
              onClick={() => setSuccessMessage(null)}
              className="ml-2 text-emerald-300 hover:text-white transition-colors text-lg font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="fixed w-full z-50 top-0 border-b border-white/5 bg-[#020617]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Image
                src="/inventa-logo.png"
                alt="InventaAPI Logo"
                width={52}
                height={52}
                className="object-contain"
                priority
              />
              <span className="font-bold text-xl tracking-tight">InventaAPI</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="#" className="hover:text-white transition-colors">API Docs</a>
              
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-slate-300 mb-8">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            Data-as-a-Service Platform v1.0
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight">
            Centralized Product <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              Database for SMEs
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Stop building your product catalog from scratch. Consume our standardized, highly-available REST API to power your Point of Sale, Inventory, or E-Commerce applications instantly.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 border-t border-white/5 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Enterprise Features, SME Scale</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Everything you need to seamlessly integrate a master product catalog into your business software.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Database, title: "Centralized Catalog", desc: "Access thousands of pre-validated products across hardware, grocery, and electronics." },
              { icon: Zap, title: "REST API Access", desc: "Lightning-fast JSON endpoints with predictable structures and robust filtering." },
              { icon: ShieldCheck, title: "Secure & Reliable", desc: "JWT authentication, rate limiting, and enterprise-grade security built-in." },
              { icon: Server, title: "Data-as-a-Service", desc: "We maintain the data, handle variations, and host images. You just consume it." },
              { icon: Smartphone, title: "Fast Integration", desc: "Perfect for mobile POS or web dashboards with our lightweight API payloads." },
              { icon: Code, title: "Product Fallbacks", desc: "Intelligent fallback mechanisms for unlisted products with automated request workflows." }
            ].map((feature, i) => (
              <div key={i} className="glass-card p-8 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How InventaAPI Works</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">A simple, standardized flow connecting the Master Database to your application.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent -translate-y-1/2 z-0" />
            
            <div className="relative z-10 glass-card p-8 rounded-2xl border border-white/5 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center text-xl font-bold mx-auto mb-6 shadow-[0_0_30px_rgba(99,102,241,0.2)]">1</div>
              <h3 className="text-xl font-bold mb-3">Connect via REST API</h3>
              <p className="text-slate-400 text-sm">Your SME application sends a secure GET request using your dedicated API Key.</p>
            </div>
            
            <div className="relative z-10 glass-card p-8 rounded-2xl border border-white/5 text-center mt-8 md:mt-0">
              <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-purple-500 flex items-center justify-center text-xl font-bold mx-auto mb-6 shadow-[0_0_30px_rgba(168,85,247,0.2)]">2</div>
              <h3 className="text-xl font-bold mb-3">Retrieve Standard Data</h3>
              <p className="text-slate-400 text-sm">InventaAPI returns a standardized JSON payload with product variations, pricing, and image URLs.</p>
            </div>
            
            <div className="relative z-10 glass-card p-8 rounded-2xl border border-white/5 text-center mt-8 md:mt-0">
              <div className="w-16 h-16 rounded-full bg-slate-900 border-2 border-emerald-500 flex items-center justify-center text-xl font-bold mx-auto mb-6 shadow-[0_0_30px_rgba(16,185,129,0.2)]">3</div>
              <h3 className="text-xl font-bold mb-3">Integrate & Display</h3>
              <p className="text-slate-400 text-sm">Render the rich product data seamlessly into your POS, E-Commerce, or Inventory dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Subscription Section */}
      <section id="pricing" className="py-24 border-t border-white/5 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, transparent pricing.<br />Scale as you grow.</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">All plans include an API key, documentation access, and DPA compliance. No hidden fees.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Free Plan */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-300 mb-2">{SUBSCRIPTION_PLANS.free.displayName.toUpperCase()}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-slate-400">₱</span>
                  <span className="text-5xl font-extrabold">{SUBSCRIPTION_PLANS.free.price}</span>
                  <span className="text-slate-400 text-sm">/{SUBSCRIPTION_PLANS.free.billingCycle}</span>
                </div>
                <p className="text-sm text-slate-400 mt-3">{SUBSCRIPTION_PLANS.free.tagline}</p>
              </div>

              <div className="space-y-3 mb-8">
                {SUBSCRIPTION_PLANS.free.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span className="text-slate-300">{feature}</span>
                  </div>
                ))}
                {SUBSCRIPTION_PLANS.free.exclusions.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-slate-600 mt-0.5">✗</span>
                    <span className="text-slate-500">{feature}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => openSubscription("free")}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-all border border-white/10">
                {SUBSCRIPTION_PLANS.free.ctaText} →
              </button>
            </div>

            {/* Pro Plan - Most Popular */}
            <div className="glass-card p-8 rounded-2xl border-2 border-indigo-500/50 hover:border-indigo-500 transition-all relative shadow-lg shadow-indigo-500/20">
              {SUBSCRIPTION_PLANS.pro.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">{SUBSCRIPTION_PLANS.pro.badge}</span>
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-300 mb-2">{SUBSCRIPTION_PLANS.pro.displayName.toUpperCase()}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-slate-400">₱</span>
                  <span className="text-5xl font-extrabold">{SUBSCRIPTION_PLANS.pro.price?.toLocaleString()}</span>
                  <span className="text-slate-400 text-sm">{SUBSCRIPTION_PLANS.pro.billingCycle}</span>
                </div>
                <p className="text-sm text-slate-400 mt-3">{SUBSCRIPTION_PLANS.pro.tagline}</p>
              </div>

              <div className="space-y-3 mb-8">
                <p className="text-xs font-semibold text-indigo-400 mb-2">Everything in Free, and:</p>
                {SUBSCRIPTION_PLANS.pro.incrementalFeatures.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span className="text-slate-300">{feature}</span>
                  </div>
                ))}
                {SUBSCRIPTION_PLANS.pro.exclusions.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-slate-600 mt-0.5">✗</span>
                    <span className="text-slate-500">{feature}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => openSubscription("pro")}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25">
                {SUBSCRIPTION_PLANS.pro.ctaText} →
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-300 mb-2">{SUBSCRIPTION_PLANS.enterprise.displayName.toUpperCase()}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{SUBSCRIPTION_PLANS.enterprise.priceDisplay}</span>
                </div>
                <p className="text-sm text-slate-400 mt-3">{SUBSCRIPTION_PLANS.enterprise.tagline}</p>
              </div>

              <div className="space-y-3 mb-8">
                <p className="text-xs font-semibold text-emerald-400 mb-2">Everything in Pro, and:</p>
                {SUBSCRIPTION_PLANS.enterprise.incrementalFeatures.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span className="text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => openSubscription("enterprise")}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-all border border-white/10">
                {SUBSCRIPTION_PLANS.enterprise.ctaText} →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="footer" className="border-t border-white/10 bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Image
              src="/inventa-logo.png"
              alt="InventaAPI Logo"
              width={52}
              height={52}
              className="object-contain"
            />
            <span className="font-bold text-slate-300">InventaAPI DaaS</span>
          </div>
          
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/contact" className="hover:text-white transition-colors">Contact</a>
          </div>
          
          <p className="text-sm text-slate-500">© 2026 InventaAPI Research Team. All rights reserved.</p>
        </div>
      </footer>

      {/* Login is required only when a visitor chooses a pricing plan. */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => { setShowLoginModal(false); setPendingPlan(null); setModalError(""); }}
        pendingPlan={pendingPlan}
        onOpenSubscription={(plan) => { setSelectedPlan(plan); setShowSubscriptionModal(true); }}
        initialError={modalError}
      />
      
      {/* Subscription Modal */}
      <SubscriptionModal 
        isOpen={showSubscriptionModal} 
        onClose={() => { setShowSubscriptionModal(false); setModalError(""); }}
        selectedPlan={selectedPlan}
        initialError={modalError}
      />

      {/* ── Already-Active Pro Modal ─────────────────────────────────────── */}
      {/* Shown INSTEAD of the checkout flow when the logged-in user already  */}
      {/* has a valid, non-expired Pro subscription.  No API call is made.    */}
      {showAlreadyProModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setShowAlreadyProModal(false)}
          />

          <div className="w-full max-w-sm relative z-10 bg-slate-900/80 backdrop-blur-md border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-500/10 p-8 text-center animate-in fade-in zoom-in duration-200">
            {/* Icon */}
            <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            {/* Badge */}
            <span className="inline-block text-[11px] font-bold bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full border border-indigo-500/30 uppercase tracking-widest mb-4">
              Pro · Active
            </span>

            <h2 className="text-xl font-bold text-white mb-2">
              You're already on the Pro plan
            </h2>

            <p className="text-sm text-slate-400 mb-1">
              Your subscription is currently <span className="text-emerald-400 font-medium">active</span>
              {proExpiryDisplay && (
                <> until <span className="text-white font-semibold">{proExpiryDisplay}</span></>
              )}.
            </p>
            <p className="text-xs text-slate-500 mb-7">
              You have full access to 5,000 requests/day and all business segments.
            </p>

            <button
              onClick={() => { setShowAlreadyProModal(false); router.push("/dashboard"); }}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25"
            >
              Go to Dashboard →
            </button>

            <button
              onClick={() => setShowAlreadyProModal(false)}
              className="mt-3 w-full text-sm text-slate-500 hover:text-slate-300 transition-colors py-1"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingPageInner />
    </Suspense>
  );
}
