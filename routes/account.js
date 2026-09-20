import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createAccountDeletionHandler } from '../services/account-deletion.js';
const router = express.Router();
router.post('/deletion', createAccountDeletionHandler({ getDb: () => getFirestore(),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  deleteAuthUser: uid => getAuth().deleteUser(uid) }));
export default router;
