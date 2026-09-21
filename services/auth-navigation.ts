// Browser UX/route decisions only. Backend authorization remains authoritative.
import { accountBlocked } from '../functions/subscription-lifecycle.mjs';

export const LANDING_SEEN_KEY = 'inventa.landing-completed.v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function landingSeen(storage: StorageLike | null): boolean {
  try { return storage?.getItem(LANDING_SEEN_KEY) === '1'; } catch { return false; }
}
export function completeLanding(storage: StorageLike | null): void {
  try { storage?.setItem(LANDING_SEEN_KEY, '1'); } catch { /* Persistence is optional UX. */ }
}
export function browserStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }
}
export type AuthProfile = { role?: unknown; plan?: unknown; disabled?: unknown; deleted?: unknown;
  deletedAt?: unknown; deletionRequested?: unknown; status?: unknown; accountState?: unknown };
export function profileRole(profile: AuthProfile | null): 'customer' | 'admin' | null {
  if (accountBlocked(profile)) return null;
  const role = typeof profile?.role === 'string' ? profile.role.toLowerCase() : '';
  if (role === 'admin') return 'admin';
  return ['developer', 'consumer', 'business'].includes(role) ? 'customer' : null;
}
export function customerPublicPath(path: string): boolean {
  return ['/', '/login', '/signup', '/privacy-policy', '/terms-of-service', '/contact'].includes(path);
}
export function navigationDecision({ app = 'customer', path, initializing, role, seen = false,
  entryFlow = false }: { app?: 'customer' | 'admin'; path: string; initializing: boolean;
    role: ReturnType<typeof profileRole>; seen?: boolean; entryFlow?: boolean }): string | null {
  if (initializing) return null;
  if (app === 'admin') return role === 'admin' ? (path === '/login' ? '/' : null)
    : (path === '/login' ? null : '/login');
  if (role === 'admin') return 'admin-app';
  if (!customerPublicPath(path)) return role === 'customer' ? null : '/login';
  if (path !== '/' && path !== '/login') return null;
  if (entryFlow) return null; // Explicit existing signup/plan/login handoff owns completion.
  if (role === 'customer') return '/dashboard';
  return path === '/' && seen ? '/login' : null;
}
// An operator-configured app origin, never a URL supplied by a visitor/query string.
export function adminLoginDestination(config: string | undefined, hostname: string): string | null {
  try {
    const local = ['localhost', '127.0.0.1'].includes(hostname);
    const url = new URL(config || (local ? 'http://localhost:3001' : ''));
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local
      && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return `${url.origin}/login`;
  } catch { return null; }
}
// Preserve only the existing entry intents. No arbitrary next/redirect/returnUrl support.
export function loginEntryQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of ['login', 'registered', 'choosePlan']) if (params.get(key) === 'true') out.set(key, 'true');
  if (params.get('payment') === 'cancelled') out.set('payment', 'cancelled');
  if (['free', 'pro', 'enterprise'].includes(params.get('pendingPlan') || '')) out.set('pendingPlan', params.get('pendingPlan')!);
  if (['admin_auth_failed', 'token_expired', 'admin_only', 'user_not_found'].includes(params.get('error') || '')) out.set('error', params.get('error')!);
  return out.toString();
}
export function invalidSessionError(error: unknown): boolean {
  const value = error as { status?: number; code?: string } | null;
  return value?.status === 401 || value?.status === 403
    || ['auth/user-disabled', 'auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-not-found'].includes(value?.code || '');
}

export type AuthStatus = 'initializing' | 'verified' | 'unauthenticated' | 'invalid' | 'denied' | 'unverified';
export function authScreen(status: AuthStatus): 'checking' | 'retry' | 'ready' {
  return status === 'initializing' ? 'checking' : status === 'unverified' ? 'retry' : 'ready';
}
export type LogoutResult = { ok: boolean };
export const LOGOUT_ERROR = 'Logout failed. Your browser session may still be active. Please try again.';
export async function verifyWithin<T>(read: () => Promise<T>, timeoutMs = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Verification unavailable.')), timeoutMs);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

// One in-flight logout. SDK failure never clears derived identity or implies success.
export function createLogoutAction<U>({ currentUser, signOut, completed, changed, active }: {
  currentUser: () => U | null; signOut: () => Promise<void>; completed: () => void;
  changed: (busy: boolean, error: string | null) => void; active: () => boolean;
}) {
  let pending: Promise<LogoutResult> | null = null;
  return () => {
    if (pending) return pending;
    const identity = currentUser();
    changed(true, null);
    pending = (async () => {
      try {
        await Promise.resolve();
        if (!active()) return { ok: false };
        if (currentUser() !== null && currentUser() !== identity) {
          changed(false, LOGOUT_ERROR); return { ok: false };
        }
        await signOut();
        if (!active()) return { ok: false };
        // Do not clear or navigate a different session established during the await.
        if (currentUser() !== null && currentUser() !== identity) {
          changed(false, LOGOUT_ERROR); return { ok: false };
        }
        completed(); changed(false, null); return { ok: true };
      } catch {
        if (active()) changed(false, LOGOUT_ERROR);
        return { ok: false };
      } finally { pending = null; }
    })();
    return pending;
  };
}

// Injected session gate: uncertainty retains the SDK identity, never authorization.
export function createAuthSession<U extends { uid: string }, P extends AuthProfile>({ readProfile, publish,
  rejected, timeoutMs = 10000, schedule = setTimeout, cancel = clearTimeout }: {
    readProfile: (user: U, forceRefresh: boolean) => Promise<P | null>;
    publish: (state: { user: U | null; profile: P | null; loading: boolean; status: AuthStatus }) => void;
    rejected: (user: U | null) => void;
    timeoutMs?: number; schedule?: typeof setTimeout; cancel?: typeof clearTimeout;
  }) {
  let generation = 0;
  let stopped = false;
  let observed = false;
  let currentStatus: AuthStatus = 'initializing';
  let identity: U | null = null;
  let blockedUid: string | null = null;
  let pending: Promise<void> | null = null;
  let settle: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const finish = () => { generation++; clearTimer(); pending = null; settle?.(); settle = undefined; };
  const emit = (status: AuthStatus, profile: P | null = null) => {
    currentStatus = status;
    if (!stopped) publish({ user: status === 'unauthenticated' ? null : identity,
      profile, loading: status === 'initializing', status });
  };
  const uncertain = () => { finish(); emit('unverified'); };
  const deny = (status: 'invalid' | 'denied' = 'denied') => {
    // A later SDK login/token event may reverify, but can never reuse the rejected profile.
    finish(); emit(status); rejected(identity);
  };
  const failed = (error: unknown) => {
    if (!invalidSessionError(error)) { uncertain(); return; }
    const value = error as { status?: number; code?: string };
    deny(value.status === 401 || ['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-not-found'].includes(value.code || '')
      ? 'invalid' : 'denied');
  };
  timer = schedule(uncertain, timeoutMs);
  const gate = {
    accept(user: U | null, forceRefresh = false): Promise<void> {
      if (stopped) return Promise.resolve();
      if (pending && identity === user) return pending;
      finish(); observed = true; identity = user;
      if (!user) { blockedUid = null; emit('unauthenticated'); return Promise.resolve(); }
      if (blockedUid === user.uid) { emit('denied'); return Promise.resolve(); }
      const request = generation;
      emit('initializing');
      pending = new Promise(resolve => { settle = resolve; });
      const work = pending;
      timer = schedule(uncertain, timeoutMs);
      void (async () => {
        try {
          const profile = await readProfile(user, forceRefresh);
          if (stopped || request !== generation) return;
          if (!profileRole(profile)) { deny(); return; }
          finish(); emit('verified', profile);
        } catch (error) {
          if (!stopped && request === generation) {
            failed(error);
          }
        }
      })();
      return work;
    },
    retry(readIdentity?: () => Promise<U | null>) {
      if (stopped || pending) return pending ?? Promise.resolve();
      if (observed) { blockedUid = null; return gate.accept(identity, true); }
      // A settled SDK initialization may recover even if its original callback failed.
      // Never guess that a not-yet-initialized currentUser=null means logged out.
      finish(); emit('initializing'); timer = schedule(uncertain, timeoutMs);
      if (readIdentity) {
        const request = generation;
        pending = new Promise(resolve => { settle = resolve; });
        const work = pending;
        void readIdentity().then(user => {
          if (!stopped && request === generation) { finish(); void gate.accept(user); }
        }).catch(error => {
          if (!stopped && request === generation) {
            failed(error);
          }
        });
        return work;
      }
      return Promise.resolve();
    },
    failure(user: U | null, error: unknown) {
      if (stopped || identity !== user) return;
      failed(error);
    },
    deny() { if (!stopped) deny(); },
    isVerified(user: U) { return !stopped && identity === user && currentStatus === 'verified'; },
    invalidate(uid?: string) {
      finish(); blockedUid = uid ?? null; identity = null; emit('unauthenticated');
    },
    stop() { stopped = true; finish(); },
  };
  return gate;
}
