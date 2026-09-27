"use client";

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import SubscriptionModal from '@/components/subscription/SubscriptionModal';
import FreeTrialPage from '../free-trial/page';

export default function PlanBillingPage() {
  const { entitlement, loading } = useAuth();
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  if (loading || !entitlement) return <p role="status" className="p-8 text-slate-300">Verifying your plan and billing status…</p>;

  const paid = entitlement.activePro || ['Enterprise', 'Unlimited'].includes(entitlement.plan);
  const trial = entitlement.activeTrial === true;
  const upgradeRequired = entitlement.subscription_status === 'upgrade_required';
  const currentPlan = paid ? entitlement.plan : trial ? '7-Day Pro Trial' : upgradeRequired ? 'Upgrade Required' : 'Free';

  return <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 space-y-6">
    <header>
      <h1 className="text-3xl font-bold text-white flex items-center gap-3"><CreditCard className="text-indigo-400" aria-hidden="true" />Plan & Billing</h1>
      <p className="mt-2 text-slate-400">Your verified account plan, trial lifecycle, and upgrade options.</p>
    </header>

    <section aria-label="Current plan" className="glass-card rounded-2xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Current Plan: {currentPlan}</h2>
      {paid && <>
        <p className="text-slate-300">Status: {entitlement.subscription_status}</p>
        {entitlement.subscriptionExpiresAt && <p className="text-slate-300">Subscription expiry: {new Date(entitlement.subscriptionExpiresAt).toUTCString()}</p>}
        <p className="text-slate-300">{entitlement.plan === 'Pro'
          ? '5,000 account API requests per UTC day.'
          : 'Your paid account allowance is governed by your current entitlement.'}</p>
      </>}
      {!paid && !trial && !upgradeRequired && <p className="text-slate-300">API key creation begins when you activate your one-time 7-Day Pro Trial. The trial includes 500 total API requests across your keys.</p>}
      {upgradeRequired && <p className="text-amber-200">Your trial ended or its 500-request allowance was exhausted. Upgrade to restore protected API access.</p>}
    </section>

    {!paid && <FreeTrialPage embedded />}

    <section id="upgrade" aria-label="Upgrade options" className="glass-card rounded-2xl border border-slate-700 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-white">{paid ? 'Manage your paid plan' : 'Upgrade options'}</h2>
      <p className="text-sm text-slate-400">Purchases are confirmed by the server; visiting this page does not start a checkout or activate a trial.</p>
      <div className="flex flex-wrap gap-3">
        {entitlement.canPurchasePro && <button type="button" onClick={() => setPurchaseOpen(true)}
          className="rounded-lg bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500">
          {paid && entitlement.plan === 'Pro' ? 'Renew Pro' : 'Get Pro'}
        </button>}
      </div>
    </section>
    <SubscriptionModal isOpen={purchaseOpen} selectedPlan="pro" onClose={() => setPurchaseOpen(false)} />
  </div>;
}
