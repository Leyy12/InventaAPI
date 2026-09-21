import { Suspense } from 'react';
import AuthEntry from '@/components/auth/AuthEntry';

export default function LoginPage() {
  return <Suspense fallback={<p role="status">Checking session…</p>}><AuthEntry loginOnly /></Suspense>;
}
