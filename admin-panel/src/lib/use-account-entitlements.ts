'use client';
import { useEffect, useState } from 'react';
import { useAdminAuth } from './firebase/admin-auth-context';
import type { EntitlementLoadStatus } from './api-key-inventory';
export interface AccountEntitlement { plan: string; status: string; limit: number | null; used: number | null; active: boolean;
  period?: 'daily' | 'monthly' | 'trial' | 'upgrade_required'; resetsAt?: string | null; holdUntil?: string | null;
  trial?: { used: number; limit: number; active: boolean; expiresAt: string } }
export interface AccountEntitlementState {
  accounts: Record<string, AccountEntitlement>;
  status: EntitlementLoadStatus;
}
export function useAccountEntitlements(ids: string[], sourceRevision?: string, refreshVersion?: number): Record<string, AccountEntitlement>;
export function useAccountEntitlements(ids: string[], sourceRevision: string, refreshVersion: number, withState: true): AccountEntitlementState;
export function useAccountEntitlements(ids: string[], sourceRevision = '', refreshVersion = 0, withState = false) {
  const { user } = useAdminAuth();
  const key = JSON.stringify([...new Set(ids)].sort());
  const scope = JSON.stringify([user?.uid, key, sourceRevision]);
  const request = JSON.stringify([scope, refreshVersion]);
  const [result, setResult] = useState<AccountEntitlementState & { scope: string; request: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const controller = new AbortController();
    const refresh = async () => {
      const next: Record<string, AccountEntitlement> = {};
      try {
        const token = await user.getIdToken();
        const requested: string[] = JSON.parse(key);
        for (let i = 0; i < requested.length; i += 100) {
          const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
          const response = await fetch(`${base}/api/v1/admin/entitlements`, { method: 'POST', cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: requested.slice(i, i + 100) }) });
          if (!response.ok) throw new Error('Entitlement unavailable');
          const payload = await response.json();
          if (!payload.accounts || typeof payload.accounts !== 'object' || Array.isArray(payload.accounts)) throw new Error('Entitlement unavailable');
          Object.assign(next, payload.accounts);
        }
        if (!cancelled) setResult({ scope, request, accounts: next, status: 'ready' });
      } catch { if (!cancelled) setResult({ scope, request, accounts: {}, status: 'unavailable' }); }
    };
    void refresh();
    // Real user/key snapshot changes and explicit refresh replace broad polling.
    return () => { cancelled = true; controller.abort(); };
  }, [user, key, scope, request]);
  // A new identity/source never displays the previous scope's authorization.
  // An explicit refresh retains verified values while the same scope loads.
  const current: AccountEntitlementState = !user ? { accounts: {}, status: 'unavailable' }
    : result?.scope !== scope ? { accounts: {}, status: 'loading' }
    : result.request !== request ? { accounts: result.accounts, status: result.status === 'ready' ? 'refreshing' : 'loading' }
    : result;
  return withState ? current : current.accounts;
}
