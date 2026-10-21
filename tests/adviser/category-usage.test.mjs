import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCategoryUsageHandler } from '../../services/category-usage.js';

const product = (id, segment, category, extra = {}) => ({ id, data: { name: id, segment, category, status: 'Active', ...extra } });
const products = [product('rice', 'Grocery', 'Rice'), product('oil', 'Grocery', 'Cooking Oil'), product('nail', 'Hardware', 'Fasteners')];
const keys = [
  { status: 'active', userId: 'a', linkedProductIds: ['rice', 'oil'], name: 'secret-name' },
  { status: 'active', userId: 'b', linkedVariantSelections: { rice: ['v1'] } },
  { status: 'active', userId: 'gone', linkedProductIds: ['nail'] },
  { status: 'revoked', userId: 'c', linkedProductIds: ['nail'] },
];
const users = { viewer: { role: 'Developer' }, admin: { role: 'admin' }, a: { role: 'developer' }, b: { role: 'business' },
  gone: { role: 'developer', disabled: true }, blocked: { role: 'developer', deleted: true } };
function fakeDb(reads) {
  const snap = rows => ({ docs: rows.map(row => ({ id: row.id, data: () => row.data })) });
  return { collection: name => ({
    get: async () => { reads.push(name); return snap(products); },
    where: (field, op, value) => ({ get: async () => { reads.push(name); return snap(keys.filter(key => key[field] === value).map(data => ({ data }))); } }),
    doc: id => ({ get: async () => ({ data: () => users[id] }) }),
  }) };
}
async function call(token, { reads = [], now } = {}) {
  const handler = createCategoryUsageHandler({ getDb: () => fakeDb(reads), now,
    verifyIdToken: async value => { if (!users[value]) throw new Error('bad'); return { uid: value }; } });
  const res = { headers: {}, set(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ headers: token ? { authorization: 'Bearer ' + token } : {} }, res);
  return res;
}

test('returns per-segment category usage from active keys of active customers only', async () => {
  const res = await call('viewer');
  assert.equal(res.code, undefined); assert.equal(res.body.success, true);
  assert.deepEqual(res.body.segments.All, [{ name: 'Rice', users: 2, products: 2 }, { name: 'Cooking Oil', users: 1, products: 1 }]);
  assert.deepEqual(res.body.segments.Hardware, []);
  assert.doesNotMatch(JSON.stringify(res.body), /secret-name|"a"|"b"|rice"/);
});
test('admin can read it too', async () => assert.equal((await call('admin')).body.success, true));
test('signed-out, invalid and blocked accounts are refused', async () => {
  assert.equal((await call(null)).code, 401);
  assert.equal((await call('nobody')).code, 401);
  assert.equal((await call('blocked')).code, 403);
});
test('aggregate is cached for a minute per handler', async () => {
  let clock = 0; const reads = [];
  const handler = createCategoryUsageHandler({ getDb: () => fakeDb(reads), now: () => clock,
    verifyIdToken: async value => ({ uid: value }) });
  const res = () => ({ set() {}, status() { return this; }, json(body) { this.body = body; return this; } });
  await handler({ headers: { authorization: 'Bearer viewer' } }, res());
  clock = 30000; await handler({ headers: { authorization: 'Bearer viewer' } }, res());
  assert.equal(reads.length, 2);
  clock = 61000; await handler({ headers: { authorization: 'Bearer viewer' } }, res());
  assert.equal(reads.length, 4);
});
