import { catalogError, onlyFields, plainObject } from './catalog-contract.js';
import { readCatalog, requireCatalogAdmin } from './catalog-writer.js';

// Products no longer carry a price. This one-time cleanup deletes every stored
// price, after saving a backup of each one so the change can be undone.
export const REMOVE_PRICES_CONFIRMATION = 'REMOVE ALL PRICES';
const BACKUP_CHUNK_BYTES = 700000;
const WRITE_BATCH = 200;

// Returns the prices stored on one product, or null when it has none.
export function storedPrices(data) {
  const backup = {};
  if (Object.hasOwn(data, 'price')) backup.price = data.price;
  if (plainObject(data.attributes) && Object.hasOwn(data.attributes, 'price')) backup.attributesPrice = data.attributes.price;
  const variants = Array.isArray(data.variants) ? data.variants : [];
  const variantPrices = variants.flatMap((variant, index) => plainObject(variant) && Object.hasOwn(variant, 'price')
    ? [{ index, sku: variant.sku ?? null, price: variant.price }] : []);
  if (variantPrices.length) backup.variants = variantPrices;
  return Object.keys(backup).length ? backup : null;
}

export function withoutStoredPrices(data) {
  const { price, ...product } = data;
  if (plainObject(product.attributes)) { const { price: attributePrice, ...attributes } = product.attributes; product.attributes = attributes; }
  if (Array.isArray(product.variants)) product.variants = product.variants.map(variant => {
    if (!plainObject(variant)) return variant;
    const { price: variantPrice, ...rest } = variant;
    return rest;
  });
  return product;
}

function chunkBySize(entries) {
  const chunks = [[]];
  let size = 0;
  for (const entry of entries) {
    const bytes = Buffer.byteLength(JSON.stringify(entry));
    if (size + bytes > BACKUP_CHUNK_BYTES && chunks.at(-1).length) { chunks.push([]); size = 0; }
    chunks.at(-1).push(entry); size += bytes;
  }
  return chunks;
}

export async function removeStoredPrices({ db, uid, body, at }) {
  onlyFields(body || {}, ['confirm']);
  if (body?.confirm !== REMOVE_PRICES_CONFIRMATION) throw catalogError(400, `Send confirm: "${REMOVE_PRICES_CONFIRMATION}" to remove every stored price.`);
  const records = await db.runTransaction(async tx => { await requireCatalogAdmin(tx, db, uid); return readCatalog(tx, db); });
  const backup = records.flatMap(record => { const prices = storedPrices(record.data); return prices ? [{ id: record.id, ...prices }] : []; });
  const backupId = `prices_${at.replace(/[^0-9]/gu, '')}`;
  if (!backup.length) return { backupId: null, products: 0, backup: [] };
  // The backup is saved in full before any price is deleted.
  const chunks = chunkBySize(backup);
  await db.runTransaction(async tx => {
    await requireCatalogAdmin(tx, db, uid);
    const head = db.collection('catalog_price_backups').doc(backupId);
    tx.set(head, { uid, createdAt: at, products: backup.length, chunks: chunks.length });
    chunks.forEach((entries, index) => tx.set(db.collection('catalog_price_backups').doc(`${backupId}_chunk${index}`), { uid, entries }));
  });
  for (let start = 0; start < backup.length; start += WRITE_BATCH) {
    const ids = backup.slice(start, start + WRITE_BATCH).map(entry => entry.id);
    await db.runTransaction(async tx => {
      await requireCatalogAdmin(tx, db, uid);
      const refs = ids.map(id => db.collection('products').doc(id));
      const docs = await Promise.all(refs.map(ref => tx.get(ref)));
      docs.forEach((doc, index) => { const data = doc.data(); if (data && storedPrices(data)) tx.set(refs[index], withoutStoredPrices(data)); });
    });
  }
  return { backupId, products: backup.length, backup };
}
