export type AuditLogRecord = Record<string, unknown> & { id: string };

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? value as Record<string, unknown> : {};

export function auditActor(log: AuditLogRecord): string {
  return text(log.userEmail) || text(log.email) || text(log.userId) || "Unknown actor";
}

export function auditAction(log: AuditLogRecord): string {
  const action = text(log.action);
  return action ? action.replaceAll("_", " ").replace(/\b[A-Z]+\b/g, word =>
    word === "API" ? word : word[0] + word.slice(1).toLowerCase()) : "Unknown activity";
}

export function auditDetails(log: AuditLogRecord): string {
  if (text(log.details) || text(log.description)) return text(log.details) || text(log.description);
  const metadata = object(log.metadata);
  // Historical documents can contain arbitrary metadata. Display only these
  // useful fields, never credentials, tokens, bodies, or the complete object.
  const parts = [
    ["Entity", text(log.entityId)], ["API key", text(log.keyId) || text(metadata.keyId)],
    ["Product", text(log.productId) || text(metadata.productId)],
    ["Submission", text(log.submissionId) || text(metadata.submissionId)],
    ["Endpoint", (text(log.endpoint) || text(metadata.endpoint)).split("?")[0]],
  ].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  const status = log.status ?? log.statusCode ?? metadata.statusCode;
  if (typeof status === "number" && Number.isFinite(status)) parts.push(`Status: ${status}`);
  return parts.join(" · ") || `${auditAction(log)} recorded; no additional details available.`;
}

export function auditTimestamp(value: unknown): string {
  try {
    const stamp = object(value);
    const seconds = stamp.seconds ?? stamp._seconds;
    const date = typeof stamp.toDate === "function" ? stamp.toDate() as Date
      : value instanceof Date ? value
      : typeof seconds === "number" ? new Date(seconds * 1000)
      : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Timestamp unavailable";
  } catch { return "Timestamp unavailable"; }
}

export function auditMatches(log: AuditLogRecord, search: string): boolean {
  const term = search.toLowerCase();
  return [text(log.action), auditAction(log), auditActor(log), text(log.userId), auditDetails(log)]
    .some(value => value.toLowerCase().includes(term));
}
