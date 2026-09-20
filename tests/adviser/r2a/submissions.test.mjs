import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductSubmissionHandlers } from '../../../services/product-submissions.js';
import { normalizeProductImageUrl, validateSubmissionContent } from '../../../services/product-submission-contract.js';
import { projectProduct } from '../../../services/product-contract.js';
import { normalizeProductImageUrl as customerImage } from '../../../dashboard/src/lib/product-image-url.ts';
import { normalizeProductImageUrl as adminImage } from '../../../admin-panel/src/lib/product-image-url.ts';
import { memoryFirestore, invoke } from './memory-firestore.mjs';

const content = { name: ' Test Product ', brand: 'Brand', segment: 'groceries', category: 'Food',
  description: 'Description', variants: [{ flavor: 'Cheese', size: '50g', sku: 'abc-123', price: 25 }],
  image_url: ' https://images.example.invalid/product.jpg ' };
const at = '2026-09-20T01:00:00.000Z';
test('isolated loader refuses Firebase, network modules and production bootstrap', async () => {
  for (const name of ['firebase-admin/firestore', 'node:https', '../../../database/firebase.js']) {
    await assert.rejects(import(name));
  }
});
test('isolated runtime blocks global network APIs', async () => {
  assert.throws(() => globalThis['fetch']('https://example.invalid'));
  assert.throws(() => new globalThis.WebSocket('wss://example.invalid'));
});
function fixture(extra = {}) {
  const db = memoryFirestore({ 'users/customer': { role: 'Developer', plan: 'Free' },
    'users/admin': { role: 'Admin' }, 'users/stranger': { role: 'Developer' }, ...extra });
  let serial = 0;
  const verified = [];
  const handlers = createProductSubmissionHandlers({ getDb: () => db, now: () => new Date(at), makeId: () => `request-${++serial}`,
    verifyIdToken: async (token, revoked) => { verified.push([token, revoked]);
      if (!['customer', 'admin', 'stranger'].includes(token)) throw new Error('Invalid'); return { uid: token }; } });
  const submit = (overrides = {}) => invoke(handlers.submit, { token: 'customer', body: content,
    headers: { 'idempotency-key': 'operation-0000000001' }, ...overrides });
  const review = (id, decision = 'approve', overrides = {}) => invoke(handlers[decision], { token: 'admin', params: { id }, ...overrides });
  const products = () => Object.entries(db.dump()).filter(([path]) => path.startsWith('products/'));
  const submissions = () => Object.entries(db.dump()).filter(([path]) => path.startsWith('product_requests/'));
  return { db, handlers, submit, review, products, submissions, verified };
}

for (const token of [null, 'invalid']) test(`submission rejects token ${token}`, async () => {
  const f = fixture(); assert.equal((await f.submit({ token })).statusCode, 401); assert.equal(f.submissions().length, 0);
});
test('server-controlled creation, Free eligibility, revocation check and no publication', async () => {
  const f = fixture(), result = await f.submit(); assert.equal(result.statusCode, 201);
  const row = f.db.read(`product_requests/${result.body.id}`);
  assert.equal(row.userId, 'customer'); assert.equal(row.status, 'submitted'); assert.equal(row.createdAt, at);
  assert.equal(row.updatedAt, at); assert.equal(row.reviewedBy, null); assert.equal(row.reviewedAt, null); assert.equal(row.productId, null);
  assert.equal(row.content.segment, 'Grocery'); assert.equal(row.content.image_url, content.image_url.trim());
  assert.equal(f.products().length, 0); assert.deepEqual(f.verified, [['customer', true]]);
});
for (const field of ['userId', 'email', 'role', 'status', 'reviewedBy', 'reviewedAt', 'createdAt', 'updatedAt', 'productId', 'id', 'adminNotes']) {
  test(`customer cannot supply authoritative ${field}`, async () => {
    const f = fixture(); assert.equal((await f.submit({ body: { ...content, [field]: 'forged' } })).statusCode, 400);
    assert.equal(f.submissions().length, 0);
  });
}
test('query UID rejected', async () => assert.equal((await fixture().submit({ query: { userId: 'stranger' } })).statusCode, 400));
for (const account of [null, { deleted: true }, { disabled: true }, { accountState: 'deleting' }, { accountState: 'deleted' },
  { deletionRequested: true }, { status: 'deleted' }, { deletedAt: at }]) test(`account barrier ${JSON.stringify(account)}`, async () => {
  const f = fixture(); if (account) f.db.seed('users/customer', account); else f.db.remove('users/customer');
  assert.equal((await f.submit()).statusCode, 403); assert.equal(f.submissions().length, 0);
});
test('deletion starting during submit retries transaction and denies new record', async () => {
  const f = fixture(); f.db.beforeCommit = () => { f.db.beforeCommit = null; f.db.seed('users/customer', { accountState: 'deleting' }); };
  assert.equal((await f.submit()).statusCode, 403); assert.equal(f.submissions().length, 0);
});
for (const segment of ['Grocery', 'Pharmacy', 'Hardware', 'medicine', 'tools']) test(`canonical segment ${segment}`, () => {
  assert.ok(['Grocery', 'Pharmacy', 'Hardware'].includes(validateSubmissionContent({ ...content, segment }).segment));
});
for (const change of [{ segment: 'Other' }, { name: '' }, { category: '' }, { variants: [{ price: -1 }] },
  { variants: [{ price: '10' }] }, { variants: [{ price: Infinity }] }, { variants: [{ status: 'Active' }] },
  { variants: Array(51).fill({}) }, { name: 'x'.repeat(161) }, { description: 'x'.repeat(4001) }]) {
  test(`invalid content ${Object.keys(change)[0]} ${JSON.stringify(change).slice(0, 70)}`, async () => {
    assert.equal((await fixture().submit({ body: { ...content, ...change } })).statusCode, 400);
  });
}
for (const url of ['', '   ', 'https://example.invalid/p.jpg', ' https://example.invalid/p.jpg?size=1#image ']) {
  test(`image accepted consistently ${url}`, () => {
    for (const validator of [normalizeProductImageUrl, customerImage, adminImage]) assert.equal(validator(url), url.trim());
  });
}
for (const url of ['javascript:alert(1)', 'data:image/png;base64,a', 'file:///a', 'ftp://host/a', 'http://localhost/a',
  'not a url', 'https://', 'https:///host/a', 'https://user:pass@host/a', 'https://host/a b', 'https://host\\a', 'https://host/\u0000',
  'https://host/' + 'a'.repeat(2048), 123, null]) {
  test(`image rejected consistently ${String(url).slice(0, 60)}`, async () => {
    for (const validator of [normalizeProductImageUrl, customerImage, adminImage]) assert.throws(() => validator(url));
    assert.equal((await fixture().submit({ body: { ...content, image_url: url } })).statusCode, 400);
  });
}
test('optional image omitted and empty accepted', async () => {
  const f = fixture(); assert.equal((await f.submit({ body: { name: 'Plain', segment: 'Hardware', category: 'Tools' } })).statusCode, 201);
  assert.equal(f.submissions()[0][1].content.image_url, '');
});
test('same explicit operation handles concurrent clicks and uncertain response retry', async () => {
  const f = fixture(), results = await Promise.all(Array.from({ length: 10 }, () => f.submit()));
  assert.ok(results.every(result => [200, 201].includes(result.statusCode)));
  assert.equal(new Set(results.map(result => result.body.id)).size, 1); assert.equal(f.submissions().length, 1);
  assert.equal((await f.submit()).body.id, results[0].body.id); assert.ok(f.db.retries > 0);
});
test('idempotency key is bound to owner and immutable normalized payload', async () => {
  const f = fixture(); await f.submit();
  assert.equal((await f.submit({ body: { ...content, name: 'Changed' } })).statusCode, 409);
  assert.equal((await f.submit({ token: 'stranger' })).statusCode, 201); assert.equal(f.submissions().length, 2);
});
test('missing idempotency key rejected', async () => assert.equal((await fixture().submit({ headers: {} })).statusCode, 400));
for (const action of ['list', 'read', 'approve', 'reject']) for (const token of [null, 'invalid', 'customer']) {
  test(`${action} requires authoritative Admin: ${token}`, async () => {
    const f = fixture(), result = await invoke(f.handlers[action], { token, params: { id: 'missing' } });
    assert.equal(result.statusCode, token === 'customer' ? 403 : 401);
  });
}
test('Admin list/read exposes immutable review content including image', async () => {
  const f = fixture(), result = await f.submit();
  const list = await invoke(f.handlers.list, { token: 'admin' });
  assert.equal(list.statusCode, 200); assert.equal(list.body.submissions[0].id, result.body.id);
  const read = await invoke(f.handlers.read, { token: 'admin', params: { id: result.body.id } });
  assert.equal(read.body.content.image_url, content.image_url.trim()); assert.equal(read.body.userId, 'customer');
});
test('Admin list cursor reaches remaining records', async () => {
  const f = fixture(); for (let index = 0; index < 52; index++) f.db.seed(`product_requests/item-${String(index).padStart(3, '0')}`, { status: 'submitted' });
  const first = await invoke(f.handlers.list, { token: 'admin' });
  const second = await invoke(f.handlers.list, { token: 'admin', query: { after: first.body.next } });
  assert.equal(first.body.submissions.length, 50); assert.equal(second.body.submissions.length, 2); assert.equal(second.body.next, null);
});
test('malformed legacy content cannot break Admin review rendering', async () => {
  const f = fixture({ 'product_requests/legacy': { status: 'submitted', userId: { bad: true }, createdAt: {},
    content: { name: {}, variants: 'not-an-array' } } });
  const result = await invoke(f.handlers.list, { token: 'admin' });
  assert.equal(result.statusCode, 200); assert.equal(result.body.submissions[0].content, null);
  assert.equal(result.body.submissions[0].userId, '');
});
test('approval creates canonical visible DaaS-compatible product and review metadata once', async () => {
  const f = fixture(), created = await f.submit(), result = await f.review(created.body.id);
  assert.equal(result.statusCode, 200); assert.equal(f.products().length, 1);
  const product = f.products()[0][1], projection = projectProduct(product);
  assert.equal(projection.visibility.visible, true); assert.deepEqual(projection.identityKeys, ['sku:ABC-123']);
  assert.equal(projection.image_url, content.image_url.trim()); assert.equal(projection.price, 25);
  const row = f.db.read(`product_requests/${created.body.id}`);
  assert.equal(row.status, 'approved'); assert.equal(row.reviewedBy, 'admin'); assert.equal(row.reviewedAt, at);
  assert.equal(row.productId, result.body.productId); assert.equal((await f.review(created.body.id)).body.replayed, true);
  assert.equal((await f.submit()).body.status, 'approved'); assert.equal(f.products().length, 1);
});
test('concurrent approvals publish exactly once', async () => {
  const f = fixture(), created = await f.submit();
  const results = await Promise.all(Array.from({ length: 8 }, () => f.review(created.body.id)));
  assert.ok(results.every(result => result.statusCode === 200)); assert.equal(f.products().length, 1);
  assert.equal(new Set(results.map(result => result.body.productId)).size, 1);
});
for (const first of ['approve', 'reject']) test(`approve/reject race remains atomic (${first} first)`, async () => {
  const f = fixture(), created = await f.submit();
  const results = await Promise.all([f.review(created.body.id, first), f.review(created.body.id, first === 'approve' ? 'reject' : 'approve')]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  const row = f.db.read(`product_requests/${created.body.id}`);
  assert.equal(f.products().length, row.status === 'approved' ? 1 : 0);
  assert.equal(Boolean(row.productId), row.status === 'approved');
});
test('rejection is final, repeatable and never publishes', async () => {
  const f = fixture(), created = await f.submit();
  assert.equal((await f.review(created.body.id, 'reject')).body.status, 'rejected');
  assert.equal((await f.review(created.body.id, 'reject')).body.replayed, true);
  assert.equal((await f.review(created.body.id)).statusCode, 409); assert.equal(f.products().length, 0);
});
test('review rejects body injection', async () => {
  const f = fixture(), created = await f.submit(); assert.equal((await f.review(created.body.id, 'approve', { body: { content } })).statusCode, 400);
});
for (const existing of [{ ...content, sku: 'ABC-123', variants: [] }, { product: 'Legacy', barcode: 'abc-123' },
  { name: 'Different', variants: [{ sku: 'ABC-123' }] }]) test(`canonical conflict never overwrites ${JSON.stringify(existing).slice(0, 45)}`, async () => {
  const f = fixture({ 'products/existing': existing }), created = await f.submit();
  assert.equal((await f.review(created.body.id)).statusCode, 409);
  assert.deepEqual(f.db.read('products/existing'), existing); assert.equal(f.products().length, 1);
  assert.equal(f.db.read(`product_requests/${created.body.id}`).status, 'submitted');
});
test('fallback identity conflicts but same Brand+Name with different variants does not overwrite', async () => {
  // R3 publication now requires a real price; zero remains legitimate.
  const body = { ...content, variants: [{ size: '50g', price: 0 }] };
  const f = fixture({ 'products/existing': { ...body, segment: 'Grocery' } }), created = await f.submit({ body });
  assert.equal((await f.review(created.body.id)).statusCode, 409);
  const second = await f.submit({ headers: { 'idempotency-key': 'operation-0000000002' }, body: { ...body, variants: [{ size: '100g', price: 0 }] } });
  assert.equal((await f.review(second.body.id)).statusCode, 200); assert.equal(f.products().length, 2);
});
test('concurrent distinct submissions with overlapping SKU cannot both publish', async () => {
  const f = fixture(), a = await f.submit(), b = await f.submit({ headers: { 'idempotency-key': 'operation-0000000002' } });
  const results = await Promise.all([f.review(a.body.id), f.review(b.body.id)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]); assert.equal(f.products().length, 1);
});
test('server-only identity claims fail closed after a catalog deletion', async () => {
  const f = fixture(), a = await f.submit(); await f.review(a.body.id); f.db.remove(f.products()[0][0]);
  const b = await f.submit({ headers: { 'idempotency-key': 'operation-0000000002' } });
  assert.equal((await f.review(b.body.id)).statusCode, 409);
});
test('legacy/client-forged record cannot be approved without server operation provenance', async () => {
  const f = fixture({ 'product_requests/legacy': { version: 1, status: 'submitted', userId: 'customer', content,
    operationId: 'a'.repeat(64) } });
  assert.equal((await f.review('legacy')).statusCode, 409); assert.equal(f.products().length, 0);
});
test('tampered stored content fails digest check', async () => {
  const f = fixture(), created = await f.submit(), path = `product_requests/${created.body.id}`, row = f.db.read(path);
  f.db.seed(path, { ...row, content: { ...row.content, name: 'Tampered' } });
  assert.equal((await f.review(created.body.id)).statusCode, 409);
});
test('Admin role revoked during approval prevents publication', async () => {
  const f = fixture(), created = await f.submit();
  f.db.beforeCommit = () => { f.db.beforeCommit = null; f.db.seed('users/admin', { role: 'Developer' }); };
  assert.equal((await f.review(created.body.id)).statusCode, 403); assert.equal(f.products().length, 0);
});
test('deleting owner cannot be approved but can be rejected', async () => {
  const f = fixture(), created = await f.submit(); f.db.seed('users/customer', { accountState: 'deleting' });
  assert.equal((await f.review(created.body.id)).statusCode, 403);
  assert.equal((await f.review(created.body.id, 'reject')).statusCode, 200);
});
for (const target of ['products/', 'product_requests/', 'product_submission_identity/']) test(`failed atomic write ${target} leaves no publication`, async () => {
  const f = fixture(), created = await f.submit(); f.db.failWrite = target;
  assert.equal((await f.review(created.body.id)).statusCode, 503); assert.equal(f.products().length, 0);
  assert.equal(f.db.read(`product_requests/${created.body.id}`).status, 'submitted');
});
test('failed submit commit may be retried with same operation', async () => {
  const f = fixture(); f.db.failCommit = true; assert.equal((await f.submit()).statusCode, 503);
  assert.equal(f.submissions().length, 0); f.db.failCommit = false; assert.equal((await f.submit()).statusCode, 201);
});
