/**
 * cleanup-stale-root-fields.mjs
 *
 * Removes stale root-level flat-schema fields (price, size, sku, flavor, variant,
 * expirationDate, value, variantName) from all product documents that already
 * have a `variants` array. These fields were from the old data structure and are
 * now superseded by the variants array as the single source of truth.
 *
 * Usage:
 *   DRY RUN (default):   node scripts/cleanup-stale-root-fields.mjs
 *   EXECUTE:             DRY_RUN=false node scripts/cleanup-stale-root-fields.mjs
 */

import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const DRY_RUN = process.env.DRY_RUN !== 'false';

// Fields that belong only to the old flat schema and should be removed
// once a document has a proper variants array
const STALE_FIELDS = ['price', 'size', 'sku', 'flavor', 'variant', 'value',
                      'expirationDate', 'variantName', 'image_url_variant'];

async function run() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  cleanup-stale-root-fields.mjs — ${DRY_RUN ? 'DRY RUN' : '⚡ EXECUTING'}`);
  console.log(`══════════════════════════════════════════════════\n`);

  const snap = await db.collection('products').get();
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));

  console.log(`Scanning ${docs.length} products for stale root-level fields...\n`);

  let affectedCount = 0;
  const batch = db.batch();

  for (const doc of docs) {
    const p = doc.data;

    // Only clean documents that already have a proper variants array
    if (!p.variants || p.variants.length === 0) continue;

    const foundStale = STALE_FIELDS.filter(f => p[f] !== undefined && p[f] !== null && p[f] !== '');
    if (foundStale.length === 0) continue;

    affectedCount++;
    console.log(`─────────────────────────────────────────────────`);
    console.log(`PRODUCT : "${p.name}"`);
    console.log(`ID      : ${doc.id}`);
    console.log(`Removing: ${foundStale.map(f => `${f}="${p[f]}"`).join('  |  ')}`);
    console.log('');

    if (!DRY_RUN) {
      // Build deleteFields update
      const deletePayload = {};
      foundStale.forEach(f => { deletePayload[f] = FieldValue.delete(); });
      deletePayload.updatedAt = FieldValue.serverTimestamp();
      batch.update(db.collection('products').doc(doc.id), deletePayload);
    }
  }

  if (affectedCount === 0) {
    console.log(`✅ No stale root-level fields found. All products are clean.\n`);
    return;
  }

  console.log(`Found ${affectedCount} product(s) with stale root-level fields.`);
  if (DRY_RUN) {
    console.log(`\n  ⚠️  DRY RUN — No changes made.`);
    console.log(`  To execute: DRY_RUN=false node scripts/cleanup-stale-root-fields.mjs\n`);
  } else {
    await batch.commit();
    console.log(`\n  ✅ Cleanup complete! Removed stale fields from ${affectedCount} products.\n`);
  }
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
