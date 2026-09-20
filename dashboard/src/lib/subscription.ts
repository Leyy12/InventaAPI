import type { User } from 'firebase/auth';

export interface SubscriptionState {
  plan: string;
  subscription_status: string;
  apiRequestLimit: number | null;
  subscriptionStartedAt: string | null;
  subscriptionExpiresAt: string | null;
  activePro: boolean;
  expired: boolean;
  canPurchasePro: boolean;
  secondsRemaining: number;
  serverTime: string;
}
export async function readSubscription(user: User): Promise<SubscriptionState> {
  const token = await user.getIdToken();
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
  const response = await fetch(`${base}/api/v1/checkout/subscription-status`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('Subscription verification unavailable.');
  return response.json();
}
