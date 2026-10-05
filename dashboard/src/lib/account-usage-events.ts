// In-memory invalidation only: no credentials, customer data or browser storage.
const listeners = new Map<string, Set<() => void>>();

export function subscribeAccountUsage(uid: string, refresh: () => void) {
  const account = listeners.get(uid) ?? new Set<() => void>();
  account.add(refresh);
  listeners.set(uid, account);
  return () => {
    account.delete(refresh);
    if (!account.size) listeners.delete(uid);
  };
}

export function invalidateAccountUsage(uid: string) {
  for (const refresh of listeners.get(uid) ?? []) refresh();
}
