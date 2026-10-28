import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { openCredential, sealCredential } from '../../../services/credential-vault.js';
import { memoryStore, invoke } from '../phase2a/memory-store.mjs';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const SECRET = 'test-vault-secret-with-at-least-32-characters';
const account = { plan: 'Pro', apiRequestLimit: 5000, subscription_status: 'active', selectedSegment: 'Grocery',
  businessSegment: 'Grocery', subscriptionStartedAt: NOW.toISOString(), subscriptionExpiresAt: '2026-10-17T12:00:00.000Z' };
const contracts = { version: 1, plans: { pro: { version: 1, period: 'utc_daily', limit: 500 } } };

function setup(vaultSecret = SECRET, extra = {}) {
  const db = memoryStore({ 'users/owner': account, 'account_request_contracts/owner': contracts,
    'users/other': account, 'account_request_contracts/other': contracts,
    'products/rice': { name: 'Rice', segment: 'Grocery', category: 'Grains', status: 'Active' }, ...extra });
  const handlers = createApiKeyHandlers({ getDb: () => db, clock: () => new Date(NOW), vaultSecret,
    verifyIdToken: async token => {
      if (token === 'owner-token') return { uid: 'owner', email: 'owner@example.test' };
      if (token === 'other-token') return { uid: 'other' };
      throw new Error('Invalid token');
    } });
  return { db, handlers };
}

test('vault round-trips, binds the key id, and refuses short or missing secrets', () => {
  const sealed = sealCredential('daas_v2_abc.def', 'key-1', SECRET);
  assert.ok(!JSON.stringify(sealed).includes('daas_v2_abc.def'));
  assert.equal(openCredential(sealed, 'key-1', SECRET), 'daas_v2_abc.def');
  assert.equal(openCredential(sealed, 'key-2', SECRET), null);
  assert.equal(openCredential(sealed, 'key-1', `${SECRET}x`), null);
  assert.equal(sealCredential('x', 'key-1', 'short'), null);
  assert.equal(sealCredential('x', 'key-1', undefined), null);
});

test('owner can copy a new key again; others, revoked keys and unsealed keys cannot', async () => {
  const { db, handlers } = setup();
  const created = await invoke(handlers.create, { body: { keyName: 'Copyable', linkedProductIds: ['rice'] } });
  assert.equal(created.statusCode, 200);
  const id = created.body.id;
  const stored = db.read(`api_keys/${id}`);
  assert.ok(stored.credentialSealed && !JSON.stringify(stored).includes(created.body.key));
  assert.equal(created.body.copyAvailable, true);

  const listed = await invoke(handlers.list);
  const row = listed.body.keys.find(key => key.id === id);
  assert.equal(row.copyAvailable, true);
  assert.ok(!('credentialSealed' in row) && !JSON.stringify(listed.body).includes(created.body.key));

  const copied = await invoke(handlers.reveal, { id });
  assert.equal(copied.statusCode, 200);
  assert.equal(copied.body.key, created.body.key);
  assert.equal(copied.headers['Cache-Control'], 'no-store');

  assert.equal((await invoke(handlers.reveal, { id, token: 'other-token' })).statusCode, 403);
  assert.equal((await invoke(handlers.reveal, { id, token: null })).statusCode, 401);

  await invoke(handlers.revoke, { id });
  assert.notEqual((await invoke(handlers.reveal, { id })).statusCode, 200);
});

test('keys created without a vault secret stay hash-only and say how to get a copyable key', async () => {
  const { handlers } = setup(null);
  const created = await invoke(handlers.create, { body: { keyName: 'Legacy', linkedProductIds: ['rice'] } });
  assert.equal(created.body.copyAvailable, false);
  const copied = await invoke(handlers.reveal, { id: created.body.id });
  assert.equal(copied.statusCode, 404);
  assert.equal(copied.body.error, 'KEY_NOT_RECOVERABLE');
});

test('route and UI wiring: owner-only secret route, copy button only for copyable keys', () => {
  const routes = readFileSync(new URL('../../../routes/apikeys.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.get\('\/:id\/secret', handlers\.reveal\)/);
  assert.match(routes, /vaultSecret: process\.env\.API_KEY_ENCRYPTION_SECRET/);
  const page = readFileSync(new URL('../../../dashboard/src/app/dashboard/api-keys/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /disabled=\{!apiKey\.copyAvailable/);
  assert.match(page, /\/secret`\)/);
  assert.match(page, /navigator\.clipboard\.writeText\(data\.key\)/);
  assert.match(page, /Create a new key to be able to copy it later/);
});
