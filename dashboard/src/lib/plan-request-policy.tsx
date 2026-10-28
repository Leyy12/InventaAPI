"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { plansForRequestLimits, type PlanRequestLimits } from '@/config/plans';
import { useAuth } from '@/lib/supabase/auth-context';
import { requestPolicyVersion } from '../../../functions/request-limit-policy.mjs';

type Policy = { limits: PlanRequestLimits | null; version: string | null; status: 'loading' | 'ready' | 'unavailable' };
const PolicyContext = createContext<Policy>({ limits: null, version: null, status: 'loading' });
export function PlanRequestPolicyProvider({ children }: { children: ReactNode }) {
  const { user, entitlement, refreshUserDoc } = useAuth();
  const [policy, setPolicy] = useState<Policy>({ limits: null, version: null, status: 'loading' });
  const generation = useRef(0);
  const lastAccountRefresh = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !entitlement || !policy.version || policy.status !== 'ready'
      || entitlement.requestPolicyVersion === policy.version) return;
    const key = `${user.uid}:${policy.version}`;
    if (lastAccountRefresh.current === key) return;
    lastAccountRefresh.current = key;
    // A verified policy change is an explicit invalidation, not routine workspace
    // refresh. Auth state, page identity and one-time key secrets stay intact.
    void refreshUserDoc().catch(() => { /* account UI stays unavailable until verification succeeds */ });
  }, [user, entitlement, policy.version, policy.status, refreshUserDoc]);
  useEffect(() => {
    let currentRequest: AbortController | null = null;
    const requestCounter = generation;
    let active = true;
    const read = async () => {
      const current = ++generation.current;
      currentRequest?.abort(); currentRequest = new AbortController();
      try {
        const response = await fetch('/api/v1/system/status', { cache: 'no-store',
          signal: AbortSignal.any([currentRequest.signal, AbortSignal.timeout(15000)]) });
        const body = await response.json(), limits = body.planRequestLimits;
        if (!response.ok || body.success !== true || !limits || !['free_trial', 'pro', 'pro_max'].every(plan =>
          Object.hasOwn(limits, plan) && (Number.isSafeInteger(limits[plan]) && limits[plan] > 0 || plan !== 'pro' && limits[plan] === null))
          || body.requestPolicyVersion !== requestPolicyVersion(limits)) throw new Error('Unverified request policy');
        if (active && current === generation.current) setPolicy(previous => previous.status === 'ready' && previous.version === body.requestPolicyVersion
          ? previous : { limits, version: body.requestPolicyVersion, status: 'ready' });
      } catch { if (active && current === generation.current) setPolicy({ limits: null, version: null, status: 'unavailable' }); }
    };
    void read(); const timer = setInterval(() => { void read(); }, 30000);
    return () => { active = false; requestCounter.current++; currentRequest?.abort(); clearInterval(timer); };
  }, []);
  return <PolicyContext.Provider value={policy}>{children}</PolicyContext.Provider>;
}
export function useAccountRequestAllowance() {
  const policy = useContext(PolicyContext), { entitlement } = useAuth();
  return policy.status === 'ready' && entitlement?.requestPolicyVersion === policy.version ? entitlement.apiRequestLimit : undefined;
}
export function usePlanCatalog(personalized = false) {
  const policy = useContext(PolicyContext), { user, entitlement } = useAuth();
  let limits = policy.limits;
  if (personalized && user) {
    const offers = entitlement?.purchaseRequestLimits;
    limits = offers && policy.limits && entitlement?.requestPolicyVersion === policy.version
      ? { ...policy.limits, ...offers, ...(entitlement?.activeTrial ? { free_trial: entitlement.apiRequestLimit } : {}) } : null;
  }
  return { plans: plansForRequestLimits(limits), status: limits ? 'ready' : policy.status === 'loading' ? 'loading' : 'unavailable',
    requestPolicyVersion: limits ? policy.version : null };
}
