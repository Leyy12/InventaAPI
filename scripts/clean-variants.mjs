/**
 * clean-variants.mjs
 * 
 * Scans all products for variant-level anomalies:
 * 1. Flavor matches the product name (e.g. "Bear Brand Fortified Powdered Milk" as flavor)
 * 2. Duplicate variants (e.g. "Sweetened" 300ml vs "Sweetened 300ml" "")
 *
 * It will standardize these and update the documents.
 */

import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const DRY_RUN = process.env.DRY_RUN !== 'false';

const norm = (s = '') => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[!,.']/g, '');

async function run() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  clean-variants.mjs — ${DRY_RUN ? 'DRY RUN' : '⚡ EXECUTING'}`);
  console.log(`══════════════════════════════════════════════════\n`);

  const snap = await db.collection('products').get();
  const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));

  console.log(`Scanning ${docs.length} products for variant anomalies...\n`);

  let affectedCount = 0;
  const batch = db.batch();

  docs.forEach(doc => {
    const p = doc.data;
    if (!p.variants || p.variants.length === 0) return;

    let needsUpdate = false;
    let oldVariants = JSON.parse(JSON.stringify(p.variants)); // deep copy for comparison output
    let newVariants = [];
    
    // 1. Clean individual variants
    p.variants.forEach(v => {
      let f = (v.flavor || v.value || '').trim();
      let s = (v.size || '').trim();
      let pr = typeof v.price === 'number' ? v.price : parseFloat(String(v.price || '0').replace(/[^0-9.]/g, '')) || 0;
      
      // Fix flavor == product name anomaly (or containing it)
      const pNameNorm = norm(p.name);
      const fNorm = norm(f);
      if (
        fNorm && (
          fNorm === pNameNorm || 
          fNorm.includes(pNameNorm) || 
          (pNameNorm.includes(fNorm) && fNorm.split(' ').length >= 3) ||
          (fNorm.includes('powdered milk') && pNameNorm.includes('milk'))
        )
      ) {
        // Flavor shouldn't be the product name. Change to "Original" or blank if size exists.
        f = s ? "" : "Original";
        needsUpdate = true;
      }
      
      // Fix size embedded in flavor (e.g. "Sweetened 300ml" with size "")
      const sizeMatch = f.match(/(\d+(?:\.\d+)?\s*(?:g|ml|l|kg|oz|lbs?))$/i);
      if (sizeMatch && !s) {
        s = sizeMatch[1].trim();
        f = f.replace(sizeMatch[1], '').trim();
        needsUpdate = true;
      }

      // Format size (add space between number and unit)
      const oldS = s;
      s = s.replace(/^(\d+(?:\.\d+)?)([a-zA-Z]+)$/, '$1 $2');
      if (oldS !== s) needsUpdate = true;
      
      if (!f && !s) f = "Original"; // fallback if both are empty

      newVariants.push({
        ...v,
        flavor: f,
        size: s,
        price: pr
      });
    });

    // 2. Deduplicate variants
    const deduped = [];
    const seen = new Set();
    
    newVariants.forEach(v => {
      // Normalize for deduplication
      const key = `${norm(v.flavor)}|${norm(v.size)}|${v.price}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(v);
      } else {
        needsUpdate = true; // A duplicate was removed
      }
    });

    if (needsUpdate) {
      affectedCount++;
      console.log(`─────────────────────────────────────────────────`);
      console.log(`PRODUCT : "${p.name}"`);
      console.log(`ID      : ${doc.id}`);
      console.log(`Old Variants:`);
      oldVariants.forEach((v, i) => console.log(`  [${i+1}] flavor="${v.flavor || v.value || ''}" size="${v.size || ''}" price=${v.price}`));
      console.log(`New Variants:`);
      deduped.forEach((v, i) => console.log(`  [${i+1}] flavor="${v.flavor}" size="${v.size}" price=${v.price}`));
      console.log('');
      
      if (!DRY_RUN) {
        batch.update(db.collection('products').doc(doc.id), {
          variants: deduped,
          updatedAt: FieldValue.serverTimestamp()
        });
      }
    }
  });

  if (affectedCount === 0) {
    console.log(`✅ No variant anomalies found. All 105 products are clean.\n`);
  } else {
    console.log(`Found ${affectedCount} product(s) needing variant cleanup.`);
    if (DRY_RUN) {
      console.log(`\n  ⚠️  DRY RUN — No changes made.`);
      console.log(`  To execute: DRY_RUN=false node scripts/clean-variants.mjs\n`);
    } else {
      await batch.commit();
      console.log(`\n  ✅ Cleanup complete! ${affectedCount} products updated.\n`);
    }
  }
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
