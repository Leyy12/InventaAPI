import express from 'express';
import { getDataStore } from '../database/data-store.js';
import { getAuth } from '../services/supabase-auth.js';
import { createFreeTrialHandlers } from '../services/free-trial.js';

const router = express.Router();
const handlers = createFreeTrialHandlers({ getDb: () => getDataStore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  revokeRefreshTokens: uid => getAuth().revokeRefreshTokens(uid) });
router.post('/activate', handlers.activate);
router.post('/session', handlers.session);
router.get('/status', handlers.status);
export default router;
