import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import sharp from 'sharp';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createIpRateLimiter, trustedRateLimitIp } from '../../../services/rate-limit-client-ip.js';
import { createProductMediaHandlers } from '../../../services/product-media.js';
import { processProductImage, MAX_IMAGE_BYTES } from '../../../services/product-media-processing.js';
import { mediaDigest } from '../../../services/product-media-binding.js';
import { memoryFirestore } from '../r2a/memory-firestore.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const source = relative => readFileSync(path.join(root, relative), 'utf8');
const executable = text => text.replace(/^import .*;\r?\n/gmu, '').replace(/^export default .*;\r?$/gmu, '');
export const assetId = 'a'.repeat(64);
export const missingId = 'b'.repeat(64);

// Execute the checked-in router AND server body, including their actual Helmet,
// CORS, rate limiting, compression and error middleware. Only external SDKs and
// unrelated routers are replaced; no credentials/config initialization is run.
export async function mediaHttpFixture({ enabled = true } = {}) {
  const bytes = await sharp({ create: { width: 140, height: 240, channels: 4,
    background: { r: 34, g: 145, b: 98, alpha: 0.8 } } }).webp().toBuffer();
  const asset = { version: 1, uid: 'owner', state: 'published', productId: 'fixture',
    path: `product-media/${assetId}.webp`, processedDigest: mediaDigest(bytes), bytes: bytes.length };
  const product = { name: 'Synthetic bottle', status: 'Active', is_active: true, image_asset_id: assetId };
  const db = memoryFirestore({ [`product_media/${assetId}`]: asset, 'products/fixture': product,
    'users/owner': { role: 'Customer' }, 'users/other': { role: 'Customer' }, 'users/admin': { role: 'Admin' } });
  const faults = { read: false, corrupt: false };
  const object = { async download() { if (faults.read) throw Error('synthetic storage failure');
    return [faults.corrupt ? Buffer.from('corrupt') : bytes]; }, async getMetadata() { return [{ metadata: {} }]; } };
  const bucket = { async getMetadata() { return [{ name: 'synthetic-private-bucket', projectNumber: '123',
    iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' } }]; },
    file(objectPath) { if (objectPath !== asset.path) throw Error('Unexpected synthetic object'); return object; } };
  const result = {};
  runInNewContext(executable(source('routes/product-media.js')) + '\nresult.router = router;', {
    result, process: { env: { PRODUCT_MEDIA_ENABLED: String(enabled), PRODUCT_MEDIA_BUCKET: 'synthetic-private-bucket',
      PRODUCT_MEDIA_BUCKET_PROJECT_NUMBER: '123', PRODUCT_MEDIA_PUBLIC_ORIGIN: 'https://synthetic.invalid' } },
    Router: express.Router, raw: express.raw, getFirestore: () => db, getStorage: () => ({ bucket: () => bucket }),
    getAuth: () => ({ async verifyIdToken(token, revoked) {
      if (revoked !== true || !['owner', 'other', 'admin'].includes(token)) throw Error('Invalid synthetic token');
      return { uid: token }; } }), createProductMediaHandlers, processProductImage, MAX_IMAGE_BYTES, mediaDigest,
  });
  const serverSource = source('server.js');
  const routers = Object.fromEntries([...serverSource.matchAll(/^import (\w+Router) from /gmu)]
    .map(([, name]) => [name, express.Router()]));
  runInNewContext(executable(serverSource).replaceAll('import.meta.url', 'sourceUrl') + '\nresult.app = app;', { ...routers,
    customerSubmissionsRouter: express.Router(), adminSubmissionsRouter: express.Router(), productMediaRouter: result.router,
    express, helmet, cors, compression, createIpRateLimiter, trustedRateLimitIp, path,
    fileURLToPath, sourceUrl: new URL('../../../server.js', import.meta.url).href,
    process: { env: { VERCEL: '1', NODE_ENV: 'test' } },
    console: { log() {}, warn() {}, error() {} }, result,
  });
  const server = await new Promise(resolve => { const listener = result.app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const imagePath = `/api/v1/product-media/${assetId}/image`;
  return { db, bytes, asset, product, faults, origin, imagePath,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

export async function browserPageFixture(apiOrigin, imagePath) {
  const app = express();
  app.get('/', (req, res) => {
    res.set('Content-Security-Policy', `default-src 'none'; img-src ${apiOrigin}; style-src 'unsafe-inline'`);
    res.send(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Synthetic product cards</title><style>body{margin:16px}main{display:flex;flex-wrap:wrap;gap:16px}
      article{width:240px;max-width:100%;box-sizing:border-box;border:1px solid #555;padding:12px}
      img{display:block;width:100%;height:260px;object-fit:contain}</style><main>
      <article><h1>Customer</h1><img id="customer" alt="Synthetic bottle" src="${apiOrigin}${imagePath}"></article>
      <article><h1>Admin</h1><img id="admin" alt="Synthetic bottle" src="${apiOrigin}${imagePath}"></article>
      </main></html>`);
  });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  return { origin: `http://127.0.0.1:${server.address().port}`,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
