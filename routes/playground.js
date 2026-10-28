import { Router } from 'express';
import { getDataStore } from '../database/data-store.js';
import { getAuth } from '../services/supabase-auth.js';
import { createPlaygroundPreviewHandler } from '../services/playground-preview.js';

const router = Router();
// Signed-in preview of selected products; never issues a key or consumes allowance.
router.post('/preview', createPlaygroundPreviewHandler({ getDb: getDataStore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) }));
export default router;
