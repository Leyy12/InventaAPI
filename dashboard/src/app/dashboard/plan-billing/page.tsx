"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CreditCard } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { SUBSCRIPTION_PLANS } from '@/config/plans';
import SubscriptionModal from '@/components/subscription/SubscriptionModal';
import FreeTrialPage from '../free-trial/page';

type PaidPlanId = 'pro' | 'pro_max';

function PlanCard({ planId, currentPlan, canPurchase, onChoose }: {
  planId: PaidPlanId;
  currentPlan: string;
  canPurchase: boolean;
  onChoose: (plan: PaidPlanId) => void;
}) {
  const plan = SUBSCRIPTION_PLANS[planId];
  const isCurrent = currentPlan === plan.name;
  const benefits = plan.incrementalFeatures.filter(feature => {
    if (planId === 'pro') return /requests per day|All Business Segments|Real Sales Analytics Feed|Multiple API Keys/.test(feature);
    return /Unlimited account API quota|All Business Segments|Real Sales Analytics Feed|Multiple API Keys|API Playground/.test(feature);
  }).map(feature => {
    if (/^\d+ requests per day$/.test(feature)) return `${plan.requestLimitDisplay.replace(' requests/day', '')} API requests/day`;
    if (feature === 'Unlimited account API quota*') return plan.requestLimitDisplay.replace(/\*$/, '');
    if (feature === 'Real Sales Analytics Feed') return 'Sales Analytics';
    return feature;
  });

  return <article className={`flex h-full flex-col rounded-2xl border bg-[#0d1526] p-5 sm:p-6 ${
    isCurrent ? 'border-emerald-500/40 shadow-lg shadow-emerald-950/20' : planId === 'pro'
      ? 'border-indigo-500/40 shadow-lg shadow-indigo-950/20' : 'border-sky-500/30'
  }`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">{plan.name}</p>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tracking-tight text-white">{plan.priceDisplay}</span>
          <span className="text-sm text-slate-400">{plan.billingCycle}</span>
        </div>
      </div>
      {isCurrent ? <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">Current plan</span>
        : planId === 'pro' ? <span className="shrink-0 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-semibold text-indigo-200">Popular</span> : null}
    </div>
    <ul className="mt-6 flex-1 space-y-3" aria-label={`${plan.name} benefits`}>
      {benefits.map(benefit => <li key={benefit} className="flex items-start gap-2.5 text-sm text-slate-300">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
        <span>{benefit}</span>
      </li>)}
    </ul>
    {planId === 'pro_max' && <p className="mt-4 text-xs leading-5 text-slate-500">Standard security, abuse protection, and IP rate limits still apply.</p>}
    <div className="mt-7">
      {canPurchase ? <button type="button" onClick={() => onChoose(planId)}
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1526] ${
          planId === 'pro' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-sky-600 hover:bg-sky-500'
        }`}>
        {isCurrent ? `Renew ${plan.name}` : `Get ${plan.name}`} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button> : <p className="rounded-xl border border-slate-700 px-4 py-3 text-center text-sm text-slate-400">
        {isCurrent ? 'Your current plan' : 'This plan is not available for your current entitlement.'}
      </p>}
    </div>
  </article>;
}

export default function PlanBillingPage() {
  const { entitlement, loading } = useAuth();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchasePlan, setPurchasePlan] = useState<PaidPlanId>('pro');

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

    {trial ? <FreeTrialPage embedded /> : <section aria-label="Current plan" className="rounded-2xl border border-slate-700/80 bg-[#0d1526] p-5 shadow-lg shadow-slate-950/20 sm:p-7">
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
        <p className="text-sm text-slate-400">{entitlement.plan === 'Pro'
          ? SUBSCRIPTION_PLANS.pro.requestLimitDisplay
          : entitlement.plan === 'Pro Max' ? `${SUBSCRIPTION_PLANS.pro_max.requestLimitDisplay.replace(/\*$/, '')}. Standard security, abuse protection, and IP rate limits still apply.`
            : 'Your paid account allowance follows its active entitlement.'}</p>
      </div>}
      {upgradeRequired && <p className="mt-5 border-t border-slate-700/70 pt-5 text-sm leading-6 text-amber-100/90">
        Your one-time Trial has ended. Upgrade to Pro or Pro Max to restore protected API access. Your account and existing API keys remain available.
      </p>}
      {!paid && !upgradeRequired && <p className="mt-5 border-t border-slate-700/70 pt-5 text-sm text-slate-300">Plan details are being verified. Please refresh in a moment.</p>}
    </section>}

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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <PlanCard planId="pro" currentPlan={entitlement.plan} canPurchase={entitlement.canPurchasePro} onChoose={purchase} />
        <PlanCard planId="pro_max" currentPlan={entitlement.plan} canPurchase={entitlement.canPurchaseProMax} onChoose={purchase} />
      </div>
    </section>
    <SubscriptionModal isOpen={purchaseOpen} selectedPlan={purchasePlan} onClose={() => setPurchaseOpen(false)} />
  </div>;
}
