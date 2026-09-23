'use client';
import { useEffect, useState } from 'react';
import { useAdminAuth } from './firebase/admin-auth-context';
export interface AccountEntitlement { plan: string; status: string; limit: number | null; used: number | null; active: boolean;
  period?: 'daily' | 'monthly' | 'trial'; resetsAt?: string | null; holdUntil?: string | null;
  trial?: { used: number; limit: number; active: boolean; expiresAt: string } }
export function useAccountEntitlements(ids: string[]) {
  const { user } = useAdminAuth();
  const key = JSON.stringify([...new Set(ids)].sort());
  const [accounts, setAccounts] = useState<Record<string, AccountEntitlement>>({});
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refresh = async () => {
      const next: Record<string, AccountEntitlement> = {};
      try {
        const token = await user.getIdToken();
        const requested: string[] = JSON.parse(key);
        for (let i = 0; i < requested.length; i += 100) {
          const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
          const response = await fetch(`${base}/api/v1/admin/entitlements`, { method: 'POST', cache: 'no-store',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: requested.slice(i, i + 100) }) });
          if (!response.ok) throw new Error('Entitlement unavailable');
          Object.assign(next, (await response.json()).accounts);
        }
        if (!cancelled) setAccounts(next);
      } catch { if (!cancelled) setAccounts({}); }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user, key]);
  return accounts;
}
