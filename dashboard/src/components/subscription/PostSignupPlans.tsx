"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import PlanCards from "@/components/subscription/PlanCards";
import SubscriptionModal from "@/components/subscription/SubscriptionModal";
import { usePlanCatalog } from "@/lib/plan-request-policy";
import type { PlanId } from "@/config/plans";

// Shown right after signup has signed the new account in: every plan, before the dashboard.
// Free continues on the account's default Free Trial; a paid plan opens the existing checkout.
export default function PostSignupPlans({ initialPlan = null }: { initialPlan?: PlanId | null }) {
  const { plans, status } = usePlanCatalog();
  const router = useRouter();
  // A paid plan picked on the landing page before signing up opens its checkout straight away.
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(initialPlan === "pro" || initialPlan === "pro_max" ? initialPlan : null);

  return (
    <section aria-labelledby="post-signup-plans-title" className="w-full max-w-6xl relative z-10">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300 mb-4">
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
          Account created
        </div>
        <h1 id="post-signup-plans-title" className="text-3xl md:text-4xl font-bold text-white mb-3">Choose your plan</h1>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Start with the Free Trial or upgrade now. You can change your plan anytime from Plan &amp; Billing.
        </p>
      </div>

      <PlanCards
        plans={plans}
        // The Free Trial needs no plan details; paid checkout waits for the verified allowance.
        isDisabled={plan => plan !== "free" && status !== "ready"}
        ctaText={plan => plan === "free" ? "Continue with Free Trial" : plans[plan].ctaText}
        onSelect={plan => plan === "free" ? router.push("/dashboard") : setCheckoutPlan(plan)}
      />

      <SubscriptionModal
        isOpen={checkoutPlan !== null}
        onClose={() => setCheckoutPlan(null)}
        selectedPlan={checkoutPlan ?? "pro"}
      />
    </section>
  );
}
