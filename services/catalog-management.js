import { randomUUID } from 'node:crypto';
import { catalogDigest, catalogError, onlyFields } from './catalog-contract.js';
import { prepareCatalogWrite, readCatalog, requireCatalogAdmin } from './catalog-writer.js';
import { previewCatalogImport } from './catalog-import.js';

export function createCatalogHandlers({ getDb, verifyIdToken, now = () => new Date(), makeId = randomUUID, deriveReservationId }) {
  const wrap = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const authorization = req.headers?.authorization;
      if (typeof authorization !== 'string' || !/^Bearer \S+$/u.test(authorization)) throw catalogError(401, 'Authentication required.');
      let token;
      try { token = await verifyIdToken(authorization.slice(7), true); } catch { throw catalogError(401, 'Invalid or revoked authentication.'); }
      if (typeof token?.uid !== 'string' || !token.uid) throw catalogError(401, 'Invalid authentication.');
      onlyFields(req.query || {}, []);
      return res.status(200).json(await action(req, getDb(), token.uid));
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 503;
      return res.status(status).json({ error: status === 503 ? 'Catalog service unavailable; retry safely or refresh.' : error.message });
    }
  };
  const mutate = action => wrap(async (req, db, uid) => {
    onlyFields(req.body, action === 'create' ? ['product'] : action === 'edit' ? ['product', 'expectedRevision'] : ['expectedRevision']);
    const productId = action === 'create' ? makeId() : req.params?.id;
    return db.runTransaction(async tx => {
      const prepared = await prepareCatalogWrite({ tx, db, uid, action, productId, input: req.body.product,
        expectedRevision: req.body.expectedRevision, at: now().toISOString(), deriveReservationId });
      prepared.apply();
      return { product: action === 'delete' ? null : prepared.product, deleted: action === 'delete', possibleDuplicates: prepared.possibleDuplicates };
    });
  });
  const preview = wrap(async (req, db, uid) => {
    onlyFields(req.body, ['rows']);
    const previewId = makeId();
    return db.runTransaction(async tx => {
      await requireCatalogAdmin(tx, db, uid);
      const plan = previewCatalogImport(req.body.rows, await readCatalog(tx, db));
      if (Buffer.byteLength(JSON.stringify(plan), 'utf8') > 800000) throw catalogError(400, 'Preview is too large; use a smaller file.');
      const ref = db.collection('catalog_import_previews').doc(previewId);
      if ((await tx.get(ref)).exists) throw catalogError(409, 'Preview ID collision. Retry.');
      tx.set(ref, { ...plan, uid, expiresAt: new Date(now().getTime() + 30 * 60 * 1000).toISOString() });
      return { ...plan, previewId };
    });
  });
  const commit = wrap(async (req, db, uid) => {
    onlyFields(req.body, ['previewId', 'rows', 'acknowledgePossible']);
    const { previewId, rows, acknowledgePossible = false } = req.body;
    if (typeof previewId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(previewId)
      || !Array.isArray(rows) || rows.length > 200 || !rows.length || new Set(rows).size !== rows.length
      || rows.some(row => !Number.isInteger(row) || row < 2 || row > 201) || typeof acknowledgePossible !== 'boolean') {
      throw catalogError(400, 'Invalid import selection.');
    }
    const results = [];
    await db.runTransaction(tx => requireCatalogAdmin(tx, db, uid));
    for (const rowNumber of rows) {
      try {
        const result = await db.runTransaction(async tx => {
          await requireCatalogAdmin(tx, db, uid);
          const plan = (await tx.get(db.collection('catalog_import_previews').doc(previewId))).data();
          if (!plan || plan.uid !== uid) throw catalogError(403, 'Import preview unavailable to this account.');
          const receiptRef = db.collection('catalog_import_results').doc(catalogDigest([previewId, rowNumber]));
          const receipt = (await tx.get(receiptRef)).data();
          if (receipt) return { ...receipt, replayed: true };
          if (!Number.isFinite(Date.parse(plan.expiresAt)) || Date.parse(plan.expiresAt) <= now().getTime()) throw catalogError(409, 'Preview expired; parse and preview again.');
          const row = plan.rows.find(item => item.row === rowNumber);
          if (!row || !['NEW', 'POSSIBLE_DUPLICATE'].includes(row.status)) {
            return { row: rowNumber, status: 'SKIPPED', reason: row?.reason || 'Not a valid new row.' };
          }
          if (row.status === 'POSSIBLE_DUPLICATE' && !acknowledgePossible) throw catalogError(409, 'Review and acknowledge possible duplicates.');
          const prepared = await prepareCatalogWrite({ tx, db, uid, action: 'create',
            productId: `import_${previewId}_${rowNumber}`, input: row.product, at: now().toISOString(), deriveReservationId });
          // Other selected rows can add the same Brand+Name after preview; explicit
          // acknowledgement covers these, but never overrides canonical conflicts.
          if (prepared.possibleDuplicates.length && !acknowledgePossible) throw catalogError(409, 'Possible duplicates changed; refresh preview and review.');
          const saved = { row: rowNumber, status: 'IMPORTED', productId: prepared.product.id, replayed: false };
          prepared.apply(); tx.set(receiptRef, saved);
          return saved;
        });
        results.push(result);
      } catch (error) {
        results.push({ row: rowNumber, status: 'FAILED', reason: Number.isInteger(error.status) ? error.message : 'Write unavailable; retry the same preview and row.' });
      }
    }
    return { results };
  });
  return { create: mutate('create'), edit: mutate('edit'), archive: mutate('archive'), restore: mutate('restore'), delete: mutate('delete'), preview, commit };
}
