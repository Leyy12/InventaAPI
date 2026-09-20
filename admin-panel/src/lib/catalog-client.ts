import { auth } from '@/lib/firebase/config';

export async function catalogRequest<T>(path: string, method: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as Admin to manage the catalog.');
  const token = await user.getIdToken();
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
  const response = await fetch(base + '/api/v1/admin/catalog' + path, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Catalog request failed.');
  return result as T;
}

export function catalogPrice(value: unknown): number {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1e9) throw new Error('Each variant needs a valid non-negative price.');
  return number;
}

// Secondary display warning only; authoritative identity comes from the backend.
export function brandNameWarning(brand: string, name: string): string {
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  return normalize(brand) && normalize(name) ? JSON.stringify([normalize(brand), normalize(name)]) : '';
}
