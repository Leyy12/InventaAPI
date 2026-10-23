import { randomUUID } from 'node:crypto';
import { catalogDigest, catalogError, onlyFields } from './catalog-contract.js';
import { appendActivityAudit, prepareCatalogWrite, readCatalog, requireCatalogAdmin } from './catalog-writer.js';
import { planImportMerge, planImportUpdate, previewCatalogImport } from './catalog-import.js';
import { mergeCatalogGroup, planSizeMerges, remapApiKeys } from './catalog-merge.js';

// Firestore documents max out at 1 MiB; leave headroom for field overhead.
const PREVIEW_CHUNK_BYTES = 700000;
// Rows per commit request. The admin panel sends a large import as several batches.
const COMMIT_BATCH_MAX = 200;
// How long an import preview can be committed. Large files take a while to write.
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;
// Preview rows sent back to the browser: only what the importer shows, so a file of
// thousands of rows stays well under the hosting response size limit.
const slimRow = ({ row, status, reason, product }) => ({ row, status, reason,
  product: product && { name: product.name, brand: product.brand, segment: product.segment, category: product.category,
    sku: product.sku, size: product.variants[0]?.size || '', flavor: product.variants[0]?.flavor || '' } });

// Preview chunks never change after the preview is written, so one commit request
// reads each chunk once (chunkCache) instead of once per row.
async function findPreviewRow(tx, db, previewId, plan, rowNumber, uid, chunkCache = new Map()) {
  if (Array.isArray(plan.rows)) return plan.rows.find(item => item.row === rowNumber);
  const index = (plan.chunks || []).findIndex(chunk => rowNumber >= chunk.first && rowNumber <= chunk.last);
  if (index < 0) return undefined;
  if (!chunkCache.has(index)) {
    const chunk = (await tx.get(db.collection('catalog_import_previews').doc(`${previewId}_chunk${index}`))).data();
    if (!chunk || chunk.uid !== uid) throw catalogError(403, 'Import preview unavailable to this account.');
    chunkCache.set(index, chunk.rows);
  }
  return chunkCache.get(index).find(item => item.row === rowNumber);
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
    onlyFields(req.body, ['rows', 'options']);
    const { merge = false, requireImage = false } = req.body.options ?? {};
    if (typeof merge !== 'boolean' || typeof requireImage !== 'boolean') throw catalogError(400, 'Invalid import options.');
    const previewId = makeId();
    const result = await db.runTransaction(async tx => {
      await requireCatalogAdmin(tx, db, uid);
      const plan = previewCatalogImport(req.body.rows, await readCatalog(tx, db), { merge, requireImage });
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
      tx.set(ref, { ...summary, uid, merge, expiresAt: new Date(now().getTime() + (merge ? PREVIEW_TTL_MS : 30 * 60 * 1000)).toISOString(),
        chunks: chunks.map(chunk => ({ first: chunk.rows[0].row, last: chunk.rows[chunk.rows.length - 1].row })) });
      chunks.forEach((chunk, index) => tx.set(db.collection('catalog_import_previews').doc(`${previewId}_chunk${index}`), { uid, rows: chunk.rows }));
      return { ...plan, previewId };
    });
    return merge ? { ...result, rows: result.rows.map(slimRow) } : result;
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
    // One catalog read serves every row in this request; see prepareCatalogWrite.
    const catalog = {}, chunkCache = new Map();
    for (const rowNumber of rows) {
      let nextCatalog = null;
      try {
        const { activity, ...result } = await db.runTransaction(async tx => {
          await requireCatalogAdmin(tx, db, uid);
          const plan = (await tx.get(db.collection('catalog_import_previews').doc(previewId))).data();
          if (!plan || plan.uid !== uid) throw catalogError(403, 'Import preview unavailable to this account.');
          const receiptRef = db.collection('catalog_import_results').doc(catalogDigest([previewId, rowNumber]));
          const receipt = (await tx.get(receiptRef)).data();
          if (receipt) return { ...receipt, replayed: true };
          if (!Number.isFinite(Date.parse(plan.expiresAt)) || Date.parse(plan.expiresAt) <= now().getTime()) throw catalogError(409, 'Preview expired; parse and preview again.');
          const row = await findPreviewRow(tx, db, previewId, plan, rowNumber, uid, chunkCache);
          if (!row || !['NEW', 'POSSIBLE_DUPLICATE', 'UPDATE', 'APPEND'].includes(row.status)) {
            return { row: rowNumber, status: 'SKIPPED', reason: row?.reason || 'Not a valid new row.' };
          }
          if (row.status === 'UPDATE' || row.status === 'APPEND') {
            // Re-plan against the product as it is now, so several rows for one
            // product (different variants) each apply on top of the last.
            let productId = row.update?.productId;
            if (!productId && row.appendTo?.row) {
              const root = (await tx.get(db.collection('catalog_import_results').doc(catalogDigest([previewId, row.appendTo.row])))).data();
              if (!root?.productId || !['IMPORTED', 'UPDATED'].includes(root.status)) {
                return { row: rowNumber, status: 'FAILED', reason: `Row ${row.appendTo.row} was not added, so this size was not added either.` };
              }
              productId = root.productId;
            }
            const current = (await tx.get(db.collection('products').doc(productId))).data();
            if (!current) throw catalogError(404, 'Product was removed after preview.');
            const update = plan.merge && (row.update?.merge || row.appendTo) ? planImportMerge(current, row.product)
              : planImportUpdate(current, row.product, plan.merge ? { fillImageOnly: true } : {});
            if (!update) {
              const saved = { row: rowNumber, status: 'SKIPPED', reason: 'Already up to date.', productId, replayed: false };
              tx.set(receiptRef, saved);
              return saved;
            }
            const prepared = await prepareCatalogWrite({ tx, db, uid, actor, action: 'edit', productId, input: update.input,
              expectedRevision: current.catalogRevision ?? 0, at: now().toISOString(), deriveReservationId, catalog });
            const saved = { row: rowNumber, status: update.kind === 'append' ? 'APPENDED' : 'UPDATED', productId, reason: update.changes.join('; '), replayed: false };
            prepared.apply(); tx.set(receiptRef, saved); nextCatalog = prepared.nextCatalog;
            return { ...saved, activity: prepared.activity };
          }
          if (row.status === 'POSSIBLE_DUPLICATE' && !acknowledgePossible) throw catalogError(409, 'Review and acknowledge possible duplicates.');
          const prepared = await prepareCatalogWrite({ tx, db, uid, actor, action: 'create',
            productId: `import_${previewId}_${rowNumber}`, input: row.product, at: now().toISOString(), deriveReservationId, catalog });
          // Other selected rows can add the same Brand+Name after preview; explicit
          // acknowledgement covers these, but never overrides canonical conflicts.
          if (prepared.possibleDuplicates.length && !acknowledgePossible) throw catalogError(409, 'Possible duplicates changed; refresh preview and review.');
          const saved = { row: rowNumber, status: 'IMPORTED', productId: prepared.product.id, replayed: false };
          prepared.apply(); tx.set(receiptRef, saved); nextCatalog = prepared.nextCatalog;
          return { ...saved, activity: prepared.activity };
        });
        if (nextCatalog) Object.assign(catalog, nextCatalog);
        if (activity) await appendActivityAudit(db, activity);
        results.push(result);
      } catch (error) {
        // The preview found no match, so a product with this identity was added after the
        // check (usually by an earlier run of the same import). Nothing was overwritten.
        if (error.status === 409 && /^Canonical catalog conflict/u.test(error.message)) {
          results.push({ row: rowNumber, status: 'SKIPPED', reason: 'Already in the catalog (added after this file was checked).' });
          continue;
        }
        results.push({ row: rowNumber, status: 'FAILED', reason: Number.isInteger(error.status) ? error.message : 'Write unavailable; retry the same preview and row.' });
      }
    }
    return { results };
  });
  // Products that are only different sizes of one product: the plan, then the merge.
  const mergePlan = wrap(async (req, db, uid) => {
    const groups = await db.runTransaction(async tx => {
      await requireCatalogAdmin(tx, db, uid);
      return planSizeMerges(await readCatalog(tx, db));
    });
    return { groups, products: groups.reduce((total, group) => total + group.duplicateIds.length + 1, 0) };
  });
  const merge = wrap(async (req, db, uid, actor) => {
    onlyFields(req.body, ['groups']);
    const groups = req.body.groups;
    const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,180}$/u.test(id);
    // A manual merge names the product and, per product, the flavor it becomes.
    const validManual = group => group.manual === true && typeof group.name === 'string' && group.name.trim().length >= 1
      && group.name.trim().length <= 160 && (group.flavors === undefined || (group.flavors && typeof group.flavors === 'object'
        && !Array.isArray(group.flavors) && Object.entries(group.flavors).every(([id, flavor]) => [group.keeperId, ...group.duplicateIds].includes(id)
          && typeof flavor === 'string' && flavor.length <= 80)));
    if (!Array.isArray(groups) || !groups.length || groups.length > 20 || groups.some(group => !group || !validId(group.keeperId)
      || !Array.isArray(group.duplicateIds) || !group.duplicateIds.length || group.duplicateIds.length > 49 || !group.duplicateIds.every(validId)
      || (group.manual !== undefined && !validManual(group)))) {
      throw catalogError(400, 'Invalid merge selection.');
    }
    await db.runTransaction(tx => requireCatalogAdmin(tx, db, uid));
    const results = [];
    for (const group of groups) {
      try {
        const at = now().toISOString();
        const done = await mergeCatalogGroup({ db, uid, keeperId: group.keeperId, duplicateIds: group.duplicateIds, at, deriveReservationId,
          manual: group.manual ? { name: group.name.trim(), flavors: group.flavors || {} } : null });
        const keys = await remapApiKeys(db, done);
        await appendActivityAudit(db, { uid, actor, action: 'Product Updated', entityType: 'product', entityId: done.keeperId, at });
        for (const id of done.removed) await appendActivityAudit(db, { uid, actor, action: 'Product Deleted', entityType: 'product', entityId: id, at });
        results.push({ keeperId: done.keeperId, status: 'MERGED', name: done.name, sizes: done.sizes, removed: done.removed.length, apiKeysUpdated: keys });
      } catch (error) {
        if (!Number.isInteger(error.status)) console.error('[Catalog merge]', error.message);
        results.push({ keeperId: group.keeperId, status: 'FAILED', reason: Number.isInteger(error.status) ? error.message : 'Merge unavailable; retry.' });
      }
    }
    return { results };
  });
  return { create: mutate('create'), edit: mutate('edit'), archive: mutate('archive'), restore: mutate('restore'), delete: mutate('delete'), preview, commit, mergePlan, merge };
}
