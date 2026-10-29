/**
 * Marketing descriptions; backend entitlement is the runtime authority.
 * Used by both pricing page and upgrade modal
 */

import { PAID_MONTHLY_REQUEST_LIMIT, PRO_MAX_SEGMENT_KEYS, TRIAL_MAX_ACTIVE_KEYS, TRIAL_MAX_PRODUCTS } from "../../../functions/entitlement-limits.mjs";

const MONTHLY = PAID_MONTHLY_REQUEST_LIMIT.toLocaleString("en-US");
export const PRO_REQUEST_LABEL = `${MONTHLY} API requests per month`;
export const PRO_MAX_REQUEST_LABEL = `${MONTHLY} API requests per month for each segment`;
import { Zap, ShieldCheck, Building2 } from "lucide-react";

// Each advertised Pro Max capability has an explicit system test mapping.
export const PRO_MAX_CAPABILITY_IDS = [
  'monthly_segment_quota', 'all_segments', 'segment_api_keys', 'auto_segment_routing',
  'api_playground', 'usage_history', 'renewable_30_day_term',
] as const;

export const SUBSCRIPTION_PLANS = {
  free: {
    // Identifiers
    id: "free",
    name: "Free Trial",
    displayName: "Free Trial",
    
    // Pricing
    price: 0,
    priceDisplay: "₱0",
    billingCycle: "7 days",
    
    // Limits
    requestLimit: null,
    requestLimitDisplay: `Up to ${TRIAL_MAX_PRODUCTS} products`,
    
    // Description
    tagline: "For developers exploring the API or proof-of-concept testing",
    
    // Features (base features only)
    features: [
      `Up to ${TRIAL_MAX_PRODUCTS} products`,
      `Up to ${TRIAL_MAX_ACTIVE_KEYS} API keys`,
      "One Business Segment",
      "Product Catalog endpoint",
      "API Key Management",
      "API Usage & History",
      "One-time 7-Day Free Trial",
      "After 7 days: upgrade to Pro or Pro Max"
    ],
    
    // Exclusions (for visual comparison)
    exclusions: [],
    
    // UI
    ctaText: "Get Started Free",
    highlighted: false,
    badge: null,
    icon: Zap,
    gradient: "from-slate-600 to-slate-500",
    accent: "border-slate-600/50 bg-slate-800/50",
    badgeColor: "text-slate-400",
  },
  
  pro: {
    // Identifiers
    id: "pro",
    name: "Pro",
    displayName: "Pro",
    
    // Pricing
    price: 500,
    priceDisplay: "₱500",
    billingCycle: "/month",
    
    // Limits
    requestLimit: PAID_MONTHLY_REQUEST_LIMIT,
    requestLimitDisplay: PRO_REQUEST_LABEL,
    
    // Description
    tagline: "For active businesses needing reliable, fast data integration",
    
    // Incremental features (adds to Free)
    incrementalFeatures: [
      PRO_REQUEST_LABEL,
      "One API key — add products to it anytime",
      "Your business segment's catalog",
      "API Playground",
      "Usage & Integration History",
      "30-Day Renewable Subscription"
    ],
    
    // Exclusions (for visual comparison)
    exclusions: [],
    
    // UI
    ctaText: "Subscribe Now",
    highlighted: true,
    badge: "MOST POPULAR",
    icon: ShieldCheck,
    gradient: "from-indigo-600 to-violet-600",
    accent: "border-indigo-500/50 bg-indigo-950/50",
    badgeColor: "text-indigo-400",
  },
  
  pro_max: {
    // Identifiers
    id: "pro_max",
    name: "Pro Max",
    displayName: "Pro Max",
    
    // Pricing
    price: 1300,
    priceDisplay: "₱1,300",
    billingCycle: "/month",
    
    // Limits
    requestLimit: PAID_MONTHLY_REQUEST_LIMIT,
    requestLimitDisplay: PRO_MAX_REQUEST_LABEL,
    
    // Description
    tagline: "For high-volume API usage",
    
    // Incremental features (adds to Pro)
    incrementalFeatures: [
      PRO_MAX_REQUEST_LABEL,
      "All Business Segments",
      `Up to ${PRO_MAX_SEGMENT_KEYS} API keys — one per segment`,
      "Products sorted into the right key automatically",
      "API Playground",
      "Usage & Integration History",
      "30-day renewable subscription"
    ],
    
    // No exclusions - includes everything
    exclusions: [],
    
    // UI
    ctaText: "Get Pro Max",
    highlighted: false,
    badge: null,
    icon: Building2,
    gradient: "from-sky-600 to-indigo-600",
    accent: "border-sky-500/40 bg-sky-950/30",
    badgeColor: "text-sky-300",
  },
} as const;

export type PlanId = keyof typeof SUBSCRIPTION_PLANS;
// Active Pro / Pro Max allowance in words; null for Trial and other plans.
export function paidAllowanceLabel(entitlement: { activePro?: boolean; plan?: string } | null | undefined): string | null {
  if (!entitlement?.activePro) return null;
  return entitlement.plan === 'Pro' ? PRO_REQUEST_LABEL : entitlement.plan === 'Pro Max' ? PRO_MAX_REQUEST_LABEL : null;
}
export type PlanRequestLimits = { free_trial: number | null; pro: number; pro_max: number | null };
export function requestAllowanceLabel(limit: number | null | undefined, trial = false): string {
  if (limit === undefined) return 'Request allowance unavailable';
  if (limit === null) return trial ? 'Unlimited requests during the active 7-day Trial' : 'Unlimited account request quota';
  return `${limit.toLocaleString()} requests/day (UTC)`;
}
// Static metadata above contains accepted baseline descriptions, never a runtime
// fallback. Mounted cards use the verified API policy or explicitly unavailable text.
export function plansForRequestLimits(limits: PlanRequestLimits | null) {
  return {
    free: { ...SUBSCRIPTION_PLANS.free, requestLimit: limits?.free_trial,
      requestLimitDisplay: requestAllowanceLabel(limits?.free_trial, true),
      features: [...SUBSCRIPTION_PLANS.free.features, requestAllowanceLabel(limits?.free_trial, true)] },
    // Paid plans count requests per month (fixed); only the Trial uses the configurable policy.
    pro: SUBSCRIPTION_PLANS.pro,
    pro_max: SUBSCRIPTION_PLANS.pro_max,
  };
}

/**
 * Helper to get cumulative features for progressive display format
 * Returns features formatted as "Everything in X, and: [features]"
 */
export function getCumulativeFeatures(planId: PlanId, plans: ReturnType<typeof plansForRequestLimits> | typeof SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS): { header: string | null; features: readonly string[] } {
  if (planId === "free") {
    return {
      header: null,
      features: plans.free.features
    };
  }
  
  if (planId === "pro") {
    return {
      header: "Everything in Free Trial, and:",
      features: plans.pro.incrementalFeatures
    };
  }
  
  if (planId === "pro_max") {
    return {
      header: "Everything in Pro, and:",
      features: plans.pro_max.incrementalFeatures
    };
  }
  
  // Fallback (should never hit)
  return {
    header: null,
    features: []
  };
}
