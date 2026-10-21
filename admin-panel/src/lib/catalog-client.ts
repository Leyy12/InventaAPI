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

// Price is optional: blank means "not priced yet" and is left off the variant.
export function catalogPrice(value: unknown): number | undefined {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return undefined;
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1e9) throw new Error('Price must be blank or a valid non-negative number.');
  return number;
}

// Drops a blank price instead of sending it.
export function withOptionalPrice<T extends { price?: unknown }>(variant: T): Omit<T, 'price'> & { price?: number } {
  const { price, ...rest } = variant;
  const value = catalogPrice(price);
  return value === undefined ? rest : { ...rest, price: value };
}

// Secondary display warning only; authoritative identity comes from the backend.
export function brandNameWarning(brand: string, name: string): string {
  const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  return normalize(brand) && normalize(name) ? JSON.stringify([normalize(brand), normalize(name)]) : '';
}
