import { createHash } from 'node:crypto';
import { submissionError } from './product-submission-contract.js';

export const mediaDigest = value => createHash('sha256').update(value).digest('hex');
export const mediaOperationId = (uid, key) => mediaDigest(JSON.stringify([uid, key]));
export function validMediaId(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
export function mediaRef(db, id) {
  if (!validMediaId(id)) throw submissionError(400, 'Invalid image asset ID.');
  return db.collection('product_media').doc(id);
}
export async function readReadyMedia(tx, db, id) {
  const ref = mediaRef(db, id), data = (await tx.get(ref)).data();
  if (!data || data.version !== 1 || !['ready', 'pending', 'published'].includes(data.state)
    || data.path !== `product-media/${id}.webp` || !validMediaId(data.processedDigest)
    || typeof data.publicUrl !== 'string' || !data.publicUrl.endsWith(`/api/v1/product-media/${id}/image`)) {
    throw submissionError(409, 'Image is not ready; retry the original upload.');
  }
  return { ref, data };
}
export async function prepareSubmissionMedia({ tx, db, uid, operationId, submissionId, content, at }) {
  if (!content.image_asset_id) return () => {};
  if (content.image_url) throw submissionError(400, 'Choose an uploaded image or an external URL.');
  const { ref, data } = await readReadyMedia(tx, db, content.image_asset_id);
  if (data.uid !== uid || data.workflow !== 'submission' || data.operationId !== operationId
    || data.state !== 'ready' || data.submissionId) throw submissionError(403, 'Image does not belong to this submission.');
  return () => tx.update(ref, { state: 'pending', submissionId, updatedAt: at });
}
export async function prepareRejectedMedia({ tx, db, content, submissionId, at }) {
  if (!content.image_asset_id) return () => {};
  const { ref, data } = await readReadyMedia(tx, db, content.image_asset_id);
  if (data.state !== 'pending' || data.submissionId !== submissionId) throw submissionError(409, 'Submission image association changed.');
  return () => tx.update(ref, { state: 'rejected', open: false, updatedAt: at });
}

// All object bytes are immutable and private before this transaction. Publishing
// is a Firestore binding, not a pretend atomic Storage-copy + Firestore operation.
export async function prepareCatalogMedia({ tx, db, uid, productId, payload, previous, action, submissionId, at }) {
  const oldId = previous?.image_asset_id || '';
  let id = payload.image_asset_id ?? oldId;
  // An explicitly different/empty external URL replaces the prior managed image.
  if (Object.hasOwn(payload, 'image_url') && payload.image_url !== previous?.image_url && !Object.hasOwn(payload, 'image_asset_id')) id = '';
  if (action === 'delete') id = '';
  const writes = [];
  if (id) {
    const { ref, data } = await readReadyMedia(tx, db, id);
    if (payload.image_url && payload.image_url !== data.publicUrl) throw submissionError(400, 'Choose an uploaded image or an external URL.');
    if (id === oldId) {
      if (data.state !== 'published' || data.productId !== productId) throw submissionError(409, 'Existing image binding changed.');
    } else {
    const ownAdmin = data.workflow === 'catalog' && data.uid === uid && data.state === 'ready';
    const reviewed = data.workflow === 'submission' && data.state === 'pending' && submissionId && data.submissionId === submissionId;
    if (!ownAdmin && !reviewed) throw submissionError(403, 'This image cannot be published by this operation.');
    writes.push(() => tx.update(ref, { state: 'published', open: false, productId, updatedAt: at }));
    }
    payload.image_url = data.publicUrl;
  }
  if (oldId && oldId !== id) {
    const { ref, data } = await readReadyMedia(tx, db, oldId);
    if (data.state !== 'published' || data.productId !== productId) throw submissionError(409, 'Existing image binding changed.');
    writes.push(() => tx.update(ref, { state: 'retired', open: false, updatedAt: at }));
  }
  if (id || oldId || Object.hasOwn(payload, 'image_asset_id')) payload.image_asset_id = id;
  return () => writes.forEach(write => write());
}
