"use client";

import { useAuth } from "@/lib/firebase/auth-context";
import { Settings2, Building2 } from "lucide-react";
import Link from "next/link";
import { useState } from 'react';
import SubscriptionModal from '@/components/subscription/SubscriptionModal';

export default function SettingsPage() {
  const { appUser, loading, entitlement } = useAuth();
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);

  if (loading || !entitlement) {
    return (
      <div className="w-full px-6 lg:px-8 space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-slate-800 rounded"></div>
        <div className="h-64 glass-card rounded-xl"></div>
      </div>
    );
  }

  // Only show this setting for Free plan users
  const isFreePlan = appUser?.plan === "Free";

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
        {entitlement.canPurchasePro && <button onClick={() => setSubscriptionOpen(true)}
          className="mb-6 text-indigo-400 font-semibold">{entitlement.activePro ? 'Renew Pro — 30 more days' : 'Subscribe to Pro'}</button>}
        <SubscriptionModal isOpen={subscriptionOpen} onClose={() => setSubscriptionOpen(false)} />
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
                  Your current product catalog is restricted to the segment you chose during signup. 
                  You can only access products from this specific category.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-sm">
                  <span className="text-slate-400">Current:</span>
                  <span className="text-white font-medium">{appUser?.selectedSegment || "None"}</span>
                </div>
              </div>
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
    </div>
  );
}
