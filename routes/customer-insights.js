import { Router } from 'express';
import { getDataStore } from '../database/data-store.js';
import { getAuth } from '../services/supabase-auth.js';
import { createCustomerIntelligenceHandlers } from '../services/customer-intelligence-handlers.js';

const router = Router();
const handlers = createCustomerIntelligenceHandlers({ getDb: getDataStore,
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked) });
router.get('/sales-feed', handlers.feed);
export default router;
