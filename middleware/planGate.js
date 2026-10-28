import { getDataStore } from '../database/data-store.js';
import { createDaaSSecurity } from '../services/daas-security.js';

export { requirePlan, requirePaidSubscription } from '../services/daas-security.js';
export const { enforceRequestLimit } = createDaaSSecurity({
  getDb: () => getDataStore(),
  // Optional operator assertion: all legacy traffic/writes ended at this time.
  // Unset/invalid configuration conservatively holds uninitialized accounts.
  cutoverAt: process.env.API_QUOTA_CUTOVER_AT,
  monthlyCutoverAt: process.env.FREE_MONTHLY_QUOTA_CUTOVER_AT,
});
