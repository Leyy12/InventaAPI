import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// API key secrets stay hashed for authentication. When API_KEY_ENCRYPTION_SECRET
// is configured, new secrets are also sealed with AES-256-GCM so their owner can
// copy them again. The key id is bound as associated data, so a sealed value
// moved onto another key document never opens.
const MIN_SECRET_LENGTH = 32;

function vaultKey(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) return null;
  return Buffer.from(hkdfSync('sha256', secret, 'inventa-api-key-vault', 'v1', 32));
}

export function vaultConfigured(secret) { return vaultKey(secret) !== null; }

export function sealCredential(credential, keyId, secret) {
  const key = vaultKey(secret);
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(keyId, 'utf8'));
  const ct = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

export function openCredential(sealed, keyId, secret) {
  const key = vaultKey(secret);
  if (!key || !sealed || sealed.v !== 1 || [sealed.iv, sealed.tag, sealed.ct].some(value => typeof value !== 'string')) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAAD(Buffer.from(keyId, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
