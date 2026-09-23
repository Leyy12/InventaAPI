interface TimedEntitlement {
  activePro: boolean;
  activeTrial?: boolean;
  secondsRemaining: number;
}

interface PollerOptions<T> {
  read: () => Promise<T>;
  onState: (state: T | null) => void;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
  now?: () => number;
}

// One timer owner for scheduled, visibility, manual and payment refreshes.
// Generations reject stale data; they never own scheduling continuity.
export function createEntitlementPoller<T extends TimedEntitlement>({
  read, onState, schedule = setTimeout, cancel = clearTimeout, now = () => performance.now(),
}: PollerOptions<T>) {
  let running = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clearTimer() {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  }

  function scheduleNext(delay: number) {
    if (!running) return;
    clearTimer();
    timer = schedule(() => { timer = undefined; void refresh(); }, delay);
  }

  async function refresh(): Promise<T | null> {
    if (!running) return null;
    const request = ++generation;
    const requestedAt = now();
    // Install the next attempt BEFORE awaiting I/O. Even a superseded, failed,
    // or never-resolving request cannot strand the polling chain.
    scheduleNext(30000);
    onState(null);
    try {
      const state = await read();
      if (!running || request !== generation) return null;
      onState(state);
      const remaining = state.secondsRemaining * 1000 - (now() - requestedAt);
      scheduleNext((state.activePro || state.activeTrial) && Number.isFinite(remaining)
        ? Math.min(30000, Math.max(100, remaining)) : 30000);
      return state;
    } catch {
      // The latest failed verification remains null; a stale failure cannot
      // clear newer data. The already-installed timer continues independently.
      return null;
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      scheduleNext(0);
    },
    stop() {
      running = false;
      generation++;
      clearTimer();
    },
    refresh,
  };
}
