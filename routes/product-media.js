import { Router, raw } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from '../database/firestore.js';
import { getStorage } from 'firebase-admin/storage';
import { createProductMediaHandlers } from '../services/product-media.js';
import { processProductImage, MAX_IMAGE_BYTES } from '../services/product-media-processing.js';
import { mediaDigest } from '../services/product-media-binding.js';

// No default/inferred bucket, auto-provisioning, public ACL or download tokens.
// Activation requires separate operator staging approval and configuration.
const enabled = process.env.PRODUCT_MEDIA_ENABLED === 'true';
const bucketName = process.env.PRODUCT_MEDIA_BUCKET || '';
const bucketProjectNumber = process.env.PRODUCT_MEDIA_BUCKET_PROJECT_NUMBER || '';
const origin = process.env.PRODUCT_MEDIA_PUBLIC_ORIGIN || '';
let validatedBucket;
async function bucket() {
  if (!enabled || !/^[a-z0-9][a-z0-9._-]{2,221}$/u.test(bucketName) || !/^[0-9]+$/u.test(bucketProjectNumber)) throw Error('Verified media configuration required');
  // Verify existence/configuration on every cold start. Fail closed on unknown IAM.
  if (!validatedBucket) {
    const candidate = getStorage().bucket(bucketName);
    const [meta] = await candidate.getMetadata();
    if (meta.name !== bucketName || String(meta.projectNumber) !== bucketProjectNumber || meta.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true
      || meta.iamConfiguration?.publicAccessPrevention !== 'enforced') throw Error('Private bucket configuration required');
    validatedBucket = candidate;
  }
  return validatedBucket;
}
const storage = {
  verify: bucket,
  async putImmutable(path, bytes, digest) {
    const object = (await bucket()).file(path);
    try {
      await object.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: 'image/webp', cacheControl: 'private, no-store', metadata: { sha256: digest } } });
    } catch (error) { if (Number(error.code) !== 412) throw error; }
    // Prove durable bytes before any ready binding, including an uncertain replay.
    const [actual] = await object.download();
    const [metadata] = await object.getMetadata();
    if (metadata.metadata?.firebaseStorageDownloadTokens) throw Error('Unexpected public download token on managed object');
    if (mediaDigest(actual) !== digest) throw Error('Stored image integrity mismatch');
  },
  async read(path) { const [bytes] = await (await bucket()).file(path).download(); return bytes; },
};
const handlers = createProductMediaHandlers({ enabled, publicOrigin: origin, getDb: getFirestore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked), storage, processImage: processProductImage });
const router = Router();
router.post('/upload/:workflow', raw({ type: () => true, limit: MAX_IMAGE_BYTES, inflate: false }), handlers.upload);
router.get('/:id/private', handlers.privateImage);
router.get('/:id/image', handlers.publicImage);
router.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Choose an image no larger than 3 MB.' });
  if (error.status === 415) return res.status(415).json({ error: 'Compressed upload transport is not supported.' });
  return next(error);
});
export default router;
