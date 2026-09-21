export type QuotaSource = { status: 'loading' | 'ready' | 'error'; count: number | null; usage: unknown };

// One quota read per existing entitlement verification; bounded failure retries.
// No subscription polling or inferred allowance. Values come only from read().
export function createQuotaRefresh({ read, onState, schedule = setTimeout, cancel = clearTimeout }: {
  read: (signal: AbortSignal) => Promise<{ keys: unknown[]; usage: unknown }>;
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
      timer = schedule(run, 30000);
    };
    timer = schedule(fail, 10000);
    void Promise.resolve().then(() => { if (!stopped && request === generation) return read(controller.signal); }).then(result => {
      if (stopped || request !== generation) return;
      if (!result || !Array.isArray(result.keys)) { fail(); return; }
      if (timer !== undefined) cancel(timer);
      timer = undefined;
      onState({ status: 'ready', count: result.keys.length, usage: result.usage });
    }, fail);
  }
  return {
    start() { if (!started && !stopped) { started = true; run(); } },
    stop() { stopped = true; generation++; abort?.abort(); if (timer !== undefined) cancel(timer); },
  };
}
