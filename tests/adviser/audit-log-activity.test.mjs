// Pure mutation services with an atomic in-memory database; no Firebase/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogHandlers } from '../../services/catalog-management.js';
import { createProductSubmissionHandlers } from '../../services/product-submissions.js';
import { createApiKeyHandlers } from '../../services/api-key-management.js';
import { memoryFirestore, invoke } from './r2a/memory-firestore.mjs';
import { memoryFirestore as keyFirestore } from './phase2a/memory-firestore.mjs';

const at = '2026-10-13T01:00:00.000Z';
const product = { name: 'Synthetic Rice', brand: 'Fixture', segment: 'Grocery', category: 'Grains',
  description: 'Private body sentinel', variants: [{ sku: 'TEST-RICE', size: '1kg', price: 1, password: 'variant-secret-sentinel' }] };
const submissionProduct = { ...product, variants: [{ sku: 'TEST-RICE', size: '1kg', price: 1 }] };
function fixture(extra = {}, withEmail = true) {
  const db = memoryFirestore({ 'users/admin': { role: 'Admin', email: 'untrusted-profile@example.test' },
    'users/customer': { role: 'Developer', plan: 'Free', businessSegment: 'Grocery' }, ...extra });
  let serial = 0;
  const verified = [];
  const dependencies = { getDb: () => db, now: () => new Date(at), makeId: () => `fixture-${++serial}`,
    verifyIdToken: async (token, revoked) => {
      verified.push([token, revoked]);
      if (!['admin', 'customer'].includes(token)) throw Error('invalid');
      return { uid: token, ...(withEmail ? { email: `${token}@verified.example.test` } : {}), tokenSecret: 'token-secret-sentinel' };
    } };
  const catalog = createCatalogHandlers(dependencies), submissions = createProductSubmissionHandlers(dependencies);
  const call = (name, body, params = {}, extra = {}) => invoke(catalog[name], { token: 'admin', body, params, ...extra });
  const create = (extra = {}) => call('create', { product }, {}, extra);
  const submit = (extra = {}) => invoke(submissions.submit, { token: 'customer', body: submissionProduct,
    headers: { 'idempotency-key': 'synthetic-operation-0001' }, ...extra });
  const review = (id, decision = 'approve', extra = {}) => invoke(submissions[decision], { token: 'admin', params: { id }, ...extra });
  const logs = () => Object.entries(db.dump()).filter(([path]) => path.startsWith('audit_logs/')).map(([, data]) => data);
  return { db, catalog, submissions, call, create, submit, review, logs, verified };
}

test('catalog lifecycle audits actual successful outcomes and verified actors', async () => {
  const f = fixture(), made = await f.create();
  assert.equal(made.statusCode, 200);
  const id = made.body.product.id;
  for (const [action, expectedRevision, body] of [['edit', 1, { product: { description: 'New body sentinel' } }],
    ['archive', 2, {}], ['restore', 3, {}], ['delete', 4, {}]]) {
    assert.equal((await f.call(action, { ...body, expectedRevision }, { id })).statusCode, 200);
  }
  const logs = f.logs();
  assert.deepEqual(logs.map(log => log.action), ['Product Created', 'Product Updated', 'Product Unpublished', 'Product Published', 'Product Deleted']);
  assert.deepEqual(logs.map(log => log.metadata.catalogRevision), [1, 2, 3, 4, 5]);
  for (const log of logs) {
    assert.equal(log.userId, 'admin'); assert.equal(log.userEmail, 'admin@verified.example.test');
    assert.equal(log.entityType, 'product'); assert.equal(log.entityId, id);
    assert.equal(log.timestamp.toISOString(), at); assert.ok(log.details.includes(id));
  }
  assert.ok(f.verified.every(([, revoked]) => revoked === true));
  assert.doesNotMatch(JSON.stringify(logs), /sentinel|untrusted-profile|TEST-RICE|password|tokenSecret|authorization/);
});

test('create receipt replay and stale edits do not add a second event', async () => {
  const f = fixture(), extra = { headers: { 'idempotency-key': 'catalog-operation-0001' } };
  const first = await f.create(extra); const replay = await f.create(extra);
  assert.equal(replay.body.replayed, true); assert.equal(f.logs().length, 1);
  const id = first.body.product.id;
  assert.equal((await f.call('edit', { product: { description: 'updated' }, expectedRevision: 1 }, { id })).statusCode, 200);
  assert.equal((await f.call('edit', { product: { description: 'stale' }, expectedRevision: 1 }, { id })).statusCode, 409);
  assert.equal(f.logs().length, 2);
});

for (const decision of ['approve', 'reject']) test(`submission ${decision} records one actual decision including retries`, async () => {
  const f = fixture(); const created = await f.submit(); const id = created.body.id;
  assert.equal(created.statusCode, 201);
  assert.equal((await f.submit()).body.replayed, true);
  const results = await Promise.all([f.review(id, decision), f.review(id, decision)]);
  assert.ok(results.every(result => result.statusCode === 200));
  assert.equal(results.filter(result => result.body.replayed).length, 1);
  assert.equal(f.logs().length, 2);
  const [submission, reviewed] = f.logs();
  assert.equal(submission.action, 'Product Submission Created');
  assert.equal(submission.userId, 'customer'); assert.equal(submission.userEmail, 'customer@verified.example.test');
  assert.equal(reviewed.action, decision === 'approve' ? 'Product Submission Approved' : 'Product Submission Rejected');
  assert.equal(reviewed.userId, 'admin'); assert.equal(reviewed.entityId, id);
  assert.equal(reviewed.entityType, 'product_submission');
  if (decision === 'approve') {
    assert.equal(reviewed.metadata.productId, `submission_${id}`);
    assert.equal(f.db.read(`products/submission_${id}`).name, product.name);
    assert.equal(f.logs().some(log => log.action === 'Product Created'), false);
  } else assert.deepEqual(reviewed.metadata, {});
  assert.equal((await f.review(id, decision === 'approve' ? 'reject' : 'approve')).statusCode, 409);
  assert.equal(f.logs().length, 2);
  assert.doesNotMatch(JSON.stringify(f.logs()), /sentinel|password|tokenSecret|authorization/);
});

test('catalog transaction retry publishes exactly one successful event', async () => {
  const f = fixture();
  f.db.beforeCommit = () => { f.db.beforeCommit = null; f.db.seed('users/admin', { role: 'Admin', updated: true }); };
  assert.equal((await f.create()).statusCode, 200); assert.ok(f.db.retries > 0); assert.equal(f.logs().length, 1);
});

test('verified UID is retained when token email is unavailable; profile email is not substituted', async () => {
  const f = fixture({}, false); assert.equal((await f.create()).statusCode, 200);
  assert.equal(f.logs()[0].userId, 'admin'); assert.equal(Object.hasOwn(f.logs()[0], 'userEmail'), false);
});

test('failed submission creation has no record or event and recovers once with the same operation', async () => {
  const f = fixture(); f.db.failWrite = 'audit_logs/';
  assert.equal((await f.submit()).statusCode, 503); assert.equal(f.logs().length, 0);
  assert.equal(Object.keys(f.db.dump()).some(path => path.startsWith('product_requests/')), false);
  f.db.failWrite = null;
  assert.equal((await f.submit()).statusCode, 201); assert.equal((await f.submit()).body.replayed, true);
  assert.equal(f.logs().length, 1);
});

for (const failWrite of ['products/', 'audit_logs/']) test(`atomic catalog outage at ${failWrite} has no false success or replayed mutation`, async () => {
  const f = fixture(); f.db.failWrite = failWrite;
  const extra = { headers: { 'idempotency-key': 'catalog-operation-0002' } };
  assert.equal((await f.create(extra)).statusCode, 503);
  assert.equal(f.logs().length, 0); assert.equal(Object.keys(f.db.dump()).some(path => path.startsWith('products/')), false);
  f.db.failWrite = null;
  assert.equal((await f.create(extra)).statusCode, 200); assert.equal((await f.create(extra)).body.replayed, true);
  assert.equal(f.logs().length, 1);
});

for (const decision of ['approve', 'reject']) test(`failed ${decision} commits neither outcome nor event`, async () => {
  const f = fixture(); const id = (await f.submit()).body.id;
  f.db.failWrite = 'audit_logs/';
  assert.equal((await f.review(id, decision)).statusCode, 503);
  assert.equal(f.db.read(`product_requests/${id}`).status, 'submitted'); assert.equal(f.logs().length, 1);
  assert.equal(f.db.read(`products/submission_${id}`), undefined);
  f.db.failWrite = null;
  assert.equal((await f.review(id, decision)).statusCode, 200); assert.equal(f.logs().length, 2);
});

test('denied, malformed and spoofed operations create no success audit', async () => {
  const f = fixture();
  for (const token of [null, 'invalid', 'customer']) assert.ok((await f.create({ token })).statusCode >= 400);
  assert.equal((await f.call('create', { product, userId: 'admin', userEmail: 'spoof@example.test' })).statusCode, 400);
  assert.equal((await f.call('create', { product: { ...product, category: '' } })).statusCode, 400);
  assert.equal(f.logs().length, 0);
  f.db.beforeCommit = () => { f.db.beforeCommit = null; f.db.seed('users/admin', { role: 'Developer' }); };
  assert.equal((await f.create()).statusCode, 403); assert.equal(f.logs().length, 0);
});

test('CSV preview and skipped/replayed rows add no success audits; imported rows reuse the writer', async () => {
  const f = fixture();
  const rows = [['name', 'category', 'segment', 'sku', 'price'], ['Synthetic CSV', 'Food', 'Grocery', 'CSV-TEST', '1']];
  const preview = await f.call('preview', { rows }); assert.equal(preview.statusCode, 200); assert.equal(f.logs().length, 0);
  const body = { previewId: preview.body.previewId, rows: [2] };
  assert.equal((await f.call('commit', body)).body.results[0].status, 'IMPORTED');
  assert.equal((await f.call('commit', body)).body.results[0].replayed, true);
  assert.equal(f.logs().length, 1); assert.equal(f.logs()[0].action, 'Product Created');
});

test('historical records remain unchanged and catalog reads produce no activity writes', async () => {
  const historical = { action: 'Customer Login', userId: 'customer', timestamp: '2020-01-01', details: 'Historical' };
  const f = fixture({ 'audit_logs/old': historical });
  await f.create(); assert.deepEqual(f.db.read('audit_logs/old'), historical);
  await invoke(f.submissions.list, { token: 'admin' }); assert.equal(f.logs().length, 2);
});

test('existing key lifecycle writer emits once per operation and already covers persisted Customer scope', async () => {
  const db = keyFirestore({ 'users/owner': { plan: 'Pro', apiRequestLimit: 500, subscription_status: 'active',
    subscriptionExpiresAt: '2027-01-01T00:00:00.000Z', selectedSegment: 'Grocery' },
    'products/rice': { segment: 'Grocery' } });
  const events = []; const collection = db.collection;
  db.collection = name => {
    const ref = collection(name);
    if (name === 'audit_logs') return { ...ref, add: async record => { events.push(record); return ref.add(record); } };
    return ref;
  };
  const keys = createApiKeyHandlers({ getDb: () => db, clock: () => new Date(at), verifyIdToken: async () => ({ uid: 'owner', email: 'owner@example.test' }) });
  const made = await invoke(keys.create, { body: { keyName: 'Synthetic Key', linkedProductIds: [] } });
  assert.equal(made.statusCode, 200);
  const id = made.body.id;
  assert.equal((await invoke(keys.rename, { params: { id }, body: { name: 'Renamed' } })).statusCode, 200);
  assert.equal((await invoke(keys.products, { params: { id }, body: { linkedProductIds: ['rice'] } })).statusCode, 200);
  assert.equal((await invoke(keys.revoke, { params: { id } })).statusCode, 200);
  assert.deepEqual(events.map(event => event.action), ['API Key Generated', 'API Key Renamed', 'API Key Products Updated', 'API Key Revoked']);
  assert.equal(events.every(event => event.userId === 'owner'), true);
  assert.equal(JSON.stringify(events).includes(made.body.key), false);
  db.failCommit = true;
  assert.equal((await invoke(keys.rename, { params: { id }, body: { name: 'Failed' } })).statusCode, 503);
  assert.equal(events.length, 4);
});
