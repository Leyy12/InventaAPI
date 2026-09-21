"use client";

import { Suspense, useEffect, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthEntry from '@/components/auth/AuthEntry';
import { useAuth } from '@/lib/firebase/auth-context';
import { LANDING_SEEN_KEY, landingSeen, browserStorage, navigationDecision, profileRole, loginEntryQuery } from '../../../services/auth-navigation';

function subscribeSeen(notify: () => void) {
  const changed = (event: StorageEvent) => { if (event.key === LANDING_SEEN_KEY || event.key === null) notify(); };
  window.addEventListener('storage', changed);
  return () => window.removeEventListener('storage', changed);
}
const readSeen = () => landingSeen(browserStorage());
const serverSeen = () => false;

function RootEntry() {
  const { user, appUser, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const seen = useSyncExternalStore(subscribeSeen, readSeen, serverSeen);
  const query = loginEntryQuery(new URLSearchParams(params.toString()));
  // Existing signup/settings/checkout callbacks retain their narrow intent on the explicit Login route.
  const destination = loading ? null : query ? `/login?${query}` : navigationDecision({ path: '/',
    initializing: loading, role: user ? profileRole(appUser) : null, seen });
  useEffect(() => {
    if (destination && destination !== 'admin-app') router.replace(destination);
  }, [destination, router]);
  if (loading || destination) return <p role="status">Checking session…</p>;
  return <AuthEntry />;
}
export default function LandingPage() {
  return <Suspense fallback={<p role="status">Checking session…</p>}><RootEntry /></Suspense>;
}
