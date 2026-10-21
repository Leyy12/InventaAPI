import { auth } from '@/lib/firebase/config';

export async function catalogRequest<T>(path: string, method: string, body: unknown, operationKey?: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as Admin to manage the catalog.');
  const token = await user.getIdToken();
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
  const response = await fetch(base + '/api/v1/admin/catalog' + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(operationKey ? { 'Idempotency-Key': operationKey } : {}) },
    body: JSON.stringify(body), cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Catalog request failed.'), { status: response.status });
  return result as T;
}

// Products carry no price; a price still on a loaded variant is never sent back.
export function withoutPrice<T extends { price?: unknown }>(variant: T): Omit<T, 'price'> {
  const { price, ...rest } = variant;
  return rest;
}

// Secondary display warning only; authoritative identity comes from the backend.
export function brandNameWarning(brand: string, name: string): string {
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  return normalize(brand) && normalize(name) ? JSON.stringify([normalize(brand), normalize(name)]) : '';
}
