"use client";

import { Suspense } from 'react';
import AuthEntry from '@/components/auth/AuthEntry';
import SessionLoadingScreen from '@/components/auth/SessionLoadingScreen';

function RootEntry() {
  return <AuthEntry />;
}
export default function LandingPage() {
  return <Suspense fallback={<SessionLoadingScreen variant="public" />}><RootEntry /></Suspense>;
}
