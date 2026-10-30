// Automatic app detection for API keys. Every DaaS call is tagged with where it
// came from, with no registration:
//   - a website: the domain its browser reports (Origin, else Referer header);
//   - otherwise a server or app: its IP, grouped by network range (IPv4 /24,
//     IPv6 /48) so a host that rotates addresses within a range stays one app.
// The first call from a new source records it as a new "app" for that key. Apps
// can be blocked by the key owner. Paid plans count each product variant once
// per app per month (see chargeMonthlyProducts).
import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { trustedRateLimitIp } from './rate-limit-client-ip.js';
import { ApiSecurityError } from './api-key-security.js';

export const CONSUMER_COLLECTION = 'api_key_consumers';

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function hostnameOf(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || value === 'null') return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/u, '');
    return HOSTNAME.test(host) || ipaddr.isValid(host.replace(/^\[|\]$/gu, '')) ? host : null;
  } catch { return null; }
}

// "203.0.113.0/24" or "2001:db8:1::/48".
export function ipRange(ip) {
  if (typeof ip !== 'string' || !ipaddr.isValid(ip)) return null;
  let address = ipaddr.parse(ip);
  if (address.kind() === 'ipv6' && address.isIPv4MappedAddress()) address = address.toIPv4Address();
  if (address.kind() === 'ipv4') {
    const [a, b, c] = address.octets;
    return `${a}.${b}.${c}.0/24`;
  }
  const parts = address.parts.slice(0, 3).map(part => part.toString(16));
  return `${parts.join(':')}::/48`;
}

export function identifyConsumer(req, { clientIp = trustedRateLimitIp } = {}) {
  const domain = hostnameOf(req.headers?.origin) || hostnameOf(req.headers?.referer);
  const ip = clientIp(req) || null;
  const range = ip ? ipRange(ip) : null;
  const kind = domain ? 'domain' : range ? 'ip' : 'unknown';
  const label = domain || range || 'Unknown source';
  const group = domain ? `domain:${domain}` : range ? `ip:${range}` : 'unknown';
  return { kind, label, group, domain, ip };
}

export const consumerHash = group => createHash('sha256').update(group).digest('hex').slice(0, 24);
export const consumerDocId = (keyId, group) => `${keyId}_${consumerHash(group)}`;

// Records the call against its app (creating the app the first time) and tells
// whether it is new or blocked. Best effort for counters: a failure here never
// hides a blocked app, because the read happens first.
export async function recordConsumer(db, { userId, keyId, consumer, now = new Date() }) {
  const id = consumerDocId(keyId, consumer.group);
  const ref = db.collection(CONSUMER_COLLECTION).doc(id);
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const existing = doc.exists ? doc.data() : null;
    const at = now.toISOString();
    const requests = Number.isSafeInteger(existing?.requests) && existing.requests >= 0 ? existing.requests + 1 : 1;
    tx.set(ref, {
      userId, keyId, kind: consumer.kind, label: consumer.label,
      firstSeen: existing?.firstSeen || at, lastSeen: at,
      lastIp: consumer.ip, lastDomain: consumer.domain,
      requests: Math.min(requests, Number.MAX_SAFE_INTEGER), blocked: existing?.blocked === true,
    });
    return { id, isNew: !existing, blocked: existing?.blocked === true };
  });
}

export function consumerBlockedError() {
  return new ApiSecurityError(403, 'CONSUMER_BLOCKED',
    'This website or app has been blocked by the API key owner. Ask them to unblock it on their InventaAPI dashboard.');
}

// The owner's view of an app (no secrets; IP shown so the owner can recognise it).
export function publicConsumer(id, data) {
  return {
    id, kind: ['domain', 'ip', 'unknown'].includes(data.kind) ? data.kind : 'unknown',
    label: typeof data.label === 'string' ? data.label.slice(0, 260) : 'Unknown source',
    keyId: typeof data.keyId === 'string' ? data.keyId : null,
    firstSeen: typeof data.firstSeen === 'string' ? data.firstSeen : null,
    lastSeen: typeof data.lastSeen === 'string' ? data.lastSeen : null,
    lastIp: typeof data.lastIp === 'string' ? data.lastIp : null,
    lastDomain: typeof data.lastDomain === 'string' ? data.lastDomain : null,
    requests: Number.isSafeInteger(data.requests) ? data.requests : 0,
    blocked: data.blocked === true,
  };
}
