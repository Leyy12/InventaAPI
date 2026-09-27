import type { AuthStatus } from '../../../services/auth-navigation';

// A verified role alone is not enough to mount protected Customer content.
// UPGRADE_REQUIRED is a real backend entitlement; only null is pending.
export function customerProtectedReady({ loading, authStatus, role, entitlement }: {
  loading: boolean;
  authStatus: AuthStatus;
  role: string | null;
  entitlement: unknown | null;
}): boolean {
  return !loading && authStatus === 'verified' && role === 'customer' && entitlement !== null;
}
