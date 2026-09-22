export type TrafficRecord = { timestamp: string | null; success: boolean | null; latencyMs: number | null };
export type TrafficState = { status: 'loading' | 'ready' | 'error'; records: TrafficRecord[] };

// No auth mutation: even 401/403 are report errors. The existing auth provider
// owns session verification, recovery and logout, independently of this sample.
export function createTrafficRequest({ base, token, current, fetcher }: {
  base: string; token: () => Promise<string>; current: () => boolean;
  fetcher: (url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
}) {
  return async (signal: AbortSignal) => {
    if (!base || !current() || signal.aborted) throw new Error('Traffic unavailable');
    const credential = await token();
    if (!current() || signal.aborted) throw new Error('Session changed');
    const response = await fetcher(base.replace(/\/$/u, '') + '/api/v1/admin/traffic', {
      headers: { Authorization: `Bearer ${credential}` }, cache: 'no-store', signal,
    });
    if (!response.ok) throw new Error('Traffic unavailable');
    return response.json();
  };
}
export function createTrafficRefresh(read: (signal: AbortSignal) => Promise<unknown>, publish: (state: TrafficState) => void,
  { current = () => true, schedule = setTimeout, cancel = clearTimeout }:
  { current?: () => boolean; schedule?: typeof setTimeout; cancel?: typeof clearTimeout } = {}) {
  let generation = 0;
  let stopped = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    async refresh() {
      if (stopped || !current()) return;
      const ticket = ++generation;
      controller?.abort();
      if (timer !== undefined) cancel(timer);
      controller = new AbortController();
      const active = () => !stopped && ticket === generation && current();
      publish({ status: 'loading', records: [] });
      timer = schedule(() => {
        if (!active()) return;
        generation++;
        controller?.abort();
        publish({ status: 'error', records: [] });
      }, 10000);
      try {
        const payload = await read(controller.signal) as { success?: boolean; records?: TrafficRecord[]; limit?: number };
        if (payload?.success !== true || payload.limit !== 500 || !Array.isArray(payload.records) || payload.records.length > 500
          || payload.records.some(row => !row || !(row.timestamp === null || typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)))
            || !(row.success === null || typeof row.success === 'boolean')
            || !(row.latencyMs === null || typeof row.latencyMs === 'number' && Number.isFinite(row.latencyMs) && row.latencyMs >= 0))) throw new Error('Invalid traffic response');
        // Project again: never retain extra response fields in component state.
        if (active()) publish({ status: 'ready', records: payload.records.map(({ timestamp, success, latencyMs }) => ({ timestamp, success, latencyMs })) });
      } catch {
        if (active()) publish({ status: 'error', records: [] });
      } finally { if (ticket === generation && timer !== undefined) cancel(timer); }
    },
    stop() { stopped = true; generation++; controller?.abort(); if (timer !== undefined) cancel(timer); },
  };
}
