import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemSettingsHandlers } from '../../services/system-settings.js';
import { Timestamp } from '../../functions/postgres-data-store.mjs';
import { memoryStore, invoke } from './phase2a/memory-store.mjs';

const CREATED = Timestamp.fromMillis(Date.parse('2026-10-01T00:00:00.000Z'));
function fixture() {
  const db = memoryStore({
    'users/admin': { role: 'Admin' }, 'users/customer': { role: 'Developer', email: 'c@example.test' },
    'api_keys/k1': { userId: 'customer' }, 'payment_orders/p1': { userId: 'customer' },
    'products/rice': { name: 'Rice', category: 'Grains', createdAt: CREATED },
    'system/settings': { maintenanceMode: false, allowNewRegistrations: true, planRequestLimits: { free_trial: 100, pro: 500, pro_max: null } },
  });
  db.batch = () => { const ops = []; return { set(ref, data) { ops.push(() => ref.set(data)); return this; }, async commit() { for (const op of ops) await op(); } }; };
  const handlers = createSystemSettingsHandlers({ getDb: () => db, apiVersion: '1.0.0',
    verifyIdToken: async token => ({ uid: token === 'admin-token' ? 'admin' : 'customer' }), report() {} });
  return { db, handlers };
}

test('backup holds products and settings only, with dates kept', async () => {
  const { handlers } = fixture();
  const result = await invoke(handlers.backup, { token: 'admin-token' });
  assert.equal(result.statusCode, 200);
  const file = result.body.backup;
  assert.equal(file.format, 'inventaapi-backup');
  assert.deepEqual(file.products, [{ id: 'rice', data: { name: 'Rice', category: 'Grains', createdAt: { $timestamp: '2026-10-01T00:00:00.000Z' } } }]);
  assert.deepEqual(Object.keys(file.settings).sort(), ['allowNewRegistrations', 'planRequestLimits']);
  assert.doesNotMatch(JSON.stringify({ ...file, contents: undefined }), /customer|api_keys|payment|c@example/);
});

test('only admins can back up or restore', async () => {
  const { handlers } = fixture();
  assert.equal((await invoke(handlers.backup, { token: 'customer-token' })).statusCode, 403);
  assert.equal((await invoke(handlers.restore, { token: 'customer-token', body: { backup: {} } })).statusCode, 403);
});

test('restore writes products and settings back and keeps newer products', async () => {
  const { db, handlers } = fixture();
  const file = (await invoke(handlers.backup, { token: 'admin-token' })).body.backup;
  file.settings.planRequestLimits.pro = 900;
  await db.collection('products').doc('rice').set({ name: 'Broken', category: 'Oops' });
  await db.collection('products').doc('sugar').set({ name: 'Sugar', category: 'Baking' });
  const result = await invoke(handlers.restore, { token: 'admin-token', body: { backup: JSON.parse(JSON.stringify(file)) } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.restoredProducts, 1);
  const rice = (await db.collection('products').doc('rice').get()).data();
  assert.equal(rice.name, 'Rice');
  // The test store copies data with structuredClone, so the date comes back as plain fields.
  assert.deepEqual([rice.createdAt._seconds, rice.createdAt._nanoseconds], [CREATED.seconds, CREATED.nanoseconds]);
  assert.equal((await db.collection('products').doc('sugar').get()).exists, true);
  const settings = (await db.collection('system').doc('settings').get()).data();
  assert.equal(settings.planRequestLimits.pro, 900);
  assert.equal(settings.maintenanceMode, false);
  assert.equal((await db.collection('api_keys').doc('k1').get()).exists, true);
});

test('restore rejects files that are not InventaAPI backups', async () => {
  const { handlers } = fixture();
  for (const backup of [{}, { format: 'other', version: 1, products: [] },
    { format: 'inventaapi-backup', version: 1, products: [{ id: 'a/b', data: {} }] },
    { format: 'inventaapi-backup', version: 1, products: [], settings: { planRequestLimits: { pro: -5 } } }]) {
    const result = await invoke(handlers.restore, { token: 'admin-token', body: { backup } });
    assert.equal(result.statusCode, 400, JSON.stringify(backup));
    assert.equal(result.body.code, 'BACKUP_INVALID');
  }
});
