/**
 * Single Source of Truth for Subscription Plans
 * Used by both pricing page and upgrade modal
 */

import { Zap, ShieldCheck, Building2, LucideIcon } from "lucide-react";

export const SUBSCRIPTION_PLANS = {
  free: {
    // Identifiers
    id: "free",
    name: "Free",
    displayName: "Free",
    
    // Pricing
    price: 0,
    priceDisplay: "₱0",
    billingCycle: "forever",
    
    // Limits
    requestLimit: 50,
    requestLimitDisplay: "50 requests/day",
    apiKeys: 1,
    
    // Description
    tagline: "For developers exploring the API or proof-of-concept testing",
    
    // Features (base features only)
    features: [
      "1 API Key (shared access)",
      "50 requests per day",
      "Product Catalog endpoint",
      "Product Recommendations",
      "Community support"
    ],
    
    // Exclusions (for visual comparison)
    exclusions: [
      "Sales Analytics Feed",
      "Priority Support",
      "Custom Business Segment"
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
    requestLimit: 5000,
    requestLimitDisplay: "5,000 requests/day",
    apiKeys: 1,
    
    // Description
    tagline: "For active businesses needing reliable, fast data integration",
    
    // Incremental features (adds to Free)
    incrementalFeatures: [
      "1 Dedicated API Key",
      "5,000 requests per day",
      "Full Product Catalog + Recommendations",
      "Sales Analytics Feed",
      "All Business Segments",
      "Email + Chat Support"
    ],
    
    // Exclusions (for visual comparison)
    exclusions: [
      "Custom Endpoints"
    ],
    
    // UI
    ctaText: "Subscribe Now",
    highlighted: true,
    badge: "MOST POPULAR",
    icon: ShieldCheck,
    gradient: "from-indigo-600 to-violet-600",
    accent: "border-indigo-500/50 bg-indigo-950/50",
    badgeColor: "text-indigo-400",
  },
  
  enterprise: {
    // Identifiers
    id: "enterprise",
    name: "Enterprise",
    displayName: "Enterprise",
    
    // Pricing
    price: null,
    priceDisplay: "Custom",
    billingCycle: "pricing",
    
    // Limits
    requestLimit: null, // unlimited
    requestLimitDisplay: "Unlimited requests",
    apiKeys: null, // multiple
    
    // Description
    tagline: "For large-scale ERP integrations and multi-branch businesses",
    
    // Incremental features (adds to Pro)
    incrementalFeatures: [
      "Multiple API Keys",
      "Unlimited requests",
      "All endpoints + Custom routes",
      "Priority dedicated support",
      "Custom Business Segments",
      "99.9% SLA Guarantee",
      "NDA + Custom data agreement"
    ],
    
    // No exclusions - includes everything
    exclusions: [],
    
    // UI
    ctaText: "Contact Sales",
    highlighted: false,
    badge: null,
    icon: Building2,
    gradient: "from-emerald-600 to-teal-600",
    accent: "border-emerald-500/50 bg-emerald-950/50",
    badgeColor: "text-emerald-400",
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
      header: "Everything in Free, and:",
      features: SUBSCRIPTION_PLANS.pro.incrementalFeatures
    };
  }
  
  if (planId === "enterprise") {
    return {
      header: "Everything in Pro, and:",
      features: SUBSCRIPTION_PLANS.enterprise.incrementalFeatures
    };
  }
  
  // Fallback (should never hit)
  return {
    header: null,
    features: []
  };
}
