import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from '../database/firestore.js';
import { createCatalogHandlers } from '../services/catalog-management.js';

const handlers = createCatalogHandlers({ getDb: getFirestore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) });
const router = Router();
router.post('/', handlers.create);
router.post('/import/preview', handlers.preview);
router.post('/import/commit', handlers.commit);
router.post('/remove-prices', handlers.removePrices);
router.patch('/:id', handlers.edit);
router.post('/:id/archive', handlers.archive);
router.post('/:id/restore', handlers.restore);
router.delete('/:id', handlers.delete);
export default router;
