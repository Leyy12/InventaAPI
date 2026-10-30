// Test helper kept for older quota tests: one catalog call. Paid plans count one
// request per call at admission (consumeAccountQuota), so this is admission only.
import { consumeAccountQuota } from '../../../services/account-quota.js';

export async function consumeAndDeliver(db, options) {
  return consumeAccountQuota(db, options);
}
