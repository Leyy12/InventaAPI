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
  let current: T | null = null;
  let activeUntil: number | null = null;

  function clearState() {
    if (current !== null) onState(null);
    current = null;
    activeUntil = null;
  }

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
    // A verified active state is usable only until its server-derived deadline.
    // Routine reads must not blank a still-valid entitlement in the meantime.
    if (activeUntil !== null && requestedAt >= activeUntil) clearState();
    // Install the next attempt BEFORE awaiting I/O. Even a superseded, failed,
    // or never-resolving request cannot strand the polling chain.
    scheduleNext(activeUntil === null ? 30000 : Math.min(30000, Math.max(0, activeUntil - requestedAt)));
    try {
      const state = await read();
      if (!running || request !== generation) return null;
      const remaining = state.secondsRemaining * 1000 - (now() - requestedAt);
      if (state.activePro || state.activeTrial) {
        // Invalid or already-expired active claims cannot reopen protected UI.
        if (!Number.isFinite(remaining) || remaining <= 0) {
          clearState();
          scheduleNext(30000);
          return null;
        }
        activeUntil = now() + remaining;
      } else {
        activeUntil = null;
      }
      current = state;
      onState(state);
      scheduleNext(activeUntil === null ? 30000 : Math.min(30000, Math.max(0, activeUntil - now())));
      return state;
    } catch {
      // A failed latest verification is not permission to retain an old plan.
      // Superseded failures cannot clear a newer successful response.
      if (running && request === generation) clearState();
      return null;
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      current = null;
      activeUntil = null;
      onState(null);
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
