type AuthenticatedUser = { getIdToken: () => Promise<string> };

export async function apiKeyRequest(user: AuthenticatedUser, path = '', options: RequestInit = {}) {
  const token = await user.getIdToken();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body) headers.set('Content-Type', 'application/json');
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
  const response = await fetch(`${baseUrl}/api/v1/api-keys${path}`, { ...options, headers, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'API-key operation failed.');
  return data;
}
