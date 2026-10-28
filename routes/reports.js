import { Router } from 'express';
import { getAuth } from '../services/supabase-auth.js';
import { getDataStore } from '../database/data-store.js';
import { createCategoryUsageHandler } from '../services/category-usage.js';

const router = Router();
router.get('/category-usage', createCategoryUsageHandler({ getDb: getDataStore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) }));
export default router;
