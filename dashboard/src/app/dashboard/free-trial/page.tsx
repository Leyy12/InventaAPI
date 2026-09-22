"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { Zap, Check, AlertTriangle, ArrowRight, Clock, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function FreeTrialPage() {
  const { user, appUser, refreshAppUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      checkStatus();
    }
  }, [user]);

  const checkStatus = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
      const idToken = await user?.getIdToken();
      const res = await fetch(`${apiUrl}/api/v1/free-trial/status`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const activateTrial = async () => {
    setLoading(true);
    setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
      const idToken = await user?.getIdToken();
      const res = await fetch(`${apiUrl}/api/v1/free-trial/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to activate trial");
      }

      await refreshAppUser();
      await checkStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user || !appUser) return <div className="p-8">Loading...</div>;

  const isFreePlan = appUser.plan === "Free" || appUser.plan === "Starter";
  const hasUsedTrial = status?.hasUsedFreeTrial || appUser.hasUsedFreeTrial;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Zap className="w-8 h-8 text-amber-400" />
          7-Day Pro Trial
        </h1>
        <p className="text-slate-400 mt-2">Experience the full power of InventaAPI with a one-time free trial.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {status?.isTrial ? (
        <div className="glass-card rounded-2xl p-8 border border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent text-center">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Your Free Trial is Active!</h2>
          <p className="text-slate-300 mb-6">Enjoy 500 API requests for the next {status?.daysLeft} days.</p>
          
          <div className="flex items-center justify-center gap-6 mb-8 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Clock className="w-4 h-4 text-amber-400" />
              Expires: {new Date(status?.trialExpiresAt).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              Quota: {status?.itemQuota} API Requests
            </div>
          </div>

          <Link href="/dashboard/api-keys" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold transition-all">
            Manage API Keys <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : hasUsedTrial ? (
        <div className="glass-card rounded-2xl p-8 border border-slate-700 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Free Trial Ended</h2>
          <p className="text-slate-400 mb-6">You have already used your one-time 7-day free trial.</p>
          <a href="/?openSubscription=pro" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium transition-all">
            Subscribe to Pro Plan
          </a>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8">
          <div className="glass-card rounded-2xl p-8 border border-slate-700 flex flex-col">
            <h2 className="text-xl font-bold text-white mb-6">Unlock Pro Features</h2>
            <ul className="space-y-4 mb-8 flex-1 text-sm text-slate-300">
              <li className="flex gap-3"><Check className="w-5 h-5 text-emerald-400 shrink-0" /> Full API catalog access</li>
              <li className="flex gap-3"><Check className="w-5 h-5 text-emerald-400 shrink-0" /> 500 API request quota</li>
              <li className="flex gap-3"><Check className="w-5 h-5 text-emerald-400 shrink-0" /> 7 days of unrestricted testing</li>
              <li className="flex gap-3"><Check className="w-5 h-5 text-emerald-400 shrink-0" /> Priority API performance</li>
            </ul>
            
            <button
              onClick={activateTrial}
              disabled={loading || !isFreePlan}
              className="w-full py-3 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold transition-all flex justify-center items-center gap-2"
            >
              {loading ? "Activating..." : "Activate 7-Day Trial"}
            </button>
            {!isFreePlan && <p className="text-xs text-center text-slate-500 mt-3">Only available on the Free plan.</p>}
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 flex flex-col justify-center">
            <h3 className="font-semibold text-white mb-3">How it works</h3>
            <div className="space-y-4 text-sm text-slate-400">
              <p><strong>1. Activation:</strong> Click activate to instantly upgrade your account to the Free Trial plan.</p>
              <p><strong>2. Usage:</strong> Generate an API key and make up to 500 API calls over 7 days.</p>
              <p><strong>3. Expiration:</strong> After 7 days (or 500 calls), your trial key will automatically expire.</p>
              <p><strong>4. Upgrade:</strong> Subscribe to the Pro plan anytime to lift the limits and keep your service running.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
