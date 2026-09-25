import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createFreeTrialHandlers } from '../services/free-trial.js';

const router = express.Router();
const handlers = createFreeTrialHandlers({ getDb: () => getFirestore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  revokeRefreshTokens: uid => getAuth().revokeRefreshTokens(uid) });
router.post('/activate', handlers.activate);
router.get('/status', handlers.status);
export default router;
