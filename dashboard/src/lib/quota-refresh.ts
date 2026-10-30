export type TrialCatalog = { productsIncluded: number; productsAvailable: number; activeKeys: number; expiresAt: string };
// Active Pro / Pro Max: product variants delivered per UTC month for the account
// (Pro 15,000, Pro Max 20,000), Pro Max's per-segment share of it, and the products
// on the account's one API key.
export type MonthlyUsage = { period: 'monthly'; window: string; resetsAt: string; limit: number; plan: 'pro' | 'pro_max';
  buckets: { bucket: string; used: number; remaining: number }[];
  segments?: { segment: string; used: number }[];
  products?: { total: number; limit: number; bySegment?: { segment: string; count: number }[] } };
export type QuotaSource = { status: 'loading' | 'ready' | 'error'; count: number | null; usage: unknown; trialCatalog?: TrialCatalog; monthlyUsage?: MonthlyUsage };

// One quota read on entry, explicit retry or a relevant account-usage event.
// No subscription polling or inferred allowance. Values come only from read().
export function createQuotaRefresh({ read, onState, schedule = setTimeout, cancel = clearTimeout }: {
  read: (signal: AbortSignal) => Promise<{ keys: unknown[]; usage: unknown; trialCatalog?: TrialCatalog; monthlyUsage?: MonthlyUsage }>;
  onState: (source: QuotaSource) => void;
  schedule?: typeof setTimeout; cancel?: typeof clearTimeout;
}) {
  let stopped = false, started = false, generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  function run() {
    if (stopped) return;
    const request = ++generation;
    const controller = new AbortController();
    abort = controller;
    onState({ status: 'loading', count: null, usage: null });
    const fail = () => {
      if (stopped || request !== generation) return;
      generation++;
      if (timer !== undefined) cancel(timer);
      controller.abort();
      onState({ status: 'error', count: null, usage: null });
      timer = undefined;
    };
    timer = schedule(fail, 10000);
    void Promise.resolve().then(() => { if (!stopped && request === generation) return read(controller.signal); }).then(result => {
      if (stopped || request !== generation) return;
      if (!result || !Array.isArray(result.keys)) { fail(); return; }
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      onState({ status: 'ready', count: result.keys.length, usage: result.usage,
        ...(result.trialCatalog ? { trialCatalog: result.trialCatalog } : {}),
        ...(result.monthlyUsage ? { monthlyUsage: result.monthlyUsage } : {}) });
    }, fail);
  }
  return {
    start() { if (!started && !stopped) { started = true; run(); } },
    refresh() {
      if (!started || stopped) return;
      generation++;
      abort?.abort();
      if (timer !== undefined) cancel(timer);
      run();
    },
    stop() { stopped = true; generation++; abort?.abort(); if (timer !== undefined) cancel(timer); },
  };
}
