// Server-only delivery adapter. Tests inject sendEmail and never call this module.
export async function sendResendTrialEmail(payload, idempotencyKey, apiKey, fetchImpl = globalThis.fetch) {
  if (typeof apiKey !== 'string' || !apiKey.startsWith('re_')) throw new Error('Resend API key is unavailable.');
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Resend did not accept Trial email (HTTP ${response.status}).`);
  const body = await response.json();
  if (typeof body.id !== 'string' || !body.id) throw new Error('Resend response omitted the email ID.');
  return body.id;
}
