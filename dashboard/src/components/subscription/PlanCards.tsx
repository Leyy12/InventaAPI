"use client";

import type { PlanId, plansForRequestLimits } from "@/config/plans";

type PlanCatalog = ReturnType<typeof plansForRequestLimits>;

interface PlanCardsProps {
  plans: PlanCatalog;
  onSelect: (plan: PlanId) => void;
  isDisabled?: (plan: PlanId) => boolean;
  ctaText?: (plan: PlanId) => string;
}

// Pricing cards shared by the landing page and the post-signup plan chooser. Every card is
// a flex column whose feature list grows, so the three buttons line up along the bottom.
export default function PlanCards({ plans, onSelect, isDisabled = () => false, ctaText = plan => plans[plan].ctaText }: PlanCardsProps) {
  const button = (plan: PlanId, className: string) => (
    <button
      type="button"
      disabled={isDisabled(plan)}
      onClick={() => onSelect(plan)}
      className={`w-full text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {ctaText(plan)} →
    </button>
  );
  const included = (feature: string) => (
    <div key={feature} className="flex items-start gap-2 text-sm">
      <span className="text-emerald-400 mt-0.5">✓</span>
      <span className="text-slate-300">{feature}</span>
    </div>
  );
  const excluded = (feature: string) => (
    <div key={feature} className="flex items-start gap-2 text-sm">
      <span className="text-slate-600 mt-0.5">✗</span>
      <span className="text-slate-500">{feature}</span>
    </div>
  );

  return (
    <>
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {/* Free Plan */}
        <div className="glass-card p-8 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all flex flex-col">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-300 mb-2">{plans.free.displayName.toUpperCase()}</h3>
            <div className="flex items-baseline gap-1">
              <span className="text-sm text-slate-400">₱</span>
              <span className="text-5xl font-extrabold">{plans.free.price}</span>
              <span className="text-slate-400 text-sm">{plans.free.billingCycle}</span>
            </div>
            <p className="text-sm text-slate-400 mt-3">{plans.free.tagline}</p>
          </div>

          <div className="flex-1 space-y-3 mb-8">
            {plans.free.features.map(included)}
            {plans.free.exclusions.map(excluded)}
          </div>

          {button("free", "bg-white/5 hover:bg-white/10 border border-white/10")}
        </div>

        {/* Pro Plan - Most Popular */}
        <div className="glass-card p-8 rounded-2xl border-2 border-indigo-500/50 hover:border-indigo-500 transition-all relative shadow-lg shadow-indigo-500/20 flex flex-col">
          {plans.pro.badge && (
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">{plans.pro.badge}</span>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-300 mb-2">{plans.pro.displayName.toUpperCase()}</h3>
            <div className="flex items-baseline gap-1">
              <span className="text-sm text-slate-400">₱</span>
              <span className="text-5xl font-extrabold">{plans.pro.price?.toLocaleString()}</span>
              <span className="text-slate-400 text-sm">{plans.pro.billingCycle}</span>
            </div>
            <p className="text-sm text-slate-400 mt-3">{plans.pro.tagline}</p>
          </div>

          <div className="flex-1 space-y-3 mb-8">
            <p className="text-xs font-semibold text-indigo-400 mb-2">Everything in Free, and:</p>
            {plans.pro.incrementalFeatures.map(included)}
            {plans.pro.exclusions.map(excluded)}
          </div>

          {/* A transparent border keeps this button the same height as the outlined ones. */}
          {button("pro", "bg-indigo-600 hover:bg-indigo-700 border border-transparent shadow-lg shadow-indigo-500/25")}
        </div>

        {/* Pro Max Plan */}
        <div className="glass-card p-8 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all flex flex-col">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-300 mb-2">{plans.pro_max.displayName.toUpperCase()}</h3>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">{plans.pro_max.priceDisplay}</span>
              <span className="text-slate-400 text-sm">{plans.pro_max.billingCycle}</span>
            </div>
            <p className="text-sm text-slate-400 mt-3">{plans.pro_max.tagline}</p>
          </div>

          <div className="flex-1 space-y-3 mb-8">
            <p className="text-xs font-semibold text-emerald-400 mb-2">Everything in Pro, and:</p>
            {plans.pro_max.incrementalFeatures.map(included)}
          </div>

          {button("pro_max", "bg-white/5 hover:bg-white/10 border border-white/10")}
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-slate-500">Standard security, abuse-prevention, and IP rate limits apply to every plan.</p>
    </>
  );
}
