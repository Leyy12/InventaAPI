import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminEntitlements } from '../../services/admin-entitlements.js';
import { memoryStore, invoke } from './phase2a/memory-store.mjs';

test('a paid account with no request today shows 0 used, not usage unavailable', async () => {
  const db = memoryStore({
    'users/ADMIN': { role: 'admin' },
    'users/pro': { plan: 'Pro', role: 'Developer', apiRequestLimit: 500, subscription_status: 'active',
      subscriptionStartedAt: '2026-10-13T11:43:30.887Z', subscriptionExpiresAt: '2026-11-12T11:43:30.887Z' },
  });
  const handler = createAdminEntitlements({ getDb: () => db, verifyIdToken: async () => ({ uid: 'ADMIN' }),
    clock: () => new Date('2026-10-23T15:00:00Z') });
  const result = await invoke(handler, { headers: { authorization: 'Bearer x' }, body: { ids: ['pro'] } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.accounts.pro.plan, 'Pro');
  assert.equal(result.body.accounts.pro.used, 0);
  assert.equal(result.body.accounts.pro.resetsAt, '2026-10-24T00:00:00.000Z');
});
