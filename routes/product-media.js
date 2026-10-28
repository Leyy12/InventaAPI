import { Router, raw } from 'express';
import { getAuth } from '../services/supabase-auth.js';
import { getDataStore } from '../database/data-store.js';
import { createSupabaseStorage } from '../services/supabase-storage.js';
import { createProductMediaHandlers } from '../services/product-media.js';
import { processProductImage, MAX_IMAGE_BYTES } from '../services/product-media-processing.js';

// Photos are kept in a private Supabase Storage bucket and served through the API.
const enabled = process.env.PRODUCT_MEDIA_ENABLED === 'true';
const origin = process.env.PRODUCT_MEDIA_PUBLIC_ORIGIN || '';
const storage = createSupabaseStorage({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY,
  bucket: process.env.SUPABASE_MEDIA_BUCKET || 'product-media' });
const handlers = createProductMediaHandlers({ enabled, publicOrigin: origin, getDb: getDataStore,
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
