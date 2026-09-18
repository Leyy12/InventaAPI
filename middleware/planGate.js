import { getFirestore } from 'firebase-admin/firestore';
import { createDaaSSecurity } from '../services/daas-security.js';

export { requirePlan } from '../services/daas-security.js';
export const { enforceRequestLimit } = createDaaSSecurity({
  getDb: () => getFirestore(),
  // Optional operator assertion: all legacy traffic/writes ended at this time.
  // Unset/invalid configuration conservatively holds uninitialized accounts.
  cutoverAt: process.env.API_QUOTA_CUTOVER_AT,
});
