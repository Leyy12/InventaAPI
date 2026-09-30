import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiKeyHandlers } from '../../../services/api-key-management.js';
import { accountEntitlement, authenticateCredential, issueCredential } from '../../../services/api-key-security.js';
import { memoryFirestore, invoke } from '../phase2a/memory-firestore.mjs';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const free = { plan: 'Free', apiRequestLimit: 50, selectedSegment: 'Grocery', businessSegment: 'Grocery' };
const trial = { ...free, hasUsedFreeTrial: true, trialVersion: 1,
  trialStartedAt: NOW.toISOString(), trialExpiresAt: '2026-09-24T12:00:00.000Z' };
const paid = { ...free, plan: 'Pro', apiRequestLimit: 5000, subscription_status: 'active',
  subscriptionExpiresAt: '2026-10-17T12:00:00.000Z' };
const counter = { used: 2, startedAt: NOW.toISOString(), expiresAt: trial.trialExpiresAt };

function fixture(account = trial, oldKey = null) {
  const issued = issueCredential();
  const old = oldKey || { ...issued.stored, name: 'Grocery integration', userId: 'owner',
    userEmail: 'owner@example.test', status: 'active', linkedProductIds: ['rice'],
    linkedVariantSelections: {}, productAvailability: { rice: { availableSince: NOW } }, createdAt: NOW };
  const db = memoryFirestore({
    'users/owner': account, 'users/other': free, [`api_keys/${issued.id}`]: old,
    'account_trial_usage/owner': counter,
    'account_free_monthly_usage/owner': { window: '2026-09', used: 12 },
    'api_key_generation_days/marker': { userId: 'owner', window: '2026-09-17', keyId: issued.id },
  });
  const handlers = createApiKeyHandlers({ getDb: () => db, clock: () => new Date(NOW),
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(checkRevoked, true);
      if (token === 'owner-token') return { uid: 'owner', email: 'owner@example.test' };
      if (token === 'other-token') return { uid: 'other' };
      throw new Error('Invalid token');
    } });
  return { db, handlers, oldId: issued.id, oldSecret: issued.credential, old };
}
const docs = async db => (await db.collection('api_keys').get()).docs;
const active = async db => (await docs(db)).filter(doc => doc.data().status === 'active');

test('owned active Trial key rotates atomically; old fails, new authenticates under the same entitlement', async () => {
  const f = fixture();
  const result = await invoke(f.handlers.replace, { id: f.oldId, body: { userId: 'other', plan: 'Enterprise' } });
  assert.equal(result.statusCode, 200);
  assert.match(result.body.key, /^daas_v2_[a-f0-9]{32}\.[a-f0-9]{64}$/u);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  const old = f.db.read(`api_keys/${f.oldId}`);
  const next = f.db.read(`api_keys/${result.body.id}`);
  assert.equal(old.status, 'revoked');
  assert.equal(old.replacedByKeyId, result.body.id);
  assert.equal(next.status, 'active');
  assert.equal(next.replacesKeyId, f.oldId);
  assert.equal(next.rotationReason, 'replacement');
  assert.deepEqual(next.linkedProductIds, ['rice']);
  assert.deepEqual(next.productAvailability, f.old.productAvailability);
  assert.equal(next.userId, 'owner');
  assert.equal(next.plan, 'Pro Trial');
  assert.equal((await active(f.db)).length, 1);
  await assert.rejects(authenticateCredential(f.db, f.oldSecret, NOW), error => error.status === 401);
  assert.equal((await authenticateCredential(f.db, result.body.key, NOW)).id, result.body.id);
  assert.equal(accountEntitlement(f.db.read('users/owner'), NOW).activeTrial, true);
  assert.equal(JSON.stringify((await invoke(f.handlers.view, { id: result.body.id })).body).includes(result.body.key), false);
  assert.equal(JSON.stringify((await invoke(f.handlers.list)).body).includes(result.body.key), false);
  assert.equal(JSON.stringify(next).includes(result.body.key), false);
  assert.equal(JSON.stringify(f.db.read('audit_logs/auto-1')).includes(result.body.key), false);
  assert.equal(f.db.read('account_trial_usage/owner').used, 2);
  assert.equal(f.db.read('account_free_monthly_usage/owner').used, 12);
  assert.equal(f.db.read('api_key_generation_days/marker').keyId, f.oldId);
});

test('foreign, missing, revoked, and expired keys fail closed without new key', async () => {
  for (const kind of ['foreign', 'missing', 'revoked', 'expired']) {
    const f = fixture();
    if (kind === 'revoked') await f.db.collection('api_keys').doc(f.oldId).update({ status: 'revoked' });
    if (kind === 'expired') await f.db.collection('api_keys').doc(f.oldId).update({ expiresAt: '2026-09-17T11:00:00.000Z' });
    const response = await invoke(f.handlers.replace, { id: kind === 'missing' ? 'not-a-key' : f.oldId,
      token: kind === 'foreign' ? 'other-token' : 'owner-token' });
    assert.equal(response.statusCode, kind === 'foreign' ? 403 : kind === 'missing' ? 404 : 401);
    assert.equal((await docs(f.db)).length, 1);
    assert.equal(typeof response.body.key, 'undefined');
  }
});

test('concurrent retries cannot create multiple active successors', async () => {
  const f = fixture();
  const results = await Promise.all([invoke(f.handlers.replace, { id: f.oldId }),
    invoke(f.handlers.replace, { id: f.oldId })]);
  assert.equal(results.filter(result => result.statusCode === 200).length, 1);
  assert.equal((await active(f.db)).length, 1);
  assert.equal((await docs(f.db)).length, 2);
  assert.notEqual((await invoke(f.handlers.replace, { id: f.oldId })).statusCode, 200);
});

test('failed transaction keeps the original secret active and creates no successor', async () => {
  const f = fixture();
  f.db.failCommit = true;
  assert.equal((await invoke(f.handlers.replace, { id: f.oldId })).statusCode, 503);
  assert.equal(f.db.read(`api_keys/${f.oldId}`).status, 'active');
  assert.equal((await docs(f.db)).length, 1);
  assert.equal((await authenticateCredential(f.db, f.oldSecret, NOW)).id, f.oldId);
});

test('paid Pro, Pro Max and legacy Free active keys rotate without consuming generation or request quotas', async () => {
  for (const account of [paid, { ...paid, plan: 'Pro Max', apiRequestLimit: null }, free]) {
    const f = fixture(account);
    const result = await invoke(f.handlers.replace, { id: f.oldId });
    assert.equal(result.statusCode, 200);
    assert.equal((await active(f.db)).length, 1);
    assert.equal(f.db.read(`api_keys/${result.body.id}`).plan, account.plan);
    assert.equal(f.db.read('api_key_generation_days/marker').keyId, f.oldId);
    assert.equal(f.db.read('account_free_monthly_usage/owner').used, 12);
    assert.equal(f.db.read('account_trial_usage/owner').used, 2);
    await assert.rejects(authenticateCredential(f.db, f.oldSecret, NOW), error => error.status === 401);
    assert.equal((await authenticateCredential(f.db, result.body.key, NOW)).id, result.body.id);
    assert.equal(JSON.stringify(f.db.read(`api_keys/${result.body.id}`)).includes(result.body.key), false);
  }
});

test('Free zero-key cannot replace or generate; Upgrade Required cannot replace', async () => {
  const zero = fixture(free);
  await zero.db.collection('api_keys').doc(zero.oldId).delete();
  assert.equal((await invoke(zero.handlers.replace, { id: zero.oldId })).statusCode, 404);
  const create = await invoke(zero.handlers.create, { body: { keyName: 'New key' } });
  assert.equal(create.statusCode, 403);
  assert.equal(create.body.error, 'TRIAL_REQUIRED');
  assert.equal((await active(zero.db)).length, 0);
  const ended = fixture({ ...trial, trialExhaustedAt: NOW.toISOString() });
  const response = await invoke(ended.handlers.replace, { id: ended.oldId });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, 'UPGRADE_REQUIRED');
  assert.equal(ended.db.read(`api_keys/${ended.oldId}`).status, 'active');
});

test('legacy plaintext secret is never copied into replacement storage or audit', async () => {
  const f = fixture(free, { key: 'daas_legacy_secret', name: 'Legacy', userId: 'owner',
    status: 'active', linkedProducts: [{ id: 'rice', name: 'Untrusted label' }] });
  const result = await invoke(f.handlers.replace, { id: f.oldId });
  assert.equal(result.statusCode, 200);
  const replacement = f.db.read(`api_keys/${result.body.id}`);
  assert.equal(Object.hasOwn(replacement, 'key'), false);
  assert.deepEqual(replacement.linkedProducts, [{ id: 'rice' }]);
  assert.equal(JSON.stringify(replacement).includes('daas_legacy_secret'), false);
  assert.equal(JSON.stringify(f.db.read('audit_logs/auto-1')).includes('daas_legacy_secret'), false);
});
