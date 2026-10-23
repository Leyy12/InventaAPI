// Sign-in for the browser, backed by Supabase Auth. It offers the small part of the
// Firebase Auth interface this app uses (auth.currentUser, onIdTokenChanged,
// signInWithEmailAndPassword, signOut, user.getIdToken) with the same error codes, so
// pages only change where they import it from.
//
// An account carried over from Firebase keeps its old id (app_metadata.legacy_uid);
// user.uid reports it, so the profile and every record filed under it stay attached.
import { createClient, type Session, type User as SupabaseUser } from "@supabase/supabase-js";

export interface User {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}
type AuthError = Error & { code: string };
const authError = (code: string, message: string): AuthError => Object.assign(new Error(message), { code });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
// Separate storage per app, so signing in to one app never signs in the other.
const STORAGE_KEY = "inventa-admin-auth";
export const supabase = createClient(url || "https://unconfigured.invalid", publishableKey || "unconfigured", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: STORAGE_KEY },
});

async function currentToken(forceRefresh = false): Promise<string> {
  const { data, error } = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw authError("auth/user-token-expired", "Your session has ended. Please sign in again.");
  return token;
}
function toUser(user: SupabaseUser | null | undefined): User | null {
  if (!user) return null;
  return {
    uid: (user.app_metadata?.legacy_uid as string | undefined) || user.id,
    email: user.email ?? null,
    emailVerified: !!user.email_confirmed_at,
    displayName: (user.user_metadata?.full_name as string | undefined) ?? null,
    getIdToken: currentToken,
  };
}

let ready: Promise<void> | null = null;
export const auth = {
  currentUser: null as User | null,
  /** Resolves once the stored session (if any) has been read. */
  authStateReady(): Promise<void> {
    ready ||= supabase.auth.getSession().then(({ data }) => { auth.currentUser = toUser(data.session?.user); }, () => {});
    return ready;
  },
  signOut: () => signOut(auth),
};
if (typeof window !== "undefined") void auth.authStateReady();
export type Auth = typeof auth;

/** Calls next with the signed-in user (or null) now and whenever a different person signs in or out. */
export function onIdTokenChanged(_auth: Auth, next: (user: User | null) => void, error?: (error: Error) => void): () => void {
  // Supabase repeats SIGNED_IN / TOKEN_REFRESHED whenever the tab regains focus. Passing
  // those on made the apps re-check the account and swap the page for a loading screen,
  // losing open windows (for example a running CSV import). Same person: no event.
  let last: string | null | undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
    try {
      auth.currentUser = toUser(session?.user);
      const key = auth.currentUser ? auth.currentUser.uid : null;
      if (key === last) return;
      last = key;
      next(auth.currentUser);
    }
    catch (cause) { error?.(cause instanceof Error ? cause : new Error("Sign-in state unavailable.")); }
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmailAndPassword(_auth: Auth, email: string, password: string): Promise<{ user: User }> {
  let result;
  try { result = await supabase.auth.signInWithPassword({ email, password }); }
  catch { throw authError("auth/network-request-failed", "Network error. Check your connection and try again."); }
  const { data, error } = result;
  if (error || !data.user) {
    const status = (error as { status?: number } | null)?.status;
    const code = (error as { code?: string } | null)?.code || "";
    if (status === 429 || /rate|too_many/u.test(code)) throw authError("auth/too-many-requests", "Too many attempts. Try again later.");
    if (/banned|disabled/u.test(code)) throw authError("auth/user-disabled", "This account is disabled.");
    if (!status || status >= 500) throw authError("auth/network-request-failed", "Sign-in is unavailable right now.");
    throw authError("auth/invalid-credential", "Incorrect email or password.");
  }
  auth.currentUser = toUser(data.user);
  return { user: auth.currentUser! };
}

export async function signOut(_auth: Auth): Promise<void> {
  // This browser only, like Firebase; other devices stay signed in.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw authError("auth/network-request-failed", "Could not sign out. Please try again.");
  auth.currentUser = null;
}
