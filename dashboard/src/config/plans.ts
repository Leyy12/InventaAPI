/**
 * Marketing descriptions; backend entitlement is the runtime authority.
 * Used by both pricing page and upgrade modal
 */

import { PRO_DAILY_REQUEST_LIMIT, TRIAL_MAX_PRODUCTS } from "../../../functions/entitlement-limits.mjs";
import { Zap, ShieldCheck, Building2 } from "lucide-react";

// Each advertised Pro Max capability has an explicit system test mapping.
export const PRO_MAX_CAPABILITY_IDS = [
  'unlimited_account_quota', 'all_segments', 'product_recommendations', 'real_sales_feed',
  'multiple_api_keys', 'api_playground', 'usage_history', 'renewable_30_day_term',
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
      "One API key",
      "One Business Segment",
      "Product Catalog endpoint",
      "Product Recommendations",
      "API Key Management",
      "API Usage & History",
      "One-time 7-Day Free Trial",
      "After 7 days: upgrade to Pro or Pro Max"
    ],
    
    // Exclusions (for visual comparison)
    exclusions: [
      "Real Sales Analytics Feed"
    ],
    
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
    price: 1499,
    priceDisplay: "₱1,499",
    billingCycle: "/month",
    
    // Limits
    requestLimit: PRO_DAILY_REQUEST_LIMIT,
    requestLimitDisplay: `${PRO_DAILY_REQUEST_LIMIT} requests/day`,
    
    // Description
    tagline: "For active businesses needing reliable, fast data integration",
    
    // Incremental features (adds to Free)
    incrementalFeatures: [
      "API keys share the account allowance",
      `${PRO_DAILY_REQUEST_LIMIT} requests per day`,
      "Paid linked-product catalog access",
      "Product Recommendations",
      "Real Sales Analytics Feed",
      "All Business Segments",
      "Multiple API Keys",
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
    price: 4999,
    priceDisplay: "₱4,999",
    billingCycle: "/month",
    
    // Limits
    requestLimit: null,
    requestLimitDisplay: "Unlimited account API quota*",
    
    // Description
    tagline: "For high-volume API usage",
    
    // Incremental features (adds to Pro)
    incrementalFeatures: [
      "Unlimited account API quota*",
      "All Business Segments",
      "Product Recommendations",
      "Real Sales Analytics Feed",
      "Multiple API Keys",
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

/**
 * Helper to get cumulative features for progressive display format
 * Returns features formatted as "Everything in X, and: [features]"
 */
export function getCumulativeFeatures(planId: PlanId): { header: string | null; features: readonly string[] } {
  if (planId === "free") {
    return {
      header: null,
      features: SUBSCRIPTION_PLANS.free.features
    };
  }
  
  if (planId === "pro") {
    return {
      header: "Everything in Free Trial, and:",
      features: SUBSCRIPTION_PLANS.pro.incrementalFeatures
    };
  }
  
  if (planId === "pro_max") {
    return {
      header: "Everything in Pro, and:",
      features: SUBSCRIPTION_PLANS.pro_max.incrementalFeatures
    };
  }
  
  // Fallback (should never hit)
  return {
    header: null,
    features: []
  };
}
