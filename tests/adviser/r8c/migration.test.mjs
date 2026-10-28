import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backfillCatalogReservations, inspectFrozenCatalog } from '../../../services/catalog-writer.js';
import { auditCatalog } from '../../../services/catalog-audit.js';
import { identityId } from '../../../services/catalog-contract.js';
import { productIdentityKeys } from '../../../services/product-contract.js';
import { memoryStore } from '../r2a/memory-store.mjs';
// Catalog reservation backfill (services/catalog-writer.js).

const at = '2026-09-22T00:00:00Z';
const controlPath = 'catalog_control/writer';
const product = i => ({ name: 'Synthetic ' + i, category: 'Test', segment: 'Grocery', sku: 'R8C-' + i, price: i });
function batchFixture(count) {
  return memoryStore({ [controlPath]: { frozen: true, revision: 0, operatorNote: 'preserve' },
    ...Object.fromEntries(Array.from({ length: count }, (_, i) => ['products/p' + i, product(i)])) }, { queryConflicts: false });
}
const records = db => Object.entries(db.dump()).filter(([key]) => key.startsWith('products/')).map(([key, data]) => ({ id: key.split('/')[1], data }));
const claims = db => Object.entries(db.dump()).filter(([key]) => key.startsWith('product_submission_identity/')).map(([key, data]) => ({ id: key.split('/')[1], data }));
const claimPath = i => 'product_submission_identity/' + identityId('sku:R8C-' + i);
for (const count of [401, 1634]) test(count + ' missing claims finish in missing-only batches <=400', async () => {
  const db = batchFixture(count), products = records(db), results = []; let remaining = count;
  const sorted = auditCatalog(products).reservations.map(row => row.id).sort();
  do {
    const prior = claims(db), expected = Math.min(400, remaining);
    const progress = await backfillCatalogReservations(db, at);
    assert.equal(progress.created, expected); assert.equal(progress.attempted, expected); assert.equal(progress.conflicts, 0);
    assert.equal(progress.alreadyValid, count - remaining); assert.equal(progress.remaining, remaining - expected);
    remaining = progress.remaining; results.push(progress.created);
    for (const row of prior) assert.deepEqual(db.read('product_submission_identity/' + row.id), row.data);
    assert.deepEqual(claims(db).map(row => row.id).sort(), sorted.slice(0, count - remaining));
    assert.equal(db.read(controlPath).frozen, true); assert.equal(db.read(controlPath).operatorNote, 'preserve');
    assert.equal(db.read(controlPath).auditCompletedAt, remaining ? undefined : at);
  } while (remaining);
  assert.deepEqual(results, count === 401 ? [400, 1] : [400, 400, 400, 400, 34]);
  assert.deepEqual(records(db), products);
  const final = auditCatalog(records(db), claims(db)); assert.equal(final.ok, true);
  const present = new Set(claims(db).map(row => row.id));
  assert.equal(final.reservations.filter(row => !present.has(row.id)).length, 0);
  const snapshot = db.dump(), commits = db.commits;
  assert.deepEqual(await backfillCatalogReservations(db, '2026-09-23T00:00:00Z'),
    { attempted: 0, created: 0, alreadyValid: count, conflicts: 0, remaining: 0, frozen: true });
  assert.deepEqual(db.dump(), snapshot); assert.equal(db.commits, commits);
});
test('existing valid metadata and unrelated retired/deleted claims preserved', async () => {
  const db = batchFixture(3), existing = { identity: 'sku:R8C-0', productId: 'p0', state: 'bound', version: 1, updatedAt: 'old', extra: { preserve: true } };
  db.seed(claimPath(0), existing);
  for (const state of ['retired', 'deleted']) db.seed('product_submission_identity/' + identityId('sku:' + state.toUpperCase()),
    { identity: 'sku:' + state.toUpperCase(), productId: 'historical', state, extra: 42 });
  const previous = claims(db);
  const result = await backfillCatalogReservations(db, at); assert.equal(result.created, 2); assert.equal(result.alreadyValid, 1);
  for (const row of previous) assert.deepEqual(db.read('product_submission_identity/' + row.id), row.data);
});
for (const frozen of [false, 'true', 1, undefined]) test('backfill rejects non-boolean freeze ' + frozen, async () => {
  const db = batchFixture(2); db.seed(controlPath, { frozen }); const before = db.dump();
  await assert.rejects(backfillCatalogReservations(db, at), /freeze/); assert.deepEqual(db.dump(), before);
});
test('backfill missing control rejected', async () => {
  const db = batchFixture(1); db.remove(controlPath); await assert.rejects(backfillCatalogReservations(db, at), /freeze/);
});
for (const patch of [{ productId: 'other' }, { identity: 'sku:OTHER' }, { state: 'retired' }, { state: 'deleted' }, { identity: undefined }]) {
  test('conflicting required existing claim fails closed ' + JSON.stringify(patch), async () => {
    const db = batchFixture(2); db.seed(claimPath(0), { identity: 'sku:R8C-0', productId: 'p0', state: 'bound', ...patch }); const before = db.dump();
    await assert.rejects(backfillCatalogReservations(db, at)); assert.deepEqual(db.dump(), before);
  });
}
test('canonical collision and forced hash collision fail before any write', async () => {
  for (const canonical of [true, false]) {
    const db = batchFixture(2); if (canonical) db.seed('products/p1', product(0)); const before = db.dump();
    await assert.rejects(backfillCatalogReservations(db, at, canonical ? {} : { deriveReservationId: () => 'same-id' }));
    assert.deepEqual(db.dump(), before);
  }
});
test('failed atomic batch has no partial claims or completion', async () => {
  for (const path of ['product_submission_identity/', 'catalog_control/']) {
    const db = batchFixture(401); db.failWrite = path; const before = db.dump();
    await assert.rejects(backfillCatalogReservations(db, at)); assert.deepEqual(db.dump(), before);
  }
});
test('concurrent batches serialize, preserve claims, and stay within cap', async () => {
  const db = batchFixture(801);
  const result = await Promise.all([backfillCatalogReservations(db, at), backfillCatalogReservations(db, at)]);
  assert.equal(result.reduce((sum, row) => sum + row.created, 0), 800);
  assert.ok(result.every(row => row.created <= 400)); assert.equal(claims(db).length, 800); assert.ok(db.retries > 0);
  assert.equal((await backfillCatalogReservations(db, at)).created, 1);
  assert.equal(auditCatalog(records(db), claims(db)).ok, true);
});
test('backfill postcheck failure is uncertain; restart audits committed state', async () => {
  const db = batchFixture(401), run = db.runTransaction; let calls = 0;
  db.runTransaction = async callback => { const result = await run(callback); if (++calls === 1) db.seed(controlPath, { ...db.read(controlPath), frozen: false }); return result; };
  await assert.rejects(backfillCatalogReservations(db, at), /freeze/); assert.equal(claims(db).length, 400);
  const prior = claims(db); db.seed(controlPath, { ...db.read(controlPath), frozen: true }); db.runTransaction = run;
  const result = await backfillCatalogReservations(db, at); assert.equal(result.created, 1); assert.equal(result.remaining, 0);
  for (const row of prior) assert.deepEqual(db.read('product_submission_identity/' + row.id), row.data);
});
test('late claim loss detected by independent postcheck', async () => {
  const db = batchFixture(2), run = db.runTransaction; let calls = 0;
  db.runTransaction = async callback => { const result = await run(callback); if (++calls === 1) db.remove(claimPath(0)); return result; };
  await assert.rejects(backfillCatalogReservations(db, at), /readback mismatch/);
});
test('empty catalog completion and repeated no-op remain frozen', async () => {
  const db = batchFixture(0); assert.equal((await backfillCatalogReservations(db, at)).remaining, 0);
  const before = db.dump(); await backfillCatalogReservations(db, at); assert.deepEqual(db.dump(), before);
});
test('read-only progress independently counts missing claims', async () => {
  const db = batchFixture(401); await backfillCatalogReservations(db, at);
  const state = await db.runTransaction(tx => inspectFrozenCatalog(tx, db));
  assert.equal(state.missing.length, 1); assert.equal(state.alreadyValid, 400); assert.equal(state.required, 401);
});
