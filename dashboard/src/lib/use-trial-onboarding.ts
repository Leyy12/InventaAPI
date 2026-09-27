"use client";

import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';

type TrialOnboarding = { eligible: boolean; status: string };

// Presentation only. The backend evaluates eligibility again for every mutation.
export function useTrialOnboarding(user: User | null, shouldCheck: boolean) {
  const [result, setResult] = useState<{ uid: string; data: TrialOnboarding } | null>(null);

  useEffect(() => {
    if (!user || !shouldCheck) return;
    const controller = new AbortController();
    async function readStatus() {
      try {
        const token = await user!.getIdToken();
        if (controller.signal.aborted) return;
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/free-trial/status`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) return;
        const data: TrialOnboarding = await response.json();
        if (!controller.signal.aborted && typeof data.eligible === 'boolean' && typeof data.status === 'string') {
          setResult({ uid: user!.uid, data });
        }
      } catch { /* Unverified state must not unlock key generation. */ }
    }
    void readStatus();
    return () => controller.abort();
  }, [user, shouldCheck]);

  return shouldCheck && result && result.uid === user?.uid ? result.data : null;
}
