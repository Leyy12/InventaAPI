"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MAINTENANCE_MESSAGE } from '../../../../services/system-settings-contract.mjs';

export default function CustomerMaintenanceBoundary({ pathname, children, paymentRecovery = false }: { pathname: string; children: ReactNode; paymentRecovery?: boolean }) {
  const [policy, setPolicy] = useState<{ status: 'loading' | 'ready' | 'unavailable'; maintenance: boolean }>(
    { status: 'loading', maintenance: false });
  const [checking, setChecking] = useState(false);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++requestGeneration.current;
    activeRequest.current?.abort();
    const requestController = new AbortController();
    activeRequest.current = requestController;
    const requestSignal = AbortSignal.any([requestController.signal, AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
    setChecking(true);
    try {
      const response = await fetch('/api/v1/system/status', { cache: 'no-store',
        signal: requestSignal });
      if (!response.ok) throw new Error('Unavailable');
      const body = await response.json();
      if (body.success !== true || typeof body.maintenanceMode !== 'boolean') throw new Error('Unavailable');
      if (current === requestGeneration.current && !requestSignal.aborted) setPolicy({ status: 'ready', maintenance: body.maintenanceMode });
    } catch { if (current === requestGeneration.current && !requestController.signal.aborted && !signal?.aborted) setPolicy({ status: 'unavailable', maintenance: false }); }
    finally { if (current === requestGeneration.current && !requestController.signal.aborted && !signal?.aborted) setChecking(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const requestCounter = requestGeneration, requestRef = activeRequest;
    void Promise.resolve().then(() => { if (!controller.signal.aborted) return refresh(controller.signal); });
    // Policy checks update only this boundary; no page reload or workspace key changes.
    const timer = setInterval(() => { void refresh(controller.signal); }, 60000);
    return () => { requestCounter.current++; controller.abort(); requestRef.current?.abort(); clearInterval(timer); };
  }, [refresh]);
  // Keep payment confirmation/status and account security available. New
  // checkout creation remains blocked by the API's maintenance gate.
  if (pathname === '/dashboard/plan-billing' || pathname === '/dashboard/settings' || pathname === '/dashboard/privacy'
    || pathname === '/dashboard/api-keys' || paymentRecovery) return children;
  if (policy.status === 'ready' && !policy.maintenance) return children;
  return <section className="glass-card rounded-xl border border-white/10 p-8 max-w-2xl mx-auto" aria-live="polite">
    <h1 className="text-2xl font-bold text-white mb-3">{policy.status === 'loading' ? 'Checking service availability' : 'Temporarily unavailable'}</h1>
    <p className="text-slate-300">{policy.maintenance ? MAINTENANCE_MESSAGE : policy.status === 'loading'
      ? 'Please wait while we check the service.' : 'Service availability could not be verified. Please try again later.'}</p>
    <button type="button" disabled={checking} onClick={() => { void refresh(); }}
      className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">{checking ? 'Checking…' : 'Check again'}</button>
  </section>;
}
