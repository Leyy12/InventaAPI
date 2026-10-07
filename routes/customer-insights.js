import { Router } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createCustomerIntelligenceHandlers } from '../services/customer-intelligence-handlers.js';

const router = Router();
const handlers = createCustomerIntelligenceHandlers({ getDb: getFirestore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) });
router.get('/sales-feed', handlers.feed);
export default router;
