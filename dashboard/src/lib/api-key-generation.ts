export const GENERATION_POLICY = 'API keys can be generated once per account per UTC day.';
export const REVOCATION_WARNING = "Revoking a key does not restore today's generation allowance. If this is your only usable key and you already generated one today, you must wait until the next UTC day to generate another.";

// Presentation only. Eligibility is always decided by the backend transaction.
export function generationErrorMessage(data: { error?: string; message?: string; nextEligibleAt?: unknown }): string {
  if (data.error === 'UPGRADE_REQUIRED') return 'Your Free Trial has ended. Upgrade to Pro to continue using the API.';
  if (data.error !== 'API_KEY_DAILY_GENERATION_LIMIT') {
    return data.message || data.error || 'Unable to create your API key. Please try again later.';
  }
  const message = "You've already generated an API key today. You can generate another after the next UTC reset.";
  const value = data.nextEligibleAt;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(value)) return message;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) return message;
  return `${message} Next eligible time: ${value.slice(0, 10)} 00:00 UTC.`;
}
