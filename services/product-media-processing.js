import sharp from 'sharp';
import { submissionError } from './product-submission-contract.js';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 24_000_000;
const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
export async function processProductImage(bytes, mime) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw submissionError(413, 'Choose an image no larger than 3 MB.');
  }
  if (!Object.hasOwn(formats, mime)) throw submissionError(415, 'Only JPEG, PNG and WebP photos are supported.');
  // Signature + decoder agreement prevents SVG/HTML disguised with an image MIME.
  const signature = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpeg'
    : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : '';
  if (signature !== formats[mime]) throw submissionError(415, 'The file content does not match its image type.');
  try {
    const input = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning', animated: false });
    const meta = await input.metadata();
    if (meta.format !== signature || !meta.width || !meta.height || meta.width > 12000 || meta.height > 12000
      || meta.width * meta.height > MAX_IMAGE_PIXELS || (meta.pages || 1) !== 1) throw Error('Invalid dimensions or animation');
    // Sharp strips metadata by default. autoOrient honors EXIF before resizing.
    const result = await input.autoOrient().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
    if (result.data.length > 2 * 1024 * 1024) throw Error('Processed image too large');
    return { bytes: result.data, width: result.info.width, height: result.info.height, mime: 'image/webp' };
  } catch { throw submissionError(400, 'The image is malformed, animated, too large in dimensions, or cannot be processed.'); }
}
