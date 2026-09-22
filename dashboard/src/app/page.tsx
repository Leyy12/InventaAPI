"use client";

import { Suspense } from 'react';
import AuthEntry from '@/components/auth/AuthEntry';

function RootEntry() {
  return <AuthEntry />;
}
export default function LandingPage() {
  return <Suspense fallback={<p role="status">Checking session…</p>}><RootEntry /></Suspense>;
}
