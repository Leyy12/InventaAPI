import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from '../database/firestore.js';
import { createCategoryUsageHandler } from '../services/category-usage.js';

const router = Router();
router.get('/category-usage', createCategoryUsageHandler({ getDb: getFirestore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) }));
export default router;
