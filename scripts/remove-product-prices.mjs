/**
 * remove-product-prices.mjs
 *
 * Products have no price in this system. This deletes the prices older product
 * documents still store (root price fields, attributes.price, and the price on
 * every variant). Nothing else on a product changes.
 *
 * Works on whichever database the API uses (DATA_BACKEND=supabase or Firebase).
 * Run `node scripts/backup-products.mjs` first if you want a copy.
 *
 * Usage:
 *   node scripts/remove-product-prices.mjs           # report only, changes nothing
 *   node scripts/remove-product-prices.mjs --apply   # delete the prices
 */

import { getFirestore, FieldValue, FieldPath, usesSupabase } from '../database/firestore.js';
import { withoutPrices } from '../services/product-contract.js';

const apply = process.argv.includes('--apply');
const PAGE = 300;
const ROOT_KEYS = ['price', 'srp', 'msrp', 'retail_price', 'selling_price', 'unit_price', 'market_price'];

// The update that removes a document's prices, or null when it has none.
export function priceRemoval(data) {
  const clean = withoutPrices(data);
  const update = {};
  for (const key of ROOT_KEYS) if (Object.hasOwn(data, key)) update[key] = FieldValue.delete();
  if (data.attributes && JSON.stringify(clean.attributes) !== JSON.stringify(data.attributes)) update.attributes = clean.attributes;
  if (Array.isArray(data.variants) && JSON.stringify(clean.variants) !== JSON.stringify(data.variants)) update.variants = clean.variants;
  return Object.keys(update).length ? update : null;
}

async function main() {
  // Firebase credentials are only needed while the data still lives in Firebase.
  if (!usesSupabase) await import('../database/firebase.js');
  const db = getFirestore();
  let cursor = null, scanned = 0, withPrices = 0;
  console.log(apply ? 'Deleting product prices…' : 'Report only (add --apply to delete). Checking products…');
  for (;;) {
    let query = db.collection('products').orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      scanned++;
      const update = priceRemoval(doc.data());
      if (!update) continue;
      withPrices++;
      if (apply) await doc.ref.update(update);
    }
    cursor = page.docs[page.docs.length - 1].id;
    if (page.size < PAGE) break;
  }
  console.log(`${scanned} products checked; ${withPrices} had a price${apply ? ' and were cleaned' : ' (run again with --apply to delete them)'}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0), error => { console.error('Failed:', error.message); process.exit(1); });
}
