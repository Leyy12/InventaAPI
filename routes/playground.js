import { Router } from 'express';
import { getFirestore } from '../database/firestore.js';
import { getAuth } from 'firebase-admin/auth';
import { createPlaygroundPreviewHandler } from '../services/playground-preview.js';

const router = Router();
// Signed-in preview of selected products; never issues a key or consumes allowance.
router.post('/preview', createPlaygroundPreviewHandler({ getDb: getFirestore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) }));
export default router;
