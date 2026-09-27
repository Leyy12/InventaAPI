import { Suspense } from 'react';
import AuthEntry from '@/components/auth/AuthEntry';
import SessionLoadingScreen from '@/components/auth/SessionLoadingScreen';

export default function LoginPage() {
  return <Suspense fallback={<SessionLoadingScreen variant="public" />}><AuthEntry loginOnly /></Suspense>;
}
