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

// Render old records defensively without resurrecting an explicitly cleared canonical URL.
export function productImageSource(product: { image_url?: unknown; image?: unknown }): string {
  const value = Object.prototype.hasOwnProperty.call(product, 'image_url') ? product.image_url : product.image;
  if (value == null) return '';
  try { return normalizeProductImageUrl(value as string); } catch { return ''; }
}

// The adjacent local icon is the fallback: never fetch a second remote placeholder.
export function showProductImageFallback(event: { currentTarget: HTMLImageElement }): void {
  event.currentTarget.style.display = 'none';
  event.currentTarget.nextElementSibling?.classList.remove('hidden');
}
