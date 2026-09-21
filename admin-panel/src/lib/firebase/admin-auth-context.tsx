"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './config';
import { useRouter } from 'next/navigation';
import { createAuthSession, createLogoutAction, profileRole, type AuthStatus, type LogoutResult } from '../../../../services/auth-navigation';

interface AdminUser { uid: string; email: string; fullName: string; role: string; plan: string; businessName: string }
interface AdminAuthContextType {
  user: User | null; adminUser: AdminUser | null; loading: boolean; logout: () => Promise<LogoutResult>;
  authStatus: AuthStatus; logoutError: string | null; logoutBusy: boolean; retryVerification: () => void;
}
const AdminAuthContext = createContext<AdminAuthContextType>({ user: null, adminUser: null, loading: true,
  authStatus: 'initializing', logoutError: null, logoutBusy: false, retryVerification: () => {}, logout: async () => ({ ok: false }) });
export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const router = useRouter();
  const sessionGate = React.useRef<ReturnType<typeof createAuthSession<User, AdminUser>> | null>(null);
  const logoutAction = React.useRef<(() => Promise<LogoutResult>) | null>(null);
  const logout = async () => logoutAction.current ? logoutAction.current() : { ok: false };
  const retryVerification = () => { void sessionGate.current?.retry(async () => {
    await auth.authStateReady(); return auth.currentUser;
  }); };

  useEffect(() => {
    const gate = createAuthSession<User, AdminUser>({
      readProfile: async (currentUser, forceRefresh) => {
        // Token refresh and role read share one bounded/generation-checked attempt.
        // Observer events must not force another token event in a refresh loop.
        await currentUser.getIdToken(forceRefresh);
        const snapshot = await getDocFromServer(doc(db, 'users', currentUser.uid));
        const profile = snapshot.exists() ? snapshot.data() : null;
        if (profileRole(profile) !== 'admin') return null;
        return { ...profile, uid: currentUser.uid, email: currentUser.email || '',
          fullName: profile?.fullName || currentUser.displayName || 'Super Admin',
          role: profile?.role, plan: profile?.plan || 'Unlimited', businessName: profile?.businessName || 'InventaAPI' } as AdminUser;
      },
      publish: state => { setUser(state.user); setAdminUser(state.profile); setLoading(state.loading); setAuthStatus(state.status); },
      rejected: () => { router.replace('/login'); },
    });
    sessionGate.current = gate;
    logoutAction.current = createLogoutAction({ currentUser: () => auth.currentUser,
      signOut: () => auth.signOut(), active: () => sessionGate.current === gate,
      changed: (busy, error) => { setLogoutBusy(busy); setLogoutError(error); },
      completed: () => { gate.invalidate(); router.replace('/login'); } });
    const unsubscribe = onIdTokenChanged(auth, currentUser => { void gate.accept(currentUser); },
      error => { gate.failure(auth.currentUser, error); });
    const visible = () => {
      const currentUser = auth.currentUser;
      if (document.visibilityState === 'visible' && currentUser) {
        void gate.accept(currentUser, true);
      }
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      unsubscribe(); gate.stop(); document.removeEventListener('visibilitychange', visible);
      if (sessionGate.current === gate) { sessionGate.current = null; logoutAction.current = null; }
    };
  }, [router]);
  return <AdminAuthContext.Provider value={{ user, adminUser, loading, logout, authStatus, logoutError, logoutBusy, retryVerification }}>{children}</AdminAuthContext.Provider>;
};
