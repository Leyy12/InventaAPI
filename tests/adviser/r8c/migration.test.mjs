import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPAIR_IDS, comparable, fingerprint, planSixRepairs, repairFrozenProducts } from '../../../scripts/frozen-catalog-repair.mjs';
import { parseMigrationArguments, verifiedRepairSource } from '../../../scripts/migrate-frozen-catalog.mjs';
import { validateCredential } from '../../../scripts/frozen-catalog-export.mjs';
import { backfillCatalogReservations, inspectFrozenCatalog } from '../../../services/catalog-writer.js';
import { auditCatalog } from '../../../services/catalog-audit.js';
import { identityId } from '../../../services/catalog-contract.js';
import { productIdentityKeys } from '../../../services/product-contract.js';
import { memoryFirestore } from '../r2a/memory-firestore.mjs';

const at = '2026-09-22T00:00:00Z';
const controlPath = 'catalog_control/writer';
function six() {
  const data = [
    { name: 'x-o', category: 'Grocery', sku: 'AUTO-1787328885272', price: 0 },
    { name: 'stick-o', category: 'Grocery', sku: 'AUTO-1787373264031', price: 0 },
    ...[['Mefenamic Acid', 'DOLFENAL', 6.5, 6.5, 'Tablet'], ['Paracetamol', 'Biogesic', 4, 4, 'Tablet'],
      ['Metformin HCl', 'GLUCOPHAGE', 16.5, 18.5, 'Tablet'], ['Carbocisteine', 'SOLMUX', 11, 12.5, 'Capsule']]
      .map(([name, brand, first, second, size]) => ({ name, brand, category: 'Synthetic category', segment: 'Pharmacy',
        variants: [first, second].map(price => ({ flavor: '500mg', size, price })) })),
  ];
  return data.map((row, i) => ({ id: REPAIR_IDS[i], data: { ...row, description: 'synthetic untouched',
    image_url: '', is_active: false, status: 'Archived', inventory: { count: 37 },
    createdAt: 'synthetic bookkeeping string' } }));
}
const entries = rows => Object.fromEntries(rows.map(row => ['products/' + row.id, row.data]));
function repairFixture() {
  const baseline = six(), db = memoryFirestore({ ...entries(baseline), [controlPath]: { frozen: true, revision: 7 } });
  const saved = {};
  const evidence = { before: async value => { saved.before = structuredClone(value); }, after: async value => { saved.after = structuredClone(value); } };
  return { baseline, db, evidence, saved };
}
const product = i => ({ name: 'Synthetic ' + i, category: 'Test', segment: 'Grocery', sku: 'R8C-' + i, price: i });
function batchFixture(count) {
  return memoryFirestore({ [controlPath]: { frozen: true, revision: 0, operatorNote: 'preserve' },
    ...Object.fromEntries(Array.from({ length: count }, (_, i) => ['products/p' + i, product(i)])) }, { queryConflicts: false });
}
const records = db => Object.entries(db.dump()).filter(([key]) => key.startsWith('products/')).map(([key, data]) => ({ id: key.split('/')[1], data }));
const claims = db => Object.entries(db.dump()).filter(([key]) => key.startsWith('product_submission_identity/')).map(([key, data]) => ({ id: key.split('/')[1], data }));
const claimPath = i => 'product_submission_identity/' + identityId('sku:R8C-' + i);
function args(overrides = {}) {
  return Object.entries({ operation: 'repair', project: 'inventaapi-db', 'confirm-project': 'inventaapi-db',
    database: '(default)', 'confirm-database': '(default)', credentials: 'C:/synthetic/credential.json',
    'evidence-dir': 'C:/synthetic/evidence', 'source-export': 'C:/synthetic/export.json', ...overrides }).flatMap(([key, value]) => ['--' + key, value]);
}
for (const [key, value] of [['project', 'other-project'], ['confirm-project', 'other-project'], ['database', 'named-db'],
  ['confirm-database', 'named-db'], ['operation', 'edit'], ['credentials', 'relative.json'], ['evidence-dir', 'relative'], ['source-export', 'relative.json']]) {
  test('CLI rejects invalid ' + key, () => assert.throws(() => parseMigrationArguments(args({ [key]: value }))));
}
test('CLI requires every explicit confirmation and rejects arbitrary edits/IDs/cap overrides', () => {
  for (const key of ['project', 'confirm-project', 'database', 'confirm-database', 'credentials', 'evidence-dir', 'source-export']) {
    const input = args(), index = input.indexOf('--' + key); input.splice(index, 2);
    assert.throws(() => parseMigrationArguments(input));
  }
  for (const key of ['id', 'field', 'value', 'limit']) assert.throws(() => parseMigrationArguments([...args(), '--' + key, '500']));
  assert.throws(() => parseMigrationArguments([...args(), '--project', 'inventaapi-db']));
  assert.equal(parseMigrationArguments(args()).operation, 'repair');
  const batchArgs = args({ operation: 'backfill' }); batchArgs.splice(batchArgs.indexOf('--source-export'), 2);
  assert.equal(parseMigrationArguments(batchArgs).operation, 'backfill');
});
test('credential metadata mismatch rejected without SDK', () => {
  const fake = { type: 'service_account', project_id: 'inventaapi-db', client_email: 'synthetic@inventaapi-db.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY----- synthetic, not a key' };
  assert.equal(validateCredential(fake, 'inventaapi-db').project_id, 'inventaapi-db');
  for (const patch of [{ project_id: 'other-project' }, { type: 'authorized_user' }, { client_email: 'synthetic@other-project.iam.gserviceaccount.com' }]) {
    assert.throws(() => validateCredential({ ...fake, ...patch }, 'inventaapi-db'));
  }
});
test('unreviewed or tampered export cannot become repair authority', () => {
  assert.throws(() => verifiedRepairSource(JSON.stringify({ products: six() })), /HASH MISMATCH/);
});
test('tests cannot reach SDK, network, credentials or files', async () => {
  assert.throws(() => fetch('https://example.invalid'), /BLOCKED/);
  await assert.rejects(import('firebase-admin/app'), /BLOCKED/);
  await assert.rejects(import('node:https'), /BLOCKED/);
  const fs = await import('node:fs/promises');
  assert.throws(() => fs.readFile('C:/synthetic/not-read.json'), /BLOCKED/);
});
test('timestamps compare losslessly across export and Admin SDK representations', () => {
  const sdk = { seconds: 0, nanoseconds: 123456789, toDate() { return new Date(123); } };
  assert.equal(fingerprint({ t: sdk }), fingerprint({ t: { $firestoreType: 'timestamp', value: '1970-01-01T00:00:00.123456789Z' } }));
  assert.notEqual(fingerprint({ t: sdk }), fingerprint({ t: { $firestoreType: 'timestamp', value: '1970-01-01T00:00:00.123456788Z' } }));
  assert.equal(fingerprint({ t: { $firestoreType: 'timestamp', value: '1970-01-01T00:00:00.123Z' } }),
    fingerprint({ t: { seconds: 0, nanoseconds: 123000000, toDate() {} } }));
  assert.equal(comparable(sdk).value, '1970-01-01T00:00:00.123456789Z');
  const tag = { $firestoreType: 'timestamp', value: '1970-01-01T00:00:00.123456789Z' };
  assert.notEqual(fingerprint({ t: tag }, false), fingerprint({ t: tag })); // Real map must not impersonate a Timestamp.
  assert.notEqual(fingerprint({ t: { ...tag, extra: 1 } }), fingerprint({ t: tag }));
});
test('repair accepts SDK timestamps and rejects a map masquerading as timestamp', async () => {
  for (const masquerade of [false, true]) {
    const f = repairFixture();
    for (const row of f.baseline) row.data.createdAt = { $firestoreType: 'timestamp', value: '1970-01-01T00:00:00.123456789Z' };
    const run = f.db.runTransaction;
    f.db.runTransaction = callback => run(tx => callback({ ...tx, get: async ref => {
      const snapshot = await tx.get(ref);
      if (!ref.path?.startsWith('products/')) return snapshot;
      return { ...snapshot, data: () => ({ ...snapshot.data(), createdAt: masquerade
        ? { $firestoreType: 'timestamp', value: '1970-01-01T00:00:00.123456789Z' }
        : { seconds: 0, nanoseconds: 123456789, toDate() { return new Date(123); } } }) };
    } }));
    if (masquerade) { await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence)); assert.equal(f.db.commits, 0); }
    else assert.equal((await repairFrozenProducts(f.db, f.baseline, f.evidence)).changed, 6);
  }
});
test('repair allowlist rejects wrong, duplicate or missing document ID', () => {
  for (const change of [rows => { rows[0].id = 'other'; }, rows => { rows[0].id = rows[1].id; }, rows => rows.pop()]) {
    const rows = six(); change(rows); assert.throws(() => planSixRepairs(rows));
  }
});
for (const frozen of [false, 'true', 1, undefined]) test('repair rejects non-boolean freeze ' + frozen, async () => {
  const f = repairFixture(); f.db.seed(controlPath, { frozen }); const before = f.db.dump();
  await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence), /FREEZE/);
  assert.deepEqual(f.db.dump(), before); assert.equal(f.saved.before, undefined);
});
test('repair rejects missing control', async () => {
  const f = repairFixture(); f.db.remove(controlPath);
  await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence), /FREEZE/);
});
for (const [name, change] of [
  ['unexpected segment', row => { row.data.segment = 'Hardware'; }],
  ['unrelated field drift', row => { row.data.description = 'changed'; }],
  ['variant price drift', row => { row.data.variants[1].price = 999; }],
  ['extra variant field', row => { row.data.variants[0].unit = 'box'; }],
]) test('whole repair aborts on ' + name, async () => {
  const f = repairFixture(), row = structuredClone(f.baseline[name.includes('variant') ? 4 : 0]);
  change(row); f.db.seed('products/' + row.id, row.data); const before = f.db.dump();
  await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence));
  assert.deepEqual(f.db.dump(), before); assert.equal(f.db.commits, 0);
});
test('missing product and partially repaired state fail closed', async () => {
  for (const missing of [true, false]) {
    const f = repairFixture();
    if (missing) f.db.remove('products/' + REPAIR_IDS[0]);
    else f.db.seed('products/' + REPAIR_IDS[0], { ...f.baseline[0].data, segment: 'Grocery' });
    const before = f.db.dump(); await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence));
    assert.deepEqual(f.db.dump(), before);
  }
});
test('all six corrected synthetic records pass unchanged R3 audit', async () => {
  const f = repairFixture(); assert.equal(auditCatalog(f.baseline).problems.length, 6);
  assert.deepEqual(await repairFrozenProducts(f.db, f.baseline, f.evidence), { changed: 6, verified: 6, frozen: true });
  const after = records(f.db), audit = auditCatalog(after);
  assert.equal(audit.ok, true); assert.deepEqual(audit.problems, []); assert.deepEqual(audit.collisions, []);
  assert.equal(f.db.commits, 1); assert.equal(f.saved.before.snapshots.length, 6); assert.equal(f.saved.after.snapshots.length, 6);
  for (let i = 0; i < 6; i++) {
    const actual = f.db.read('products/' + REPAIR_IDS[i]), original = f.baseline[i].data;
    const field = i < 2 ? 'segment' : 'variants';
    assert.deepEqual(Object.fromEntries(Object.entries(actual).filter(([key]) => key !== field)),
      Object.fromEntries(Object.entries(original).filter(([key]) => key !== field)));
  }
  assert.deepEqual(f.db.read(controlPath), { frozen: true, revision: 7 });
});
for (const [index, name, expected] of [[0, 'x-o Grocery', 'Grocery'], [1, 'stick-o Grocery', 'Grocery'],
  [2, 'Dolfenal duplicate collapse', 6.5], [3, 'Biogesic duplicate collapse', 4],
  [4, 'GLUCOPHAGE keeps 16.5 and removes 18.5', 16.5], [5, 'SOLMUX keeps 11 and removes 12.5', 11]]) {
  test(name, async () => {
    const f = repairFixture(); await repairFrozenProducts(f.db, f.baseline, f.evidence);
    const data = f.db.read('products/' + REPAIR_IDS[index]);
    if (index < 2) assert.equal(data.segment, expected);
    else { assert.equal(data.variants.length, 1); assert.equal(data.variants[0].price, expected); assert.deepEqual(data.variants[0], f.baseline[index].data.variants[0]); }
    assert.equal(auditCatalog([{ id: REPAIR_IDS[index], data }]).ok, true);
  });
}
test('repair evidence must be durable before mutation', async () => {
  const f = repairFixture(), before = f.db.dump();
  await assert.rejects(repairFrozenProducts(f.db, f.baseline, { before: async () => { throw Error('disk failure'); }, after: f.evidence.after }));
  assert.deepEqual(f.db.dump(), before);
});
test('repair transaction failure cannot publish a partial repair', async () => {
  const f = repairFixture(); f.db.failWrite = 'products/' + REPAIR_IDS[3]; const before = f.db.dump();
  await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence));
  assert.deepEqual(f.db.dump(), before); assert.ok(f.saved.before); assert.equal(f.saved.after, undefined);
});
test('repair catches drift between before evidence and commit', async () => {
  const f = repairFixture(); f.evidence.before = async () => { f.db.seed('products/' + REPAIR_IDS[5], { ...f.baseline[5].data, unexpected: true }); };
  await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence)); assert.equal(f.db.commits, 0);
});
test('repair rechecks freeze after commit and does not claim uncertain success', async () => {
  const f = repairFixture(), run = f.db.runTransaction; let calls = 0;
  f.db.runTransaction = async callback => { const result = await run(callback); if (++calls === 2) f.db.seed(controlPath, { frozen: false }); return result; };
  await assert.rejects(repairFrozenProducts(f.db, f.baseline, f.evidence), /FREEZE/);
  assert.equal(f.saved.after, undefined); assert.equal(f.db.commits, 1);
});
test('fully repaired retry verifies all six and makes no additional writes', async () => {
  const f = repairFixture(); await repairFrozenProducts(f.db, f.baseline, f.evidence); const before = f.db.dump();
  assert.deepEqual(await repairFrozenProducts(f.db, f.baseline, f.evidence), { changed: 0, verified: 6, frozen: true });
  assert.deepEqual(f.db.dump(), before); assert.equal(f.db.commits, 1);
});
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
