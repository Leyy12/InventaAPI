import { randomUUID } from 'node:crypto';
import { catalogDigest, catalogError, onlyFields } from './catalog-contract.js';
import { appendActivityAudit, prepareCatalogWrite, readCatalog, requireCatalogAdmin } from './catalog-writer.js';
import { previewCatalogImport } from './catalog-import.js';

// Firestore documents max out at 1 MiB; leave headroom for field overhead.
const PREVIEW_CHUNK_BYTES = 700000;
// Rows per commit request. The admin panel sends a large import as several batches.
const COMMIT_BATCH_MAX = 200;

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
          if (!row || !['NEW', 'POSSIBLE_DUPLICATE'].includes(row.status)) {
            return { row: rowNumber, status: 'SKIPPED', reason: row?.reason || 'Not a valid new row.' };
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
  return { create: mutate('create'), edit: mutate('edit'), archive: mutate('archive'), restore: mutate('restore'), delete: mutate('delete'), preview, commit };
}
