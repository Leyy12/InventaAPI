import express from 'express';
import { getDataStore, FieldPath } from '../database/data-store.js';
import { getAuth } from '../services/supabase-auth.js';
import { createApiKeyHandlers } from '../services/api-key-management.js';
import { createApiHistoryHandler } from '../services/api-history.js';

const router = express.Router();
const handlers = createApiKeyHandlers({
  monthlyCutoverAt: process.env.FREE_MONTHLY_QUOTA_CUTOVER_AT,
  vaultSecret: process.env.API_KEY_ENCRYPTION_SECRET,
  getDb: () => getDataStore(),
  verifyIdToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked),
});

// Every handler verifies the bearer token, derives identity, and checks ownership.
router.post('/generate', handlers.create);
router.get('/', handlers.list);
router.get('/history', createApiHistoryHandler({
  getDb: () => getDataStore(),
  verifyIdToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked),
  documentId: FieldPath.documentId(),
}));
router.get('/:id', handlers.view);
router.get('/:id/secret', handlers.reveal);
router.post('/:id/replace', handlers.replace);
router.patch('/:id/products', handlers.products);
router.patch('/:id', handlers.rename);
// Preserve the existing DELETE-as-revocation contract; account usage is never deleted.
router.delete('/:id', handlers.revoke);

export default router;
