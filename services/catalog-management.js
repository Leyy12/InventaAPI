import { randomUUID } from 'node:crypto';
import { catalogDigest, catalogError, onlyFields } from './catalog-contract.js';
import { appendActivityAudit, prepareCatalogWrite, readCatalog, requireCatalogAdmin } from './catalog-writer.js';
import { planImportUpdate, previewCatalogImport } from './catalog-import.js';
import { normalizeProductImageUrl } from './product-submission-contract.js';

// Firestore documents max out at 1 MiB; leave headroom for field overhead.
const PREVIEW_CHUNK_BYTES = 700000;
// Rows per commit request. The admin panel sends a large import as several batches.
const COMMIT_BATCH_MAX = 200;
// Products per bulk image request. The admin panel sends a large CSV as several batches.
export const IMAGE_BATCH_MAX = 100;
const PRODUCT_ID = /^[a-zA-Z0-9_-]{1,180}$/u;
const hasPhoto = product => [product.image_url, product.image, product.image_asset_id]
  .some(value => typeof value === 'string' && value.trim() !== '');

async function findPreviewRow(tx, db, previewId, plan, rowNumber, uid) {
  if (Array.isArray(plan.rows)) return plan.rows.find(item => item.row === rowNumber);
  const index = (plan.chunks || []).findIndex(chunk => rowNumber >= chunk.first && rowNumber <= chunk.last);
  if (index < 0) return undefined;
  const chunk = (await tx.get(db.collection('catalog_import_previews').doc(`${previewId}_chunk${index}`))).data();
  if (!chunk || chunk.uid !== uid) throw catalogError(403, 'Import preview unavailable to this account.');
  return chunk.rows.find(item => item.row === rowNumber);
}

export function createCatalogHandlers({ getDb, verifyIdToken, now = () => new Date(), makeId = randomUUID, deriveReservationId, previewChunkBytes = PREVIEW_CHUNK_BYTES }) {
  const wrap = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const authorization = req.headers?.authorization;
      if (typeof authorization !== 'string' || !/^Bearer \S+$/u.test(authorization)) throw catalogError(401, 'Authentication required.');
      let token;
      try { token = await verifyIdToken(authorization.slice(7), true); } catch { throw catalogError(401, 'Invalid or revoked authentication.'); }
      if (typeof token?.uid !== 'string' || !token.uid) throw catalogError(401, 'Invalid authentication.');
      onlyFields(req.query || {}, []);
      return res.status(200).json(await action(req, getDb(), token.uid, token));
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 503;
      return res.status(status).json({ error: status === 503 ? 'Catalog service unavailable; retry safely or refresh.' : error.message });
    }
  };
  const mutate = action => wrap(async (req, db, uid, actor) => {
    onlyFields(req.body, action === 'create' ? ['product'] : action === 'edit' ? ['product', 'expectedRevision'] : ['expectedRevision']);
    const key = action === 'create' ? req.headers['idempotency-key'] : undefined;
    if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/u.test(key))) throw catalogError(400, 'Invalid catalog operation key.');
    const receiptRef = key ? db.collection('catalog_create_operations').doc(catalogDigest([uid, key])) : null;
    const digest = key ? catalogDigest(req.body.product) : null;
    const productId = action === 'create' ? (key ? `catalog_${catalogDigest([uid, key])}` : makeId()) : req.params?.id;
    const { activity, ...result } = await db.runTransaction(async tx => {
      if (receiptRef) {
        await requireCatalogAdmin(tx, db, uid);
        const receipt = (await tx.get(receiptRef)).data();
        if (receipt) {
          if (receipt.uid !== uid || receipt.digest !== digest) throw catalogError(409, 'Catalog key already used for different content.');
          const product = (await tx.get(db.collection('products').doc(productId))).data();
          if (!product) throw catalogError(409, 'Previously created product was removed; refresh the catalog.');
          return { product: { ...product, id: productId }, deleted: false, possibleDuplicates: [], replayed: true };
        }
      }
      const prepared = await prepareCatalogWrite({ tx, db, uid, actor, action, productId, input: req.body.product,
        expectedRevision: req.body.expectedRevision, at: now().toISOString(), deriveReservationId });
      prepared.apply();
      if (receiptRef) tx.set(receiptRef, { uid, digest, productId, createdAt: now().toISOString() });
      return { product: action === 'delete' ? null : prepared.product, deleted: action === 'delete',
        possibleDuplicates: prepared.possibleDuplicates, activity: prepared.activity };
    });
    if (activity) await appendActivityAudit(db, activity);
    return result;
  });
  const preview = wrap(async (req, db, uid) => {
    onlyFields(req.body, ['rows']);
    const previewId = makeId();
    return db.runTransaction(async tx => {
      await requireCatalogAdmin(tx, db, uid);
      const plan = previewCatalogImport(req.body.rows, await readCatalog(tx, db));
      const ref = db.collection('catalog_import_previews').doc(previewId);
      if ((await tx.get(ref)).exists) throw catalogError(409, 'Preview ID collision. Retry.');
      // Rows are split across chunk documents so files of any length stay under
      // Firestore's 1 MiB per-document limit. Chunks hold consecutive row numbers.
      const chunks = [];
      for (const row of plan.rows) {
        const bytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
        const last = chunks[chunks.length - 1];
        if (!last || last.bytes + bytes > previewChunkBytes) chunks.push({ rows: [row], bytes });
        else { last.rows.push(row); last.bytes += bytes; }
      }
      const { rows, ...summary } = plan;
      tx.set(ref, { ...summary, uid, expiresAt: new Date(now().getTime() + 30 * 60 * 1000).toISOString(),
        chunks: chunks.map(chunk => ({ first: chunk.rows[0].row, last: chunk.rows[chunk.rows.length - 1].row })) });
      chunks.forEach((chunk, index) => tx.set(db.collection('catalog_import_previews').doc(`${previewId}_chunk${index}`), { uid, rows: chunk.rows }));
      return { ...plan, previewId };
    });
  });
  const commit = wrap(async (req, db, uid, actor) => {
    onlyFields(req.body, ['previewId', 'rows', 'acknowledgePossible']);
    const { previewId, rows, acknowledgePossible = false } = req.body;
    if (typeof previewId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(previewId)
      || !Array.isArray(rows) || rows.length > COMMIT_BATCH_MAX || !rows.length || new Set(rows).size !== rows.length
      || rows.some(row => !Number.isInteger(row) || row < 2) || typeof acknowledgePossible !== 'boolean') {
      throw catalogError(400, 'Invalid import selection.');
    }
    const results = [];
    await db.runTransaction(tx => requireCatalogAdmin(tx, db, uid));
    for (const rowNumber of rows) {
      try {
        const { activity, ...result } = await db.runTransaction(async tx => {
          await requireCatalogAdmin(tx, db, uid);
          const plan = (await tx.get(db.collection('catalog_import_previews').doc(previewId))).data();
          if (!plan || plan.uid !== uid) throw catalogError(403, 'Import preview unavailable to this account.');
          const receiptRef = db.collection('catalog_import_results').doc(catalogDigest([previewId, rowNumber]));
          const receipt = (await tx.get(receiptRef)).data();
          if (receipt) return { ...receipt, replayed: true };
          if (!Number.isFinite(Date.parse(plan.expiresAt)) || Date.parse(plan.expiresAt) <= now().getTime()) throw catalogError(409, 'Preview expired; parse and preview again.');
          const row = await findPreviewRow(tx, db, previewId, plan, rowNumber, uid);
          if (!row || !['NEW', 'POSSIBLE_DUPLICATE', 'UPDATE'].includes(row.status)) {
            return { row: rowNumber, status: 'SKIPPED', reason: row?.reason || 'Not a valid new row.' };
          }
          if (row.status === 'UPDATE') {
            // Re-plan against the product as it is now, so several rows for one
            // product (different variants) each apply on top of the last.
            const { productId } = row.update;
            const current = (await tx.get(db.collection('products').doc(productId))).data();
            if (!current) throw catalogError(404, 'Product was removed after preview.');
            const update = planImportUpdate(current, row.product);
            if (!update) {
              const saved = { row: rowNumber, status: 'SKIPPED', reason: 'Already up to date.', productId, replayed: false };
              tx.set(receiptRef, saved);
              return saved;
            }
            const prepared = await prepareCatalogWrite({ tx, db, uid, actor, action: 'edit', productId, input: update.input,
              expectedRevision: current.catalogRevision ?? 0, at: now().toISOString(), deriveReservationId });
            const saved = { row: rowNumber, status: 'UPDATED', productId, reason: update.changes.join('; '), replayed: false };
            prepared.apply(); tx.set(receiptRef, saved);
            return { ...saved, activity: prepared.activity };
          }
          if (row.status === 'POSSIBLE_DUPLICATE' && !acknowledgePossible) throw catalogError(409, 'Review and acknowledge possible duplicates.');
          const prepared = await prepareCatalogWrite({ tx, db, uid, actor, action: 'create',
            productId: `import_${previewId}_${rowNumber}`, input: row.product, at: now().toISOString(), deriveReservationId });
          // Other selected rows can add the same Brand+Name after preview; explicit
          // acknowledgement covers these, but never overrides canonical conflicts.
          if (prepared.possibleDuplicates.length && !acknowledgePossible) throw catalogError(409, 'Possible duplicates changed; refresh preview and review.');
          const saved = { row: rowNumber, status: 'IMPORTED', productId: prepared.product.id, replayed: false };
          prepared.apply(); tx.set(receiptRef, saved);
          return { ...saved, activity: prepared.activity };
        });
        if (activity) await appendActivityAudit(db, activity);
        results.push(result);
      } catch (error) {
        results.push({ row: rowNumber, status: 'FAILED', reason: Number.isInteger(error.status) ? error.message : 'Write unavailable; retry the same preview and row.' });
      }
    }
    return { results };
  });
  // Adds photo links to products that have none. A photo never changes a product's
  // name, brand or SKU, so unlike other writes this skips the full-catalog duplicate
  // scan, and one transaction covers the whole batch. Products that already have a
  // photo (or appear twice in the batch) are skipped, never overwritten.
  const images = wrap(async (req, db, uid, actor) => {
    onlyFields(req.body, ['items']);
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length || items.length > IMAGE_BATCH_MAX) {
      throw catalogError(400, `Send between 1 and ${IMAGE_BATCH_MAX} image links per request.`);
    }
    const at = now().toISOString();
    const results = await db.runTransaction(async tx => {
      await requireCatalogAdmin(tx, db, uid);
      const controlRef = db.collection('catalog_control').doc('writer');
      const control = (await tx.get(controlRef)).data();
      if (control?.frozen) throw catalogError(409, 'Catalog is frozen for operator maintenance.');
      const seen = new Set(), staged = [], outcome = [];
      for (const item of items) {
        const productId = item?.productId;
        if (typeof productId !== 'string' || !PRODUCT_ID.test(productId)) { outcome.push({ productId: String(productId ?? ''), status: 'FAILED', reason: 'Invalid product ID.' }); continue; }
        if (seen.has(productId)) { outcome.push({ productId, status: 'SKIPPED', reason: 'Another link in this batch is for the same product.' }); continue; }
        seen.add(productId);
        let url;
        try { url = normalizeProductImageUrl(item.image_url); } catch { url = ''; }
        if (!url) { outcome.push({ productId, status: 'FAILED', reason: 'Image link must be an HTTPS URL.' }); continue; }
        const ref = db.collection('products').doc(productId);
        const product = (await tx.get(ref)).data();
        if (!product) { outcome.push({ productId, status: 'SKIPPED', reason: 'Product not found.' }); continue; }
        if (hasPhoto(product)) { outcome.push({ productId, status: 'SKIPPED', reason: 'Product already has a photo.' }); continue; }
        const next = { ...product, image_url: url, updatedAt: at, catalogRevision: (product.catalogRevision ?? 0) + 1 };
        staged.push({ ref, next });
        outcome.push({ productId, status: 'SAVED', product: { ...next, id: productId } });
      }
      for (const { ref, next } of staged) tx.set(ref, next);
      if (staged.length) tx.set(controlRef, { ...control, version: 1, revision: (control?.revision ?? 0) + 1, updatedAt: at });
      return outcome;
    });
    const saved = results.filter(result => result.status === 'SAVED').length;
    if (saved) await appendActivityAudit(db, { uid, actor, action: 'Product Images Added', entityType: 'product', entityId: `${saved} products`, at });
    return { results };
  });
  return { images, create: mutate('create'), edit: mutate('edit'), archive: mutate('archive'), restore: mutate('restore'), delete: mutate('delete'), preview, commit };
}
