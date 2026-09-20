import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogHandlers } from '../../../services/catalog-management.js';
import { createProductSubmissionHandlers } from '../../../services/product-submissions.js';
import { identityId, validateCatalogProduct } from '../../../services/catalog-contract.js';
import { productIdentityKeys } from '../../../services/product-contract.js';
import { previewCatalogImport } from '../../../services/catalog-import.js';
import { auditCatalog } from '../../../services/catalog-audit.js';
import { assertBackfillReservationPlan, backfillCatalogReservations, prepareCatalogWrite } from '../../../services/catalog-writer.js';
import { memoryFirestore, invoke } from '../r2a/memory-firestore.mjs';

const product = { name: 'Coke', brand: 'Coca-Cola', category: 'Drinks', segment: 'Grocery',
  image_url: 'https://example.invalid/a.jpg', variants: [{ size: '330ml', sku: 'CAN-330', price: 0 }] };
const matrix = (sku = 'CAN-330', name = 'Coke') => [['name', 'brand', 'category', 'segment', 'size', 'sku', 'price'],
  [name, 'Coca-Cola', 'Drinks', 'Grocery', '330ml', sku, '0']];
function fixture(extra = {}, deriveReservationId) {
  // Query phantom detection deliberately disabled. Claims/fence must provide safety.
  const db = memoryFirestore({ 'users/admin': { role: 'Admin' }, 'users/other-admin': { role: 'Admin' },
    'users/customer': { role: 'Developer', plan: 'Free' }, ...extra }, { queryConflicts: false });
  let serial = 0, time = new Date('2026-09-20T12:00:00Z');
  const checked = [];
  const dependencies = { getDb: () => db, now: () => time, makeId: () => 'r3-' + (++serial), deriveReservationId,
    verifyIdToken: async (token, revoked) => { checked.push([token, revoked]); if (token === 'invalid') throw Error('Bad token'); return { uid: token }; } };
  const handlers = createCatalogHandlers(dependencies), submissions = createProductSubmissionHandlers(dependencies);
  const call = (name, body, params = {}, token = 'admin') => invoke(handlers[name], { body, params, token });
  const create = (value = product) => call('create', { product: value });
  const preview = (rows = matrix()) => call('preview', { rows });
  const commit = (previewId, rows = [2], acknowledgePossible = false) => call('commit', { previewId, rows, acknowledgePossible });
  const submit = async () => {
    const result = await invoke(submissions.submit, { token: 'customer', body: product, headers: { 'idempotency-key': 'r3-test-submission-0001' } });
    assert.equal(result.statusCode, 201); return result.body.id;
  };
  const approve = id => invoke(submissions.approve, { token: 'admin', params: { id } });
  const products = () => Object.entries(db.dump()).filter(([path]) => path.startsWith('products/')).map(([path, data]) => ({ id: path.split('/')[1], data }));
  return { db, call, create, preview, commit, submit, approve, products, checked, advance: ms => { time = new Date(time.getTime() + ms); } };
}

for (const actor of [null, 'invalid', 'customer', 'unknown']) for (const action of ['create', 'edit', 'archive', 'restore', 'delete', 'preview', 'commit']) {
  test(`${action} denies ${actor ?? 'anonymous'}`, async () => {
    const f = fixture();
    const body = action === 'create' ? { product } : action === 'preview' ? { rows: matrix() } : action === 'commit'
      ? { previewId: 'test', rows: [2] } : action === 'edit' ? { product, expectedRevision: 0 } : { expectedRevision: 0 };
    const response = await f.call(action, body, { id: 'existing' }, actor);
    assert.equal(response.statusCode, actor === null || actor === 'invalid' ? 401 : 403);
    assert.equal(f.products().length, 0);
  });
}
test('Admin create verifies revocation, normalizes segment and binds canonical identity', async () => {
  const f = fixture(), result = await f.create({ ...product, segment: 'groceries' });
  assert.equal(result.statusCode, 200); assert.equal(result.body.product.segment, 'Grocery');
  assert.deepEqual(f.checked, [['admin', true]]);
  for (const key of productIdentityKeys(product)) assert.equal(f.db.read('product_submission_identity/' + identityId(key)).productId, result.body.product.id);
  assert.equal((await f.create()).statusCode, 409); assert.equal(f.products().length, 1);
});
test('Brand+Name same/different variant returns warning without merging', async () => {
  const f = fixture(), a = await f.create();
  const b = await f.create({ ...product, brand: ' COCA-COLA ', name: ' coke ', variants: [{ size: '1.5L', sku: 'BOTTLE-15', price: 50 }] });
  assert.equal(b.statusCode, 200); assert.deepEqual(b.body.possibleDuplicates, [a.body.product.id]);
  assert.equal(f.products().length, 2); assert.deepEqual(f.products()[0].data.variants, product.variants);
});
for (const [name, change] of Object.entries({ segment: { segment: 'Other' }, category: { category: '' }, name: { name: '' },
  priceMissing: { variants: [{ size: '330ml' }] }, priceEmpty: { variants: [{ price: '' }] },
  priceMalformed: { variants: [{ price: '10abc' }] }, priceNegative: { variants: [{ price: -1 }] },
  priceNaN: { variants: [{ price: NaN }] }, priceInfinite: { variants: [{ price: Infinity }] },
  image: { image_url: 'javascript:alert(1)' }, credentials: { image_url: 'https://u:p@example.invalid/a' },
  unsupported: { role: 'Admin' }, duplicateVariants: { variants: [product.variants[0], product.variants[0]] } })) {
  test('invalid create ' + name, async () => { const f = fixture(); assert.equal((await f.create({ ...product, ...change })).statusCode, 400); assert.equal(f.products().length, 0); });
}
test('edit preserves arbitrary variant payload and siblings, and rejects stale revision', async () => {
  const f = fixture();
  const variants = [{ ...product.variants[0], custom: { active: true, bins: ['a', 'b'] } }, { price: '50', sku: 'BOTTLE-15', size: '1.5L', anyField: 42 }];
  const created = await f.create({ ...product, variants }); assert.equal(created.statusCode, 200);
  const id = created.body.product.id;
  const edited = await f.call('edit', { product: { description: 'Updated' }, expectedRevision: 1 }, { id });
  assert.equal(edited.statusCode, 200); assert.deepEqual(edited.body.product.variants, variants);
  assert.equal((await f.call('edit', { product: { name: 'Stale' }, expectedRevision: 1 }, { id })).statusCode, 409);
});
test('identity edit reserves new keys and retires old keys atomically; collision leaves old state', async () => {
  const f = fixture(), created = await f.create(), id = created.body.product.id;
  const edited = await f.call('edit', { product: { variants: [{ size: '330ml', sku: 'NEW-SKU', price: 5 }] }, expectedRevision: 1 }, { id });
  assert.equal(edited.statusCode, 200);
  assert.equal(f.db.read('product_submission_identity/' + identityId('sku:CAN-330')).state, 'retired');
  assert.equal(f.db.read('product_submission_identity/' + identityId('sku:NEW-SKU')).state, 'bound');
  assert.equal((await f.create()).statusCode, 409);
  const other = await f.create({ ...product, variants: [{ sku: 'OTHER', price: 0 }] });
  assert.equal((await f.call('edit', { product: { variants: [{ sku: 'NEW-SKU', price: 3 }] }, expectedRevision: 1 }, { id: other.body.product.id })).statusCode, 409);
  assert.equal(f.db.read('products/' + other.body.product.id).variants[0].sku, 'OTHER');
});
for (const action of ['archive', 'restore', 'delete']) test(`${action} uses writer and retains reservation`, async () => {
  const f = fixture(), created = await f.create(), id = created.body.product.id;
  assert.equal((await f.call(action, { expectedRevision: 1 }, { id })).statusCode, 200);
  assert.equal((await f.create()).statusCode, 409);
  const binding = f.db.read('product_submission_identity/' + identityId('sku:CAN-330'));
  assert.equal(binding.state, action === 'delete' ? 'deleted' : 'bound');
  assert.equal(f.products().length, action === 'delete' ? 0 : 1);
});
for (const failure of ['products/', 'product_submission_identity/', 'catalog_control/']) test(`writer atomic failure ${failure}`, async () => {
  const f = fixture(); f.db.failWrite = failure;
  assert.equal((await f.create()).statusCode, 503); assert.equal(f.products().length, 0);
  assert.equal(Object.keys(f.db.dump()).some(key => key.startsWith('product_submission_identity/')), false);
});
test('Admin role revocation in a transaction retry denies writes', async () => {
  const f = fixture(); f.db.beforeCommit = () => { f.db.beforeCommit = null; f.db.seed('users/admin', { role: 'Developer' }); };
  assert.equal((await f.create()).statusCode, 403); assert.equal(f.products().length, 0);
});
for (const pair of [['admin', 'admin'], ['admin', 'import'], ['import', 'import'], ['approval', 'admin'], ['approval', 'import'], ['approval', 'approval']]) {
  test(`race ${pair.join(' vs ')}: one binding without query phantom protection`, async () => {
    const f = fixture(), submission = await f.submit();
    const previews = [(await f.preview()).body.previewId, (await f.preview()).body.previewId];
    let index = 0;
    const operation = kind => kind === 'admin' ? f.create() : kind === 'approval' ? f.approve(submission) : f.commit(previews[index++]);
    const responses = await Promise.all(pair.map(operation));
    assert.equal(f.products().length, 1);
    assert.equal(f.products().filter(record => productIdentityKeys(record.data).includes('sku:CAN-330')).length, 1);
    assert.ok(responses.some(response => response.statusCode === 200));
    const row = f.db.read('product_requests/' + submission);
    if (row.status === 'approved') assert.equal(f.db.read('products/' + row.productId).name, product.name);
    if (pair.includes('approval') && f.products()[0].id !== 'submission_' + submission) assert.equal(row.status, 'submitted');
  });
}
test('Admin edit vs importer reserves the changed identity once', async () => {
  const f = fixture(), existing = await f.create({ ...product, variants: [{ sku: 'OLD', price: 1 }] });
  const plan = await f.preview();
  await Promise.all([f.call('edit', { product: { variants: product.variants }, expectedRevision: 1 }, { id: existing.body.product.id }),
    f.commit(plan.body.previewId, [2], true)]);
  assert.equal(f.products().filter(record => productIdentityKeys(record.data).includes('sku:CAN-330')).length, 1);
});
test('failed approval never marks request approved when Admin already published identity', async () => {
  const f = fixture(), id = await f.submit(); await f.create();
  assert.equal((await f.approve(id)).statusCode, 409);
  assert.equal(f.db.read('product_requests/' + id).status, 'submitted');
});
test('preview performs no catalog mutation; invalid/conflicting rows never write; receipts recover retries', async () => {
  const f = fixture(), rows = matrix(); rows.push(['Invalid', '', 'Food', 'Bogus', '', '', '-1']);
  const plan = await f.preview(rows); assert.equal(plan.statusCode, 200); assert.equal(f.products().length, 0);
  const first = await f.commit(plan.body.previewId, [2, 3]);
  assert.deepEqual(first.body.results.map(row => row.status), ['IMPORTED', 'SKIPPED']);
  const retry = await f.commit(plan.body.previewId, [2]);
  assert.equal(retry.body.results[0].replayed, true); assert.equal(f.products().length, 1);
});
test('import partial failure has exact results and retries only missing writes', async () => {
  const f = fixture(), rows = matrix(); rows.push(['Other', 'Brand', 'Food', 'Grocery', '', 'OTHER', '20']);
  const plan = await f.preview(rows);
  f.db.failWrite = `products/import_${plan.body.previewId}_3`;
  const first = await f.commit(plan.body.previewId, [2, 3]);
  assert.deepEqual(first.body.results.map(row => row.status), ['IMPORTED', 'FAILED']); assert.equal(f.products().length, 1);
  f.db.failWrite = null;
  const retry = await f.commit(plan.body.previewId, [2, 3]);
  assert.deepEqual(retry.body.results.map(row => row.status), ['IMPORTED', 'IMPORTED']); assert.equal(f.products().length, 2);
});
test('import receipt outage rolls back product and reservation', async () => {
  const f = fixture(), plan = await f.preview(); f.db.failWrite = 'catalog_import_results/';
  assert.equal((await f.commit(plan.body.previewId)).body.results[0].status, 'FAILED'); assert.equal(f.products().length, 0);
});
test('preview owner, expiry and possible duplicate acknowledgement are enforced', async () => {
  const f = fixture(); await f.create();
  const plan = await f.preview(matrix('OTHER'));
  assert.equal(plan.body.rows[0].status, 'POSSIBLE_DUPLICATE');
  assert.equal((await f.commit(plan.body.previewId)).body.results[0].status, 'FAILED');
  assert.equal((await f.call('commit', { previewId: plan.body.previewId, rows: [2], acknowledgePossible: true }, {}, 'other-admin')).body.results[0].status, 'FAILED');
  f.advance(31 * 60 * 1000);
  assert.equal((await f.commit(plan.body.previewId, [2], true)).body.results[0].status, 'FAILED');
  assert.equal(f.products().length, 1);
});
test('frozen control blocks all publication, not just Add', async () => {
  const f = fixture({ 'catalog_control/writer': { frozen: true } });
  const submission = await f.submit(), plan = await f.preview();
  assert.equal((await f.create()).statusCode, 409); assert.equal((await f.approve(submission)).statusCode, 409);
  assert.equal((await f.commit(plan.body.previewId)).body.results[0].status, 'FAILED');
});

test('offline audit and frozen backfill preserve archived identities and distinguish possible duplicates', async () => {
  const a = { ...product, status: 'Archived', is_active: false }, b = { ...product, variants: [{ sku: 'DIFFERENT', price: 5 }] };
  const audit = auditCatalog([{ id: 'a', data: a }, { id: 'b', data: b }]);
  assert.equal(audit.ok, true); assert.equal(audit.collisions.length, 0); assert.equal(audit.possibleDuplicates.length, 1);
  const f = fixture({ 'products/a': a, 'products/b': b, 'catalog_control/writer': { frozen: true } });
  assert.deepEqual(await backfillCatalogReservations(f.db, '2026-09-20T12:00:00Z'), { reserved: 2, frozen: true });
  assert.equal(f.db.read('catalog_control/writer').frozen, true);
});
for (const [kind, data] of Object.entries({ collision: product, missing: { sku: 'missing' }, malformed: null,
  ambiguous: { ...product, variants: [product.variants[0], product.variants[0]] } })) test(`audit refuses ${kind} without survivor selection`, async () => {
  const report = auditCatalog([{ id: 'a', data: product }, { id: 'b', data }]);
  assert.equal(report.ok, false); assert.equal(report.reservations.length, 0);
  if (kind === 'collision') { assert.equal(report.collisions.length, 1); assert.equal(report.possibleDuplicates.length, 0); }
});
test('legacy collisions, orphan claims, and conflicting backfill fail closed', async () => {
  const f = fixture({ 'products/a': product, 'products/b': product, 'catalog_control/writer': { frozen: true } });
  await assert.rejects(backfillCatalogReservations(f.db, '2026-09-20T12:00:00Z'), /conflicts/);
  f.db.remove('products/b'); f.db.remove('catalog_control/writer');
  f.db.seed('product_submission_identity/' + identityId('sku:CAN-330'), { productId: 'wrong' });
  assert.equal((await f.call('edit', { product: { name: 'Correct' }, expectedRevision: 0 }, { id: 'a' })).statusCode, 409);
  const report = auditCatalog([{ id: 'a', data: product }], [{ id: identityId('sku:CAN-330'), data: { productId: 'wrong' } }]);
  assert.equal(report.ok, false);
});
test('no-SKU fallback identity stays Phase 1 variant-aware', () => {
  const a = validateCatalogProduct({ ...product, variants: [{ size: '330ml', price: 1 }] });
  const b = validateCatalogProduct({ ...product, variants: [{ size: '1.5L', price: 1 }] });
  assert.notDeepEqual(productIdentityKeys(a), productIdentityKeys(b));
});

test('legacy publication flags cannot produce a falsely successful restore', async () => {
  const f = fixture({ 'products/legacy': { ...product, status: 'Archived', is_active: false, archived: true } });
  const result = await f.call('restore', { expectedRevision: 0 }, { id: 'legacy' });
  assert.equal(result.statusCode, 409);
  assert.equal(f.db.read('products/legacy').status, 'Archived');
  assert.equal((await f.create()).statusCode, 409);
});
test('legacy root-field and variations payload survives a non-identity edit', async () => {
  const legacy = { name: 'Legacy', brand: 'Brand', category: 'Drinks', segment: 'Grocery', status: 'Active',
    price: 10, size: '330ml', variations: [{ type: 'flavor', options: ['Cola', 'Cherry'], extra: { retained: true } }], customRoot: 'retained' };
  const f = fixture({ 'products/legacy': legacy });
  const response = await f.call('edit', { product: { description: 'Changed' }, expectedRevision: 0 }, { id: 'legacy' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.product.variations, legacy.variations);
  assert.equal(response.body.product.customRoot, 'retained');
  assert.deepEqual(productIdentityKeys(response.body.product), productIdentityKeys(legacy));
});
test('live writer refuses historical collision without choosing a survivor', async () => {
  const f = fixture({ 'products/a': product, 'products/b': product });
  assert.equal((await f.create({ ...product, variants: [{ sku: 'UNRELATED', price: 10 }] })).statusCode, 409);
  assert.equal(f.products().length, 2);
});
test('backfill requires explicit freeze and rolls back any failed claim write', async () => {
  const f = fixture({ 'products/a': product });
  await assert.rejects(backfillCatalogReservations(f.db, '2026-09-20T12:00:00Z'), /freeze/u);
  f.db.seed('catalog_control/writer', { frozen: true }); f.db.failWrite = 'product_submission_identity/';
  await assert.rejects(backfillCatalogReservations(f.db, '2026-09-20T12:00:00Z'));
  assert.equal(f.db.read('catalog_control/writer').auditCompletedAt, undefined);
  assert.equal(Object.keys(f.db.dump()).some(key => key.startsWith('product_submission_identity/')), false);
});
test('expired preview receipt still accurately recovers an already committed row', async () => {
  const f = fixture(), plan = await f.preview();
  assert.equal((await f.commit(plan.body.previewId)).body.results[0].status, 'IMPORTED');
  f.advance(31 * 60 * 1000);
  const replay = (await f.commit(plan.body.previewId)).body.results[0];
  assert.equal(replay.status, 'IMPORTED'); assert.equal(replay.replayed, true);
  assert.equal(f.products().length, 1);
});
test('malformed stored preview expiry fails closed before publication', async () => {
  const f = fixture(), plan = await f.preview(), path = 'catalog_import_previews/' + plan.body.previewId;
  f.db.seed(path, { ...f.db.read(path), expiresAt: 'invalid' });
  assert.equal((await f.commit(plan.body.previewId)).body.results[0].status, 'FAILED');
  assert.equal(f.products().length, 0);
});
for (const action of ['archive', 'restore']) for (const image of ['javascript:bad', null, 42]) test(`${action} revalidates legacy image ${image} through backend`, async () => {
  const f = fixture({ 'products/legacy': { ...product, image_url: image, status: 'Archived', is_active: false } });
  assert.equal((await f.call(action, { expectedRevision: 0 }, { id: 'legacy' })).statusCode, 400);
  assert.equal(f.db.read('products/legacy').image_url, image);
});
test('explicit Edit corrects legacy image and clears old image alias', async () => {
  const f = fixture({ 'products/legacy': { ...product, image_url: 'http://example.invalid/bad', image: 'javascript:bad' } });
  const response = await f.call('edit', { product: { image_url: product.image_url }, expectedRevision: 0 }, { id: 'legacy' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.product.image_url, product.image_url); assert.equal(response.body.product.image, '');
});

const forcedId = 'forced-reservation-id';
const forceCollision = () => forcedId;
const collisionOptions = { deriveReservationId: forceCollision };
const otherProduct = { ...product, name: 'Distinct', variants: [{ sku: 'OTHER', price: 1 }] };
const collisionRecords = [{ id: 'a', data: product }, { id: 'b', data: otherProduct }];
const claimPath = 'product_submission_identity/' + forcedId;
const at = '2026-09-20T12:00:00Z';
const integrityFailure = error => error.status === 409 && error.code === 'RESERVATION_ID_COLLISION';

test('forced distinct-identity ID collision blocks audit plan, distinct from canonical duplicates', () => {
  const report = auditCatalog(collisionRecords, [], collisionOptions);
  assert.equal(report.ok, false); assert.deepEqual(report.reservations, []); assert.deepEqual(report.collisions, []);
  assert.deepEqual(report.problems, [{ id: forcedId, kind: 'RESERVATION_ID_COLLISION', identities: ['sku:CAN-330', 'sku:OTHER'] }]);
  const duplicate = auditCatalog([{ id: 'a', data: product }, { id: 'b', data: product }], [], collisionOptions);
  assert.equal(duplicate.ok, false); assert.equal(duplicate.collisions.length, 1);
  assert.equal(duplicate.problems.some(problem => problem.kind === 'RESERVATION_ID_COLLISION'), false);
  assert.equal(auditCatalog(collisionRecords).ok, true);
  assert.equal(identityId('sku:CAN-330'), '99b07b272bdad203c94f014718bb8dfbdcfbdc01bc0dafae2dfc95d60e09c68e');
});

test('original forced-collision reproduction: no writes/completion on retry; resolved backfill is idempotent', async () => {
  const f = fixture({ 'products/a': product, 'products/b': otherProduct, 'catalog_control/writer': { frozen: true } });
  const before = f.db.dump();
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(backfillCatalogReservations(f.db, at, collisionOptions), integrityFailure);
    assert.deepEqual(f.db.dump(), before); assert.equal(f.db.commits, 0);
    assert.equal(f.db.read(claimPath), undefined); assert.equal(f.db.read('catalog_control/writer').auditCompletedAt, undefined);
  }
  f.db.remove('products/b');
  assert.deepEqual(await backfillCatalogReservations(f.db, at, collisionOptions), { reserved: 1, frozen: true });
  const claim = f.db.read(claimPath);
  assert.deepEqual(await backfillCatalogReservations(f.db, at, collisionOptions), { reserved: 1, frozen: true });
  assert.deepEqual(f.db.read(claimPath), claim); assert.equal(claim.identity, 'sku:CAN-330');
  assert.equal(f.db.read('catalog_control/writer').auditCompletedAt, at);
});

test('apply-layer independently rejects a forged colliding plan without relying on audit.ok', () => {
  const unsafe = collisionRecords.map(({ id, data }) => ({ id: forcedId, identity: productIdentityKeys(data)[0], productId: id, state: 'bound', version: 1 }));
  assert.throws(() => assertBackfillReservationPlan(collisionRecords, unsafe, [], forceCollision), integrityFailure);
  const clean = auditCatalog(collisionRecords).reservations;
  assert.doesNotThrow(() => assertBackfillReservationPlan(collisionRecords, clean, []));
  for (const plan of [clean.slice(1), [clean[0], clean[0]], clean.map(binding => ({ ...binding, productId: 'wrong' })),
    clean.map(binding => ({ ...binding, id: forcedId })), clean.map(binding => ({ ...binding, state: 'retired' }))]) {
    assert.throws(() => assertBackfillReservationPlan(collisionRecords, plan, []), { status: 409 });
  }
  assert.throws(() => assertBackfillReservationPlan([{ id: 'a', data: product }, { id: 'b', data: product }], [], []), { status: 409 });
});

for (const evidence of [undefined, null, '', 42, {}, 'invalid', 'fallback:invalid', 'sku: ', 'sku:OTHER']) {
  test(`stored evidence ${JSON.stringify(evidence)} blocks direct writer and backfill without mutation`, async () => {
    const stored = { productId: 'a', state: 'bound', ...(evidence === undefined ? {} : { identity: evidence }) };
    const f = fixture({ 'products/a': product, [claimPath]: stored });
    const before = f.db.dump();
    await assert.rejects(f.db.runTransaction(async tx => {
      const prepared = await prepareCatalogWrite({ tx, db: f.db, uid: 'admin', action: 'edit', productId: 'a',
        input: { description: 'Must not persist' }, expectedRevision: 0, at, ...collisionOptions });
      prepared.apply();
    }), { status: 409 });
    assert.deepEqual(f.db.dump(), before);
    f.db.seed('catalog_control/writer', { frozen: true });
    const frozen = f.db.dump(), reservations = [{ id: forcedId, data: stored }];
    const report = auditCatalog([{ id: 'a', data: product }], reservations, collisionOptions);
    assert.equal(report.ok, false); assert.deepEqual(report.reservations, []);
    assert.throws(() => assertBackfillReservationPlan([{ id: 'a', data: product }], [
      { id: forcedId, identity: 'sku:CAN-330', productId: 'a', state: 'bound', version: 1 }], reservations, forceCollision), { status: 409 });
    await assert.rejects(backfillCatalogReservations(f.db, at, collisionOptions), { status: 409 });
    assert.deepEqual(f.db.dump(), frozen); assert.equal(f.db.read('catalog_control/writer').auditCompletedAt, undefined);
  });
}

test('same identity evidence with wrong owner remains a separate ownership conflict', async () => {
  const f = fixture({ 'products/a': product, [claimPath]: { identity: 'sku:CAN-330', productId: 'wrong', state: 'bound' },
    'catalog_control/writer': { frozen: true } });
  const before = f.db.dump();
  const report = auditCatalog([{ id: 'a', data: product }], [{ id: forcedId, data: f.db.read(claimPath) }], collisionOptions);
  assert.equal(report.ok, false); assert.ok(report.problems.some(problem => problem.kind === 'RESERVATION_CONFLICT'));
  assert.equal(report.problems.some(problem => problem.kind === 'RESERVATION_ID_COLLISION'), false);
  await assert.rejects(backfillCatalogReservations(f.db, at, collisionOptions), { status: 409 });
  assert.deepEqual(f.db.dump(), before);
});

test('Admin A then Admin B with colliding IDs preserves first product and reservation', async () => {
  const f = fixture({}, forceCollision);
  assert.equal((await f.create()).statusCode, 200);
  const before = f.db.dump(), loser = await f.create(otherProduct);
  assert.equal(loser.statusCode, 409); assert.match(loser.body.error, /Reservation integrity conflict/u);
  assert.doesNotMatch(JSON.stringify(loser.body), /forced-reservation-id|sku:|SHA|hash/u);
  assert.deepEqual(f.db.dump(), before); assert.equal(f.products().length, 1);
});

test('concurrent Admin creates with distinct identities and colliding IDs commit at most one binding', async () => {
  const f = fixture({}, forceCollision);
  const results = await Promise.all([f.create(), f.create(otherProduct)]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 409]);
  assert.equal(f.products().length, 1);
  assert.equal(f.db.read(claimPath).identity, productIdentityKeys(f.products()[0].data)[0]);
});

test('unbackfilled catalog identities still block a colliding live create', async () => {
  const f = fixture({ 'products/a': product }, forceCollision), before = f.db.dump();
  assert.equal((await f.create(otherProduct)).statusCode, 409);
  assert.deepEqual(f.db.dump(), before);
});

test('matching evidence supports idempotent live edits and retains unrelated valid tombstones', async () => {
  const f = fixture({}, forceCollision), created = await f.create();
  assert.equal((await f.call('edit', { product: { description: 'Safe' }, expectedRevision: 1 }, { id: created.body.product.id })).statusCode, 200);
  assert.equal(f.db.read(claimPath).identity, 'sku:CAN-330');
  const tombstone = { id: identityId('sku:OLD'), data: { identity: 'sku:OLD', productId: 'old', state: 'deleted' } };
  assert.equal(auditCatalog(collisionRecords, [tombstone]).ok, true);
  delete tombstone.data.identity;
  assert.equal(auditCatalog(collisionRecords, [tombstone]).ok, false);
});

for (const order of ['admin-first', 'import-first', 'race']) test(`Admin vs importer forced collision (${order})`, async () => {
  const f = fixture({}, forceCollision), plan = await f.preview(matrix('OTHER', 'Distinct'));
  const admin = () => f.create(), importer = () => f.commit(plan.body.previewId);
  let a, b;
  if (order === 'race') [a, b] = await Promise.all([admin(), importer()]);
  else if (order === 'admin-first') { a = await admin(); b = await importer(); }
  else { b = await importer(); a = await admin(); }
  assert.equal(f.products().length, 1);
  assert.equal(Number(a.statusCode === 200) + Number(b.body.results[0].status === 'IMPORTED'), 1);
  if (a.statusCode !== 200) { assert.equal(a.statusCode, 409); assert.match(a.body.error, /Reservation integrity conflict/u); }
  else { assert.equal(b.body.results[0].status, 'FAILED'); assert.match(b.body.results[0].reason, /Reservation integrity conflict/u); }
  const persisted = f.products()[0]; assert.equal(f.db.read(claimPath).productId, persisted.id);
  assert.equal(f.db.read(claimPath).identity, productIdentityKeys(persisted.data)[0]);
});

for (const order of ['approval-first', 'import-first', 'race']) test(`approval vs importer forced collision (${order})`, async () => {
  const f = fixture({}, forceCollision), submission = await f.submit(), plan = await f.preview(matrix('OTHER', 'Distinct'));
  const approval = () => f.approve(submission), importer = () => f.commit(plan.body.previewId);
  let a, b;
  if (order === 'race') [a, b] = await Promise.all([approval(), importer()]);
  else if (order === 'approval-first') { a = await approval(); b = await importer(); }
  else { b = await importer(); a = await approval(); }
  assert.equal(f.products().length, 1);
  assert.equal(Number(a.statusCode === 200) + Number(b.body.results[0].status === 'IMPORTED'), 1);
  const request = f.db.read('product_requests/' + submission);
  if (a.statusCode === 200) {
    assert.equal(request.status, 'approved'); assert.equal(f.db.read(claimPath).productId, request.productId);
    assert.equal(b.body.results[0].status, 'FAILED'); assert.match(b.body.results[0].reason, /Reservation integrity conflict/u);
  } else {
    assert.equal(a.statusCode, 409); assert.match(a.body.error, /Reservation integrity conflict/u);
    assert.equal(request.status, 'submitted'); assert.equal(f.db.read('products/submission_' + submission), undefined);
  }
});

test('identity-changing edit detects internal old/new alias and keeps original state', async () => {
  const f = fixture({}, forceCollision), created = await f.create(), before = f.db.dump();
  const result = await f.call('edit', { product: otherProduct, expectedRevision: 1 }, { id: created.body.product.id });
  assert.equal(result.statusCode, 409); assert.match(result.body.error, /Reservation integrity conflict/u);
  assert.deepEqual(f.db.dump(), before);
});

test('identity-changing edit detects different stored identity at new ID, retaining old product and claim', async () => {
  const deriveReservationId = key => key === 'sku:CAN-330' ? identityId(key) : forcedId;
  const f = fixture({}, deriveReservationId), created = await f.create();
  f.db.seed(claimPath, { identity: 'sku:THIRD', productId: 'third', state: 'retired' });
  const before = f.db.dump();
  const result = await f.call('edit', { product: otherProduct, expectedRevision: 1 }, { id: created.body.product.id });
  assert.equal(result.statusCode, 409); assert.match(result.body.error, /Reservation integrity conflict/u);
  assert.deepEqual(f.db.dump(), before);
});

test('multi-key create rejects internal forced collision before any write', async () => {
  const f = fixture({}, forceCollision), before = f.db.dump();
  const result = await f.create({ ...product, variants: [...product.variants, ...otherProduct.variants] });
  assert.equal(result.statusCode, 409); assert.match(result.body.error, /Reservation integrity conflict/u);
  assert.deepEqual(f.db.dump(), before); assert.equal(f.db.commits, 0);
});

for (const action of ['archive', 'restore', 'delete']) for (const identity of [undefined, 'sku:OTHER']) {
  test(`${action} refuses ambiguous/colliding stored evidence ${identity}`, async () => {
    const f = fixture({}, forceCollision), created = await f.create();
    const claim = f.db.read(claimPath); delete claim.identity;
    if (identity !== undefined) claim.identity = identity;
    f.db.seed(claimPath, claim); const before = f.db.dump();
    const result = await f.call(action, { expectedRevision: 1 }, { id: created.body.product.id });
    assert.equal(result.statusCode, 409); assert.deepEqual(f.db.dump(), before);
  });
}

for (const failure of ['canonical', 'reservation-write', 'completion-write', 'commit']) {
  test(`backfill completion and all claims remain absent on ${failure} failure`, async () => {
    const f = fixture({ 'products/a': product, 'catalog_control/writer': { frozen: true } });
    if (failure === 'canonical') f.db.seed('products/b', product);
    if (failure === 'reservation-write') f.db.failWrite = 'product_submission_identity/';
    if (failure === 'completion-write') f.db.failWrite = 'catalog_control/';
    if (failure === 'commit') f.db.failCommit = true;
    const before = f.db.dump();
    await assert.rejects(backfillCatalogReservations(f.db, at));
    assert.deepEqual(f.db.dump(), before); assert.equal(f.db.read('catalog_control/writer').auditCompletedAt, undefined);
  });
}
