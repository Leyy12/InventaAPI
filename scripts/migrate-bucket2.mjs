/**
 * migrate-bucket2.mjs
 *
 * Merges Bucket 2 (Likely Duplicates), EXCEPT L5 and L7.
 * Standardizes variants: legacy format like "Premium 150g" becomes flavor: "Premium", size: "150 g".
 * Uses the non-blank brand (or shorter one if both have).
 *
 * Usage:
 *   DRY RUN:       node scripts/migrate-bucket2.mjs
 *   EXECUTE:       DRY_RUN=false node scripts/migrate-bucket2.mjs
 */

import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const DRY_RUN = process.env.DRY_RUN !== 'false';

const EXCLUDE_PAIRS = [
  ['9cYxY9wgC8uyh2SWH4YZ', 'UXVqXr9iSH8MTpvUBDN8'], // L5: Del Monte Paste vs Sauce
  ['A9IHwB5FiqoyXZNg8QPV', 'CKgghBf8wacWJSF3o7P1'], // L7: M&M's vs Nips
];

const norm = (s = '') => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[!,.']/g, '');

const getName = (d) => d.name || d.product || '';
const getBrand = (d) => {
  const b = d.brand || d.attributes?.brand || '';
  return ['—', '-', 'n/a'].includes(norm(b)) ? '' : b;
};

// Extracts and standardizes variants
// "Premium 150g" -> flavor: "Premium", size: "150 g"
function extractVariants(data) {
  let vars = [];
  if (Array.isArray(data.variants) && data.variants.length > 0) {
    vars = data.variants;
  } else if (data.flavor || data.size || data.price != null) {
    vars = [{
      flavor: data.flavor || data.variant || '',
      size: data.size || '',
      price: data.price
    }];
  }

  return vars.map(v => {
    let f = String(v.flavor || v.value || '').trim();
    let s = String(v.size || '').trim();
    let p = typeof v.price === 'number' ? v.price : parseFloat(String(v.price || '0').replace(/[^0-9.]/g, '')) || 0;

    // Pattern to catch sizes embedded at the end of flavor like "150g", "1.5L", "200 ml"
    const sizeMatch = f.match(/(\d+(?:\.\d+)?\s*(?:g|ml|l|kg|oz|lbs?))$/i);
    if (sizeMatch && !s) {
      s = sizeMatch[1].trim();
      f = f.replace(sizeMatch[1], '').trim();
    }
    
    // Insert space between number and unit if missing (e.g. "150g" -> "150 g")
    s = s.replace(/^(\d+(?:\.\d+)?)([a-zA-Z]+)$/, '$1 $2');

    return { flavor: f, size: s, price: p, sku: v.sku, expirationDate: v.expirationDate };
  });
}

function dedupeVariants(variants) {
  const seen = new Set();
  return variants.filter(v => {
    const key = `${norm(v.flavor)}|${norm(v.size)}|${v.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pairKey(idA, idB) {
  return [idA, idB].sort().join('|||');
}

async function run() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  migrate-bucket2.mjs — ${DRY_RUN ? 'DRY RUN' : '⚡ EXECUTING'}`);
  console.log(`══════════════════════════════════════════════════\n`);

  const snap = await db.collection('products').get();
  const all = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  
  // Find pairs that match Name (normalized), but differ in brand where one is blank
  // OR the special 555 case
  
  const mergePairs = [];
  const excludedPairs = EXCLUDE_PAIRS.map(arr => arr.sort().join('|||'));
  const seenPairs = new Set();

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const pk = pairKey(a.id, b.id);
      
      if (seenPairs.has(pk)) continue;
      
      const nA = norm(getName(a.data));
      const nB = norm(getName(b.data));
      
      if (nA === nB) {
        // Name exact match
        const brA = getBrand(a.data);
        const brB = getBrand(b.data);
        
        if (norm(brA) !== norm(brB)) {
          if (!excludedPairs.includes(pk)) {
            mergePairs.push({ a, b });
            seenPairs.add(pk);
          }
        }
      }
    }
  }

  console.log(`Found ${mergePairs.length} pairs to merge.\n`);
  
  const batch = db.batch();
  let opCount = 0;

  for (const pair of mergePairs) {
    const arr = [pair.a, pair.b].sort((x, y) => {
      const tsX = x.data.createdAt?.toMillis?.() ?? Infinity;
      const tsY = y.data.createdAt?.toMillis?.() ?? Infinity;
      return tsX - tsY;
    });

    const base = arr[0];
    const dup = arr[1];

    const brA = getBrand(base.data);
    const brB = getBrand(dup.data);
    
    // Determine final brand
    let finalBrand = '';
    if (!brA && brB) finalBrand = brB;
    else if (brA && !brB) finalBrand = brA;
    else if (brA && brB) {
      finalBrand = brA.length <= brB.length ? brA : brB;
    }
    
    // Standardize variants
    const allVars = [...extractVariants(base.data), ...extractVariants(dup.data)];
    const mergedVars = dedupeVariants(allVars);

    console.log(`─────────────────────────────────────────────────`);
    console.log(`PRODUCT : "${getName(base.data)}"`);
    console.log(`Old Brands : [${brA || '(blank)'}] & [${brB || '(blank)'}]  => Final Brand: [${finalBrand}]`);
    console.log(`Base ID : ${base.id}`);
    console.log(`DELETE  : ${dup.id}`);
    console.log(`Variants (${mergedVars.length}):`);
    mergedVars.forEach((v, i) => {
      console.log(`  [${i+1}] flavor="${v.flavor}" size="${v.size}" price=${v.price}`);
    });
    console.log('');

    if (!DRY_RUN) {
      const updateData = {
        brand: finalBrand,
        variants: mergedVars,
        updatedAt: FieldValue.serverTimestamp(),
      };
      
      if (base.data.attributes) {
        updateData.attributes = { ...base.data.attributes, brand: finalBrand };
      }

      batch.update(db.collection('products').doc(base.id), updateData);
      batch.delete(db.collection('products').doc(dup.id));
      opCount++;
    }
  }

  if (DRY_RUN) {
    console.log(`\n  ⚠️  DRY RUN — No changes made.\n`);
  } else {
    if (opCount > 0) {
      await batch.commit();
      console.log(`\n  ✅ Migration complete! Merged ${mergePairs.length} pairs.\n`);
    } else {
      console.log(`\n  ℹ️  Nothing to do.\n`);
    }
  }
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
