// Canonical image_url metadata contract. Kept identical across the two standalone frontends.
export function normalizeProductImageUrl(value: string = ''): string {
  if (typeof value !== 'string') throw new Error('Image URL must be text.');
  const text = value.trim();
  if (!text) return '';
  if (text.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(text)) throw new Error('Invalid image URL.');
  let url;
  try { url = new URL(text); } catch { throw new Error('Invalid image URL.'); }
  if (!/^https:\/\/[^/?#]+/u.test(text) || url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Image URL must be HTTPS without credentials.');
  }
  return text;
}
