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

// Event-driven verification: entry, explicit recovery/payment and the exact
// server-derived expiry boundary. No periodic or browser-focus polling.
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

  function scheduleExpiry() {
    clearTimer();
    if (!running || activeUntil === null) return;
    // Long paid terms can exceed the browser timer range. Intermediate clock
    // checkpoints only re-arm the timer; they never perform network reads.
    timer = schedule(() => {
      timer = undefined;
      if (!running || activeUntil === null) return;
      if (now() < activeUntil) { scheduleExpiry(); return; }
      clearState();
      void refresh();
    }, Math.min(2147483647, Math.max(0, activeUntil - now())));
  }

  async function refresh(): Promise<T | null> {
    if (!running) return null;
    const request = ++generation;
    const requestedAt = now();
    // A verified active state is usable only until its server-derived deadline.
    // Routine reads must not blank a still-valid entitlement in the meantime.
    if (activeUntil !== null && requestedAt >= activeUntil) clearState();
    // An explicit pending read cannot extend the previous verified deadline.
    scheduleExpiry();
    try {
      const state = await read();
      if (!running || request !== generation) return null;
      const remaining = state.secondsRemaining * 1000 - (now() - requestedAt);
      if (state.activePro || state.activeTrial) {
        // Invalid or already-expired active claims cannot reopen protected UI.
        if (!Number.isFinite(remaining) || remaining <= 0) {
          clearState();
          clearTimer();
          return null;
        }
        activeUntil = now() + remaining;
      } else {
        activeUntil = null;
      }
      current = state;
      onState(state);
      scheduleExpiry();
      return state;
    } catch {
      // A failed latest verification is not permission to retain an old plan.
      // Superseded failures cannot clear a newer successful response.
      if (running && request === generation) { clearState(); clearTimer(); }
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
      timer = schedule(() => { timer = undefined; void refresh(); }, 0);
    },
    stop() {
      running = false;
      generation++;
      clearTimer();
    },
    refresh,
  };
}
