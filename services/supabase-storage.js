// Product photo storage in a private Supabase Storage bucket. Same contract as the
// earlier storage adapter (see services/product-media.js):
//   verify()                          the bucket exists and is private
//   putImmutable(path, bytes, digest) write once; never overwrite; prove the stored bytes
//   read(path)                        bytes of a stored photo
// Photos are served through the API, never straight from the bucket.
import { mediaDigest } from './product-media-binding.js';

export function createSupabaseStorage({ url, secretKey, bucket, request = globalThis.fetch }) {
  const base = String(url || '').replace(/\/+$/u, '');
  const call = (path, options = {}) => {
    if (!base || !secretKey || !/^[a-z0-9][a-z0-9._-]{2,62}$/u.test(bucket || '')) throw Error('Verified media configuration required');
    // Secret keys go on the apikey header only.
    return request(`${base}/storage/v1${path}`, { ...options, headers: { apikey: secretKey, ...(options.headers || {}) },
      signal: AbortSignal.timeout(20000) });
  };
  const object = path => `/object/${bucket}/${String(path).split('/').map(encodeURIComponent).join('/')}`;
  let verified = false;

  async function verify() {
    if (verified) return;
    const response = await call(`/bucket/${bucket}`);
    if (!response.ok) throw Error('Media bucket is missing');
    const meta = await response.json();
    if (meta?.id !== bucket || meta.public !== false) throw Error('Private bucket configuration required');
    verified = true;
  }

  async function read(path) {
    const response = await call(object(path));
    if (!response.ok) throw Object.assign(Error('Stored image unavailable'), { status: response.status });
    return Buffer.from(await response.arrayBuffer());
  }

  async function putImmutable(path, bytes, digest) {
    await verify();
    const response = await call(object(path), { method: 'POST', body: bytes,
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'x-upsert': 'false' } });
    // An object already at this path (a retried upload) is accepted only if its bytes match.
    if (!response.ok && response.status !== 409 && !(response.status === 400 && /exists|duplicate/iu.test(await response.text()))) {
      throw Error(`Image storage failed (${response.status})`);
    }
    // Prove durable bytes before any ready binding, including an uncertain replay.
    if (mediaDigest(await read(path)) !== digest) throw Error('Stored image integrity mismatch');
  }

  return { verify, putImmutable, read };
}
