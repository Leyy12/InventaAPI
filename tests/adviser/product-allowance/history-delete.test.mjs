// Deleting from the customer's request history: own rows only, rows are hidden
// (the telemetry records stay), and "clear all" hides everything so far.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHistoryDeleteHandler } from '../../../services/api-history.js';
import { memoryStore, invoke } from '../phase2a/memory-store.mjs';

const db = () => memoryStore({
  'api_telemetry/t1': { userId: 'owner', endpoint: '/catalog' },
  'api_telemetry/t2': { userId: 'owner', endpoint: '/catalog' },
  'api_telemetry/x9': { userId: 'someone-else', endpoint: '/catalog' },
});
const handler = store => createApiHistoryDeleteHandler({ getDb: () => store, verifyIdToken: async () => ({ uid: 'owner' }),
  clock: () => new Date('2026-10-31T00:00:00.000Z') });

test('selected rows are hidden for the owner; the records themselves stay', async () => {
  const store = db();
  const result = await invoke(handler(store), { token: 't', body: { ids: ['t1'] } });
  assert.equal(result.statusCode, 200); assert.equal(result.body.deleted, 1);
  assert.deepEqual(Object.keys(store.read('api_history_hidden/owner').ids), ['t1']);
  assert.ok(store.read('api_telemetry/t1'), 'kept for admin statistics');
  await invoke(handler(store), { token: 't', body: { ids: ['t2'] } });
  assert.deepEqual(Object.keys(store.read('api_history_hidden/owner').ids).sort(), ['t1', 't2']);
});

test("another customer's row cannot be hidden; bad input is refused", async () => {
  const store = db();
  assert.equal((await invoke(handler(store), { token: 't', body: { ids: ['x9'] } })).statusCode, 404);
  assert.equal((await invoke(handler(store), { token: 't', body: { ids: [] } })).statusCode, 400);
  assert.equal((await invoke(handler(store), { token: 't', body: {} })).statusCode, 400);
  assert.equal(store.read('api_history_hidden/owner'), undefined);
});

test('clear all hides everything recorded so far', async () => {
  const store = db();
  const result = await invoke(handler(store), { token: 't', body: { all: true } });
  assert.equal(result.statusCode, 200); assert.equal(result.body.cleared, true);
  assert.equal(store.read('api_history_hidden/owner').clearedBefore, '2026-10-31T00:00:00.000Z');
});
