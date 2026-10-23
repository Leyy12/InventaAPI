import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStorage } from '../../services/supabase-storage.js';
import { mediaDigest } from '../../services/product-media-binding.js';

const base = 'https://abcdefghijklmnopqrst.supabase.co', secretKey = 'sb_secret_SYNTHETIC';
function fixture({ bucket = { id: 'product-media', public: false }, upload, stored = new Map() } = {}) {
  const calls = [];
  const response = (status, body) => ({ status, ok: status < 300, json: async () => body, text: async () => JSON.stringify(body ?? {}),
    arrayBuffer: async () => body });
  const request = async (url, init = {}) => {
    calls.push({ url, ...init });
    const path = url.slice(`${base}/storage/v1`.length);
    if (path === '/bucket/product-media') return bucket ? response(200, bucket) : response(404, {});
    const key = decodeURIComponent(path.replace('/object/product-media/', ''));
    if (init.method === 'POST') {
      if (upload) return upload(key, init);
      if (stored.has(key)) return response(409, { error: 'Duplicate' });
      stored.set(key, Buffer.from(init.body)); return response(200, { Key: key });
    }
    return stored.has(key) ? response(200, stored.get(key)) : response(404, {});
  };
  return { storage: createSupabaseStorage({ url: base, secretKey, bucket: 'product-media', request }), calls, stored };
}
const bytes = Buffer.from('RIFF....WEBPsynthetic');

test('writes once to the private bucket and proves the stored bytes', async () => {
  const f = fixture();
  await f.storage.putImmutable('submission/abc.webp', bytes, mediaDigest(bytes));
  const post = f.calls.find(call => call.method === 'POST');
  assert.equal(post.headers['x-upsert'], 'false'); assert.equal(post.headers['Content-Type'], 'image/webp');
  assert.equal(post.headers.apikey, secretKey); assert.equal(post.headers.Authorization, undefined);
  assert.deepEqual(await f.storage.read('submission/abc.webp'), bytes);
});
test('a retried upload is accepted only when the existing bytes match', async () => {
  const f = fixture();
  await f.storage.putImmutable('a.webp', bytes, mediaDigest(bytes));
  await f.storage.putImmutable('a.webp', bytes, mediaDigest(bytes));
  const other = Buffer.from('different');
  await assert.rejects(f.storage.putImmutable('a.webp', other, mediaDigest(other)), /integrity mismatch/u);
});
test('a public or missing bucket is refused before any upload', async () => {
  for (const bucket of [{ id: 'product-media', public: true }, null]) {
    const f = fixture({ bucket });
    await assert.rejects(f.storage.putImmutable('a.webp', bytes, mediaDigest(bytes)), /bucket/iu);
    assert.equal(f.calls.some(call => call.method === 'POST'), false);
  }
});
test('upload failures and missing configuration fail closed', async () => {
  const f = fixture({ upload: () => ({ status: 500, ok: false, text: async () => 'boom' }) });
  await assert.rejects(f.storage.putImmutable('a.webp', bytes, mediaDigest(bytes)), /Image storage failed \(500\)/u);
  const unconfigured = createSupabaseStorage({ url: '', secretKey: '', bucket: 'product-media', request: async () => { throw Error('no'); } });
  await assert.rejects(unconfigured.read('a.webp'), /configuration required/u);
  await assert.rejects(f.storage.read('missing.webp'), error => error.status === 404);
});
