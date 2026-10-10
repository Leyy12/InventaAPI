import { accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { evaluateProductVisibility } from './product-contract.js';
import { mediaDigest, mediaOperationId, mediaRef, validMediaId } from './product-media-binding.js';
import { submissionError } from './product-submission-contract.js';

// Storage/processing are injected; core authorization tests cannot reach a bucket.
export function createProductMediaHandlers({ getDb, verifyIdToken, storage, processImage, publicOrigin,
  enabled = false, now = () => new Date() }) {
  const checkEnabled = () => {
    if (!enabled) throw submissionError(503, 'Image uploads are awaiting staging storage setup. Use an HTTPS image URL for now.');
    let parsed; try { parsed = new URL(publicOrigin); } catch { throw submissionError(503, 'Verified media origin configuration is required.'); }
    if (parsed.protocol !== 'https:' || parsed.origin !== publicOrigin || parsed.username || parsed.password) throw submissionError(503, 'Verified media origin configuration is required.');
  };
  const account = async (tx, db, uid, adminOnly = false) => {
    const data = (await tx.get(db.collection('users').doc(uid))).data();
    if (!data || accountBlocked(data)) throw submissionError(403, 'Account is unavailable.');
    const admin = String(data.role || '').toLowerCase() === 'admin';
    if (adminOnly && !admin) throw submissionError(403, 'Admin access required.');
    if (!admin && !['developer', 'customer'].includes(String(data.role || '').toLowerCase())) throw submissionError(403, 'Customer access required.');
    return { data, admin };
  };
  const authenticate = async req => {
    if (!/^Bearer \S+$/u.test(req.headers?.authorization || '')) throw submissionError(401, 'Authentication required.');
    try {
      const token = await verifyIdToken(req.headers.authorization.slice(7), true);
      if (!token?.uid || typeof token.uid !== 'string') throw Error('Missing UID');
      return token.uid;
    } catch { throw submissionError(401, 'Invalid or revoked authentication.'); }
  };
  const wrap = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { checkEnabled(); return await action(req, res); }
    catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 503;
      return res.status(status).json({ error: Number.isInteger(error.status) ? error.message : 'Image service unavailable. Retry the same image and operation.' });
    }
  };
  const upload = wrap(async (req, res) => {
    const uid = await authenticate(req), db = getDb();
    const workflow = req.params?.workflow, key = req.headers['idempotency-key'];
    if (!['submission', 'catalog'].includes(workflow) || typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/u.test(key)
      || Object.keys(req.query || {}).length) throw submissionError(400, 'Invalid image workflow or stable operation key.');
    await db.runTransaction(tx => account(tx, db, uid, workflow === 'catalog'));
    await storage.verify?.();
    // No decoder/storage access before verified authentication and current account.
    const processed = await processImage(req.body, req.headers['content-type']);
    const sourceDigest = mediaDigest(req.body), processedDigest = mediaDigest(processed.bytes);
    const operationId = mediaOperationId(uid, key), id = mediaDigest(JSON.stringify([uid, workflow, key]));
    const ref = mediaRef(db, id), path = `product-media/${id}.webp`, at = now().toISOString();
    const publicUrl = `${publicOrigin}/api/v1/product-media/${id}/image`;
    await db.runTransaction(async tx => {
      await account(tx, db, uid, workflow === 'catalog');
      const old = (await tx.get(ref)).data();
      if (old) {
        if (old.uid !== uid || old.workflow !== workflow || old.sourceDigest !== sourceDigest || old.processedDigest !== processedDigest)
          throw submissionError(409, 'The upload key was already used for a different image.');
        if (!['uploading', 'ready', 'pending', 'published'].includes(old.state)) throw submissionError(409, 'This image operation is closed. Choose a new image operation.');
        return;
      }
      const outstanding = await tx.get(db.collection('product_media').where('uid', '==', uid).where('open', '==', true).limit(21));
      if (outstanding.docs.length >= 20)
        throw submissionError(429, 'Too many unfinished image uploads. Finish existing submissions or contact support.');
      tx.set(ref, { version: 1, uid, workflow, operationId, sourceDigest, processedDigest, path, publicUrl,
        state: 'uploading', open: true, mime: 'image/webp', bytes: processed.bytes.length, width: processed.width, height: processed.height, createdAt: at, updatedAt: at });
    });
    // Immutable conditional create is safe under concurrent/replayed uploads.
    // A lost response/failed commit leaves uploading state, recoverable by same bytes/key.
    await storage.putImmutable(path, processed.bytes, processedDigest);
    await db.runTransaction(async tx => {
      await account(tx, db, uid, workflow === 'catalog');
      const old = (await tx.get(ref)).data();
      if (!old || old.sourceDigest !== sourceDigest || old.processedDigest !== processedDigest) throw submissionError(409, 'Image operation changed.');
      if (old.state === 'uploading') tx.update(ref, { state: 'ready', updatedAt: now().toISOString() });
      else if (!['ready', 'pending', 'published'].includes(old.state)) throw submissionError(409, 'Image operation closed.');
    });
    return res.status(200).json({ image_asset_id: id, width: processed.width, height: processed.height });
  });
  const read = privateAccess => wrap(async (req, res) => {
    if (!validMediaId(req.params?.id) || Object.keys(req.query || {}).length) throw submissionError(404, 'Image unavailable.');
    const db = getDb(), uid = privateAccess ? await authenticate(req) : null;
    const asset = await db.runTransaction(async tx => {
      const actor = privateAccess ? await account(tx, db, uid) : null;
      const data = (await tx.get(mediaRef(db, req.params.id))).data();
      if (!data || data.path !== `product-media/${req.params.id}.webp` || !validMediaId(data.processedDigest)) throw submissionError(404, 'Image unavailable.');
      if (privateAccess) {
        if (!actor.admin && data.uid !== uid) throw submissionError(403, 'Image is private.');
        if (!['ready', 'pending', 'published'].includes(data.state)) throw submissionError(404, 'Image unavailable.');
      } else {
        if (data.state !== 'published' || !data.productId) throw submissionError(404, 'Image unavailable.');
        const product = (await tx.get(db.collection('products').doc(data.productId))).data();
        if (!product || product.image_asset_id !== req.params.id || !evaluateProductVisibility(product).visible) throw submissionError(404, 'Image unavailable.');
      }
      return data;
    });
    const bytes = await storage.read(asset.path);
    if (bytes.length !== asset.bytes || mediaDigest(bytes) !== asset.processedDigest) throw submissionError(503, 'Image integrity check failed.');
    res.set('Content-Type', 'image/webp'); res.set('X-Content-Type-Options', 'nosniff');
    // No shared cache for pending bytes; short public cache bounds retired visibility.
    res.set('Cache-Control', privateAccess ? 'private, no-store' : 'public, max-age=300');
    // Only verified published bytes may override Helmet's same-origin default.
    if (!privateAccess) res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.status(200).send(bytes);
  });
  return { upload, privateImage: read(true), publicImage: read(false) };
}
