import express from 'express';
import { getAuth } from '../services/supabase-auth.js';
import { getDataStore } from '../database/data-store.js';
import { createAccountDeletionHandler } from '../services/account-deletion.js';
const router = express.Router();
router.post('/deletion', createAccountDeletionHandler({ getDb: () => getDataStore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  deleteAuthUser: uid => getAuth().deleteUser(uid) }));
export default router;
