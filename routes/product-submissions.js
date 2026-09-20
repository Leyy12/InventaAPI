import { Router } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createProductSubmissionHandlers } from '../services/product-submissions.js';

const handlers = createProductSubmissionHandlers({ getDb: getFirestore,
  verifyIdToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked) });
export const customerSubmissionsRouter = Router();
export const adminSubmissionsRouter = Router();
customerSubmissionsRouter.post('/', handlers.submit);
adminSubmissionsRouter.get('/', handlers.list);
adminSubmissionsRouter.get('/:id', handlers.read);
adminSubmissionsRouter.post('/:id/approve', handlers.approve);
adminSubmissionsRouter.post('/:id/reject', handlers.reject);
