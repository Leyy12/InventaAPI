"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, User, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDocFromServer, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";
import { useRouter } from "next/navigation";
import { readSubscription, type SubscriptionState } from '@/lib/subscription';
import { createEntitlementPoller } from '@/lib/entitlement-poller';
import { createAuthSession, createLogoutAction, completeLanding, browserStorage, profileRole, verifyWithin,
  type AuthStatus, type LogoutResult } from '../../../../services/auth-navigation';

interface AppUser {
  uid: string; email: string; fullName: string; businessName: string; businessSegment: string;
  role: string; plan: string; subscription_status?: string; subscriptionExpiresAt?: string | null;
  apiRequestLimit?: number | null; selectedSegment?: 'Grocery' | 'Pharmacy' | 'Hardware';
}
interface AuthContextType {
  user: User | null; appUser: AppUser | null; loading: boolean;
  logout: () => Promise<LogoutResult>; refreshUserDoc: () => Promise<AppUser | null>;
  authStatus: AuthStatus; logoutError: string | null; logoutBusy: boolean;
  retryVerification: () => void; confirmAccountDeletion: () => void;
  entitlement: SubscriptionState | null;
}
const AuthContext = createContext<AuthContextType>({ user: null, appUser: null, loading: true,
  authStatus: 'initializing', logoutError: null, logoutBusy: false, retryVerification: () => {}, confirmAccountDeletion: () => {},
  logout: async () => ({ ok: false }), refreshUserDoc: async () => null, entitlement: null });
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  // Never restore identity or role from appUserCache/userCache.
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [entitlement, setEntitlement] = useState<SubscriptionState | null>(null);
  const router = useRouter();
  const sessionGate = React.useRef<ReturnType<typeof createAuthSession<User, AppUser>> | null>(null);
  const entitlementSession = React.useRef<{
    uid: string; poller: ReturnType<typeof createEntitlementPoller<SubscriptionState>>;
  } | null>(null);
  const profileRefreshRequest = React.useRef(0);
  const logoutAction = React.useRef<(() => Promise<LogoutResult>) | null>(null);

  const clearSession = React.useCallback(() => {
    sessionGate.current?.invalidate(auth.currentUser?.uid);
    profileRefreshRequest.current++;
    entitlementSession.current?.poller.stop();
    entitlementSession.current = null;
    setUser(null); setAppUser(null); setEntitlement(null); setLoading(false); setAuthStatus('unauthenticated');
    try { localStorage.removeItem('userCache'); localStorage.removeItem('appUserCache'); } catch { /* optional cache cleanup */ }
  }, []);
  useEffect(() => {
    let loginLogged: string | null = null;
    const gate = createAuthSession<User, AppUser>({
      readProfile: async currentUser => {
        const snapshot = await getDocFromServer(doc(db, 'users', currentUser.uid));
        const profile = snapshot.exists() ? { ...snapshot.data(), uid: currentUser.uid } as AppUser : null;
        // A retry must also reverify the failed subscription-status source before reopening UI.
        if (profileRole(profile) === 'customer') await readSubscription(currentUser);
        return profile;
      },
      publish: state => {
        setUser(state.user); setAppUser(state.profile); setLoading(state.loading); setAuthStatus(state.status);
        if (state.status !== 'verified') {
          profileRefreshRequest.current++;
          entitlementSession.current?.poller.stop(); entitlementSession.current = null;
          setEntitlement(null);
        } else if (state.user && profileRole(state.profile) === 'customer' && loginLogged !== state.user.uid) {
          loginLogged = state.user.uid;
          void addDoc(collection(db, 'audit_logs'), { action: 'Customer Login', userId: state.user.uid,
            userEmail: state.user.email || 'unknown@email.com', timestamp: serverTimestamp(),
            details: 'User logged in successfully', userAgent: navigator.userAgent || null, ipAddress: null
          }).catch(error => console.warn('[Audit] Login log unavailable', error));
        }
      },
      rejected: () => {
        // Signup owns its create-profile-then-signout transaction. Never auto-create a missing profile here.
        if (window.location.pathname !== '/signup') router.replace('/login');
      },
    });
    sessionGate.current = gate;
    logoutAction.current = createLogoutAction({ currentUser: () => auth.currentUser,
      signOut: () => firebaseSignOut(auth), active: () => sessionGate.current === gate,
      changed: (busy, error) => { setLogoutBusy(busy); setLogoutError(error); },
      completed: () => {
        clearSession(); completeLanding(browserStorage()); router.replace('/login');
      } });
    const unsubscribe = onIdTokenChanged(auth, currentUser => { void gate.accept(currentUser); },
      error => { gate.failure(auth.currentUser, error); });
    return () => {
      unsubscribe(); gate.stop();
      if (sessionGate.current === gate) { sessionGate.current = null; logoutAction.current = null; }
    };
  }, [clearSession, router]);

  const retryVerification = () => { void sessionGate.current?.retry(async () => {
    await auth.authStateReady(); return auth.currentUser;
  }); };
  const confirmAccountDeletion = () => {
    // Called ONLY after the existing backend confirms deletion. Never restore that session on cleanup failure.
    sessionGate.current?.deny();
    router.replace('/login');
  };

  const customerSession = profileRole(appUser) === 'customer';
  useEffect(() => {
    if (loading || !user || !customerSession) return;
    const poller = createEntitlementPoller({ read: async () => {
      try { return await verifyWithin(() => readSubscription(user)); }
      catch (error) {
        if (entitlementSession.current === session && auth.currentUser === user) sessionGate.current?.failure(user, error);
        throw error;
      }
    }, onState: state => { if (entitlementSession.current === session && auth.currentUser?.uid === user.uid) setEntitlement(state); } });
    const session = { uid: user.uid, poller };
    entitlementSession.current = session;
    poller.start();
    const visible = () => { if (document.visibilityState === 'visible') void poller.refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      poller.stop();
      if (entitlementSession.current === session) entitlementSession.current = null;
      document.removeEventListener('visibilitychange', visible);
    };
    // Profile edits with an unchanged role do not restart the existing scheduler.
  }, [user, loading, customerSession]);

  const logout = async () => {
    if (user) void addDoc(collection(db, 'audit_logs'), { action: 'Customer Logout', userId: user.uid,
      userEmail: user.email || 'unknown@email.com', timestamp: serverTimestamp(),
      details: 'User requested logout', userAgent: navigator.userAgent || null, ipAddress: null
    }).catch(error => console.warn('[Audit] Logout log unavailable', error));
    return logoutAction.current ? logoutAction.current() : { ok: false };
  };

  const refreshUserDoc = React.useCallback(async (): Promise<AppUser | null> => {
    const currentUser = auth.currentUser;
    const session = entitlementSession.current;
    if (!currentUser || session?.uid !== currentUser.uid) return null;
    const request = ++profileRefreshRequest.current;
    try {
      const [userDoc, state] = await Promise.all([
        verifyWithin(() => getDocFromServer(doc(db, 'users', currentUser.uid))), session.poller.refresh(),
      ]);
      if (request !== profileRefreshRequest.current || entitlementSession.current !== session
        || auth.currentUser?.uid !== currentUser.uid) return null;
      const profile = userDoc.exists() ? userDoc.data() as AppUser : null;
      if (profileRole(profile) !== 'customer') { sessionGate.current?.deny(); return null; }
      if (profile && state) {
        const fresh: AppUser = { ...profile, ...state };
        setAppUser(fresh); return fresh;
      }
      return null;
    } catch (error) {
      if (entitlementSession.current === session && request === profileRefreshRequest.current
        && auth.currentUser === currentUser) sessionGate.current?.failure(currentUser, error);
      return null;
    }
  }, []);

  return <AuthContext.Provider value={{ user,
    appUser: appUser ? { ...appUser, plan: entitlement?.plan ?? 'Unavailable',
      apiRequestLimit: entitlement?.apiRequestLimit ?? (entitlement ? null : 0),
      subscription_status: entitlement?.subscription_status ?? 'unverified',
      subscriptionExpiresAt: entitlement?.subscriptionExpiresAt ?? null } : null,
    entitlement, loading, logout, refreshUserDoc, authStatus, logoutError, logoutBusy,
    retryVerification, confirmAccountDeletion }}>{children}</AuthContext.Provider>;
};
