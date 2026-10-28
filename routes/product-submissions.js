import { Router } from 'express';
import { getAuth } from '../services/supabase-auth.js';
import { getDataStore } from '../database/data-store.js';
import { createProductSubmissionHandlers } from '../services/product-submissions.js';

const handlers = createProductSubmissionHandlers({ getDb: getDataStore,
  verifyIdToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked) });
export const customerSubmissionsRouter = Router();
export const adminSubmissionsRouter = Router();
customerSubmissionsRouter.post('/', handlers.submit);
adminSubmissionsRouter.get('/', handlers.list);
adminSubmissionsRouter.get('/:id', handlers.read);
adminSubmissionsRouter.post('/:id/approve', handlers.approve);
adminSubmissionsRouter.post('/:id/reject', handlers.reject);
