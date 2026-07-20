"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Database, Code, Zap, Server, ShieldCheck, Smartphone } from "lucide-react";
import LoginModal from "@/components/auth/LoginModal";
import SubscriptionModal from "@/components/subscription/SubscriptionModal";
import { useAuth } from "@/lib/firebase/auth-context";

function LandingPageInner() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const isLandingBypass = searchParams.get("view") === "landing";

  // Start hidden — never flash the login modal before auth resolves
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "professional" | "enterprise">("professional");

  useEffect(() => {
    if (!loading) {
      // Only show login if: auth has resolved AND user is NOT logged in
      // Never show login if user deliberately came via ?view=landing (they're already logged in)
      if (!user && !isLandingBypass) {
        setShowLoginModal(true);
      } else {
        setShowLoginModal(false);
      }
    }
  }, [user, loading, isLandingBypass]);

  const openSubscription = (plan: "starter" | "professional" | "enterprise") => {
    setSelectedPlan(plan);
    setShowSubscriptionModal(true);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed w-full z-50 top-0 border-b border-white/5 bg-[#020617]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-sm shadow-lg shadow-indigo-500/20">
                IV
              </div>
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
            {/* Starter Plan */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-300 mb-2">STARTER</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-slate-400">₱</span>
                  <span className="text-5xl font-extrabold">0</span>
                  <span className="text-slate-400 text-sm">/mo</span>
                </div>
                <p className="text-sm text-slate-400 mt-3">For developers exploring the API, students, or teams doing a proof-of-concept integration.</p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">1 API Key (shared access)</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">50 requests per day</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Product Catalog endpoint</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Product Recommendations</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-slate-600 mt-0.5">✗</span>
                  <span className="text-slate-500">Sales Analytics Feed</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-slate-600 mt-0.5">✗</span>
                  <span className="text-slate-500">Priority Support</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-slate-600 mt-0.5">✗</span>
                  <span className="text-slate-500">Custom Business Segment</span>
                </div>
              </div>

              <button 
                onClick={() => openSubscription("starter")}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-all border border-white/10">
                Get Started Free →
              </button>
            </div>

            {/* Professional Plan - Most Popular */}
            <div className="glass-card p-8 rounded-2xl border-2 border-indigo-500/50 hover:border-indigo-500 transition-all relative shadow-lg shadow-indigo-500/20">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">MOST POPULAR</span>
              </div>
              
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-300 mb-2">PROFESSIONAL</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-slate-400">₱</span>
                  <span className="text-5xl font-extrabold">1,499</span>
                  <span className="text-slate-400 text-sm">/mo</span>
                </div>
                <p className="text-sm text-slate-400 mt-3">For active businesses — suppliers, distributors, and e-commerce platforms needing reliable, fast data integration.</p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">1 Dedicated API Key</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">5,000 requests per day</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Full Product Catalog + Recommendations</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Sales Analytics Feed</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">All Business Segments</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Email + Chat Support</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-slate-600 mt-0.5">✗</span>
                  <span className="text-slate-500">Custom Endpoints</span>
                </div>
              </div>

              <button 
                onClick={() => openSubscription("professional")}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25">
                Subscribe Now →
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className="glass-card p-8 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-300 mb-2">ENTERPRISE</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">Custom</span>
                </div>
                <p className="text-sm text-slate-400 mt-3">For large-scale ERP integrations, multi-branch businesses, and organizations needing custom endpoints and dedicated infrastructure.</p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Multiple API Keys</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Unlimited requests</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">All endpoints + Custom routes</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Priority dedicated support</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">Custom Business Segments</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">99.9% SLA Guarantee</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-slate-300">NDA + Custom data agreement</span>
                </div>
              </div>

              <button className="w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-xl transition-all border border-white/10">
                Contact Sales →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-indigo-500 flex items-center justify-center font-bold text-[10px]">IV</div>
            <span className="font-bold text-slate-300">InventaAPI DaaS</span>
          </div>
          
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
          
          <p className="text-sm text-slate-500">© 2026 InventaAPI Research Team. All rights reserved.</p>
        </div>
      </footer>

      {/* Floating Login Modal - Auto-open & Mandatory when not logged in */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      
      {/* Subscription Modal */}
      <SubscriptionModal 
        isOpen={showSubscriptionModal} 
        onClose={() => setShowSubscriptionModal(false)}
        selectedPlan={selectedPlan}
      />
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
