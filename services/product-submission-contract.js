import { normalizeDisplayText, normalizeSegment } from './product-contract.js';

export function submissionError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function normalizeProductImageUrl(value = '') {
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

function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).some(key => !allowed.includes(key))) {
    throw submissionError(400, 'Unsupported product fields.');
  }
}
function text(value = '', maximum = 200, required = false) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw submissionError(400, 'Invalid product text.');
  }
  const normalized = normalizeDisplayText(value) || '';
  if (required && !normalized) throw submissionError(400, 'Product name, category and segment are required.');
  return normalized;
}

export function validateSubmissionContent(input) {
  object(input, ['name', 'brand', 'segment', 'category', 'description', 'sku', 'variants', 'image_url']);
  const segment = normalizeSegment(text(input.segment, 40, true));
  if (!segment) throw submissionError(400, 'Unsupported product segment.');
  let image_url;
  try { image_url = normalizeProductImageUrl(input.image_url); }
  catch (error) { throw submissionError(400, error.message); }
  const variants = input.variants ?? [];
  if (!Array.isArray(variants) || variants.length > 50) throw submissionError(400, 'At most 50 variants are allowed.');
  const fields = ['flavor', 'size', 'dosage', 'form', 'specs', 'dimensions', 'value', 'variantName', 'sku', 'expirationDate'];
  return {
    name: text(input.name, 160, true), brand: text(input.brand, 120), segment,
    category: text(input.category, 120, true), description: text(input.description, 4000),
    sku: text(input.sku, 120), image_url,
    variants: variants.map(variant => {
      object(variant, [...fields, 'price']);
      const result = {};
      for (const field of fields) if (variant[field] !== undefined) result[field] = text(variant[field], 200);
      if (variant.price !== undefined) {
        if (typeof variant.price !== 'number' || !Number.isFinite(variant.price) || variant.price < 0 || variant.price > 1e9) {
          throw submissionError(400, 'Variant price must be a finite non-negative number.');
        }
        result.price = variant.price;
      }
      return result;
    }),
  };
}
