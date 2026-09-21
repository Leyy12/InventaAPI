export type HistoryRecord = { keyName: string | null; timestamp: string | null; endpoint: string | null; method: string | null; statusCode: number | null };
export type HistoryState = { status: 'loading' | 'ready' | 'error'; records: HistoryRecord[]; hasMore: boolean };

export function requestStatus(code: number | null) {
  if (!Number.isInteger(code) || code === null || code < 100 || code > 599) return 'Not recorded';
  return `${code} · ${code < 200 ? 'Informational' : code < 300 ? 'Success' : code < 400 ? 'Redirect' : code < 500 ? 'Client error' : 'Server error'}`;
}
export function historyDate(timestamp: string | null) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return 'Not recorded';
  return new Date(timestamp).toLocaleString();
}
export function createHistoryRefresh(read: (signal: AbortSignal) => Promise<unknown>, publish: (state: HistoryState) => void,
  { schedule = setTimeout, cancel = clearTimeout }: { schedule?: typeof setTimeout; cancel?: typeof clearTimeout } = {}) {
  let generation = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    async refresh() {
      const ticket = ++generation;
      controller?.abort();
      if (timer !== undefined) cancel(timer);
      controller = new AbortController();
      publish({ status: 'loading', records: [], hasMore: false });
      timer = schedule(() => {
        if (ticket !== generation) return;
        generation++;
        controller?.abort();
        publish({ status: 'error', records: [], hasMore: false });
      }, 10000);
      try {
        const payload = await read(controller.signal) as { success?: boolean; records?: HistoryRecord[]; hasMore?: boolean; limit?: number };
        if (payload?.success !== true || payload.limit !== 50 || !Array.isArray(payload.records) || payload.records.length > 50 || typeof payload.hasMore !== 'boolean'
          || payload.records.some(row => !row || !['keyName', 'timestamp', 'endpoint', 'method'].every(key => row[key as keyof HistoryRecord] === null || typeof row[key as keyof HistoryRecord] === 'string')
            || !(row.statusCode === null || Number.isInteger(row.statusCode) && row.statusCode >= 100 && row.statusCode <= 599))) throw new Error('Invalid history response');
        if (ticket === generation) publish({ status: 'ready', records: payload.records, hasMore: payload.hasMore });
      } catch {
        if (ticket === generation) publish({ status: 'error', records: [], hasMore: false });
      } finally { if (ticket === generation && timer !== undefined) cancel(timer); }
    },
    stop() { generation++; controller?.abort(); if (timer !== undefined) cancel(timer); },
  };
}
