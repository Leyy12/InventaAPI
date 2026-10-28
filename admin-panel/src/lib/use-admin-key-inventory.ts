'use client';
import { useEffect, useState } from 'react';
import { useAdminAuth } from './supabase/admin-auth-context';
import { validateInventoryResponse } from '../../../services/admin-key-inventory-contract.mjs';
import type { EntitlementLoadStatus } from './api-key-inventory';

export type AdminInventoryKey = { id: string; userId: string; name: string; userEmail: string; status: string;
  createdAt: string | null; lastUsed: string | null; keyLabel: string; linkedProductIds: string[] };
export function useAdminKeyInventory(refreshVersion = 0) {
  const { user } = useAdminAuth();
  const [result, setResult] = useState<{ user: typeof user; refreshVersion: number; records: AdminInventoryKey[]; status: EntitlementLoadStatus } | null>(null);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let current = true;
    void (async () => {
      try {
        const token = await user.getIdToken();
        if (!current) return;
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
        const response = await fetch(`${base}/api/v1/admin/api-keys/inventory`, { method: 'GET', cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        if (!response.ok) throw new Error('Inventory unavailable');
        const payload = validateInventoryResponse(await response.json());
        if (current) setResult({ user, refreshVersion, records: payload.records, status: 'ready' });
      } catch { if (current) setResult({ user, refreshVersion, records: [], status: 'unavailable' }); }
    })();
    return () => { current = false; controller.abort(); };
  }, [user, refreshVersion]);
  const status: EntitlementLoadStatus = !user ? 'unavailable' : result?.user !== user ? 'loading'
    : result.refreshVersion !== refreshVersion ? (result.status === 'ready' ? 'refreshing' : 'loading') : result.status;
  // Only a complete verified response may contribute to global/account counts.
  return { records: user && result?.user === user && (status === 'ready' || status === 'refreshing') ? result.records : [], status };
}
