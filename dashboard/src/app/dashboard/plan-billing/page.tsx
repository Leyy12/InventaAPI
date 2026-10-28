"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CreditCard, X } from 'lucide-react';
import { useAuth } from '@/lib/supabase/auth-context';
import { requestAllowanceLabel } from '@/config/plans';
import { usePlanCatalog, useAccountRequestAllowance } from '@/lib/plan-request-policy';
import SubscriptionModal from '@/components/subscription/SubscriptionModal';
import FreeTrialContent from '@/components/subscription/FreeTrialContent';

type PaidPlanId = 'pro' | 'pro_max';

// Same look as the landing page pricing cards (components/subscription/PlanCards.tsx),
// plus the account-aware purchase button.
function PlanCard({ planId, currentPlan, canPurchase, onChoose }: {
  planId: PaidPlanId;
  currentPlan: string;
  canPurchase: boolean;
  onChoose: (plan: PaidPlanId) => void;
}) {
  const { plans, status } = usePlanCatalog(true);
  const plan = plans[planId];
  const isCurrent = currentPlan === plan.name;
  const pro = planId === 'pro';
  const badge = isCurrent ? 'CURRENT PLAN' : plan.badge;

  return <article className={`glass-card relative flex h-full flex-col rounded-2xl p-8 transition-all ${
    isCurrent ? 'border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
      : pro ? 'border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/20 hover:border-indigo-500'
        : 'border border-white/5 hover:border-indigo-500/30'
  }`}>
    {badge && <div className="absolute -top-4 left-1/2 -translate-x-1/2">
      <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${isCurrent ? 'bg-emerald-600' : 'bg-indigo-600'}`}>{badge}</span>
    </div>}
    <div className="mb-6">
      <h3 className="mb-2 text-lg font-bold text-slate-300">{plan.displayName.toUpperCase()}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-extrabold text-white">{plan.priceDisplay}</span>
        <span className="text-sm text-slate-400">{plan.billingCycle}</span>
      </div>
      <p className="mt-3 text-sm text-slate-400">{plan.tagline}</p>
    </div>
    <div className="mb-8 flex-1 space-y-3" aria-label={`${plan.name} benefits`}>
      <p className={`mb-2 text-xs font-semibold ${pro ? 'text-indigo-400' : 'text-emerald-400'}`}>{pro ? 'Everything in Free, and:' : 'Everything in Pro, and:'}</p>
      {plan.incrementalFeatures.map(feature => <div key={feature} className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 text-emerald-400">✓</span>
        <span className="text-slate-300">{feature}</span>
      </div>)}
      {plan.exclusions.map(feature => <div key={feature} className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 text-slate-600">✗</span>
        <span className="text-slate-500">{feature}</span>
      </div>)}
      {planId === 'pro_max' && <p className="pt-1 text-xs leading-5 text-slate-500">Standard security, abuse protection, and IP rate limits still apply.</p>}
    </div>
    {canPurchase ? <button type="button" disabled={status !== 'ready'} onClick={() => onChoose(planId)}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl py-3 font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
        pro ? 'border border-transparent bg-indigo-600 shadow-lg shadow-indigo-500/25 hover:bg-indigo-700' : 'border border-white/10 bg-white/5 hover:bg-white/10'
      }`}>
      {isCurrent ? `Renew ${plan.name}` : `Get ${plan.name}`} <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button> : <p className="rounded-xl border border-white/10 px-4 py-3 text-center text-sm text-slate-400">
      {isCurrent ? 'Your current plan' : 'This plan is not available for your current entitlement.'}
    </p>}
  </article>;
}

export default function PlanBillingPage() {
  const requestAllowance = useAccountRequestAllowance();
  const { entitlement, loading } = useAuth();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchasePlan, setPurchasePlan] = useState<PaidPlanId>('pro');
  // Set when the customer comes back from PayMongo without paying.
  const [cancelledPlan, setCancelledPlan] = useState<PaidPlanId | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'cancelled') return;
    setCancelledPlan(params.get('pendingPlan') === 'pro_max' ? 'pro_max' : 'pro');
    window.history.replaceState({}, '', '/dashboard/plan-billing');
  }, []);

  if (loading || !entitlement) return <p role="status" className="p-8 text-slate-300">Verifying your plan and billing status…</p>;

  const paid = entitlement.activePro || ['Enterprise', 'Unlimited'].includes(entitlement.plan);
  const trial = entitlement.activeTrial === true;
  const upgradeRequired = entitlement.subscription_status === 'upgrade_required';
  const currentPlan = paid ? entitlement.plan : trial ? 'Free Trial' : upgradeRequired ? 'Upgrade Required' : 'Unavailable';
  const purchase = (plan: PaidPlanId) => { setPurchasePlan(plan); setPurchaseOpen(true); };

  return <div className="w-full space-y-7 px-6 pb-10 lg:px-8">
    <header>
      <h1 className="flex items-center gap-3 text-3xl font-bold text-white"><CreditCard className="text-indigo-400" aria-hidden="true" />Plan &amp; Billing</h1>
      <p className="mt-2 text-slate-400">Manage your subscription, usage, and billing.</p>
    </header>

    {trial ? <FreeTrialContent embedded /> : <section aria-label="Current plan" className="rounded-2xl border border-slate-700/80 bg-[#0d1526] p-5 shadow-lg shadow-slate-950/20 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">Current plan</p>
          <h2 className="mt-2 text-2xl font-bold text-white">{currentPlan}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${upgradeRequired
          ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
          : paid ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
            : 'border-slate-500/30 bg-slate-500/10 text-slate-300'}`}>
          {upgradeRequired ? 'UPGRADE REQUIRED' : entitlement.subscription_status.toUpperCase()}
        </span>
      </div>
      {paid && <div className="mt-5 space-y-2 border-t border-slate-700/70 pt-5">
        {entitlement.subscriptionExpiresAt && <p className="text-sm text-slate-300">
          Subscription ends <time dateTime={entitlement.subscriptionExpiresAt}>{new Date(entitlement.subscriptionExpiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</time>
        </p>}
        <p className="text-sm text-slate-400">{requestAllowanceLabel(requestAllowance)}. Standard security, abuse protection, and IP rate limits still apply.</p>
      </div>}
      {upgradeRequired && <p className="mt-5 border-t border-slate-700/70 pt-5 text-sm leading-6 text-amber-100/90">
        Your one-time Trial has ended. Upgrade to Pro or Pro Max to restore protected API access. Your account and existing API keys remain available.
      </p>}
      {!paid && !upgradeRequired && <p className="mt-5 border-t border-slate-700/70 pt-5 text-sm text-slate-300">Plan details are being verified. Please refresh in a moment.</p>}
    </section>}
    {trial && <p className="text-sm text-slate-300">Current Trial request allowance: {requestAllowanceLabel(requestAllowance, true)}.</p>}

    {cancelledPlan && <div role="status" className="flex flex-col gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
        <div><p className="text-sm font-semibold text-amber-100">Payment was not completed</p>
          <p className="mt-1 text-sm text-amber-100/80">No charge was made. You can try again whenever you are ready.</p></div>
      </div>
      <div className="flex items-center gap-2">
        {(cancelledPlan === 'pro_max' ? entitlement.canPurchaseProMax : entitlement.canPurchasePro) && <button type="button"
          onClick={() => { purchase(cancelledPlan); setCancelledPlan(null); }}
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Try again</button>}
        <button type="button" aria-label="Dismiss" onClick={() => setCancelledPlan(null)}
          className="rounded-lg p-2 text-amber-100/70 hover:bg-amber-400/10 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>}

    <section aria-label="Manage API keys" className="flex flex-col gap-3 rounded-2xl border border-slate-700/70 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div><h2 className="text-sm font-semibold text-white">API key management</h2><p className="mt-1 text-sm text-slate-400">View and manage your existing keys.</p></div>
      <Link href="/dashboard/api-keys" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-indigo-400/30 bg-indigo-400/10 px-4 py-2 text-sm font-semibold text-indigo-200 transition-colors hover:bg-indigo-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
        Manage API Keys <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>

    <section id="upgrade" aria-label={paid ? 'Paid plan options' : 'Upgrade options'} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-300">Plan options</p>
          <h2 className="mt-1 text-2xl font-bold text-white">{paid ? 'Manage your paid plan' : 'Choose the plan that fits'}</h2></div>
        <p className="text-sm text-slate-400">Purchases are confirmed by the server.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8 pt-4 lg:items-stretch">
        <PlanCard planId="pro" currentPlan={entitlement.plan} canPurchase={entitlement.canPurchasePro} onChoose={purchase} />
        <PlanCard planId="pro_max" currentPlan={entitlement.plan} canPurchase={entitlement.canPurchaseProMax} onChoose={purchase} />
      </div>
    </section>
    <SubscriptionModal isOpen={purchaseOpen} selectedPlan={purchasePlan} onClose={() => setPurchaseOpen(false)} />
  </div>;
}
