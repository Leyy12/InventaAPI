import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createApiKeyHandlers } from '../services/api-key-management.js';

const router = express.Router();
const handlers = createApiKeyHandlers({
  getDb: () => getFirestore(),
  verifyIdToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked),
});

// Every handler verifies the bearer token, derives identity, and checks ownership.
router.post('/generate', handlers.create);
router.get('/', handlers.list);
router.get('/:id', handlers.view);
router.patch('/:id/products', handlers.products);
router.patch('/:id', handlers.rename);
// Preserve the existing DELETE-as-revocation contract; account usage is never deleted.
router.delete('/:id', handlers.revoke);

export default router;
