/**
 * migrate-variants.mjs  (v2)
 *
 * One-time migration: merge "one document per variant" duplicates
 * (same normalized Name + Brand) into a single product document
 * with a unified Variants array.
 *
 * Matching Logic:
 *   EXACT MERGE    → same Name AND same Brand (both normalized: trimmed + lowercased)
 *   BRAND FALLBACK → same Name, BOTH have empty/blank brand → still auto-merges
 *   MANUAL REVIEW  → same Name but different non-empty brands (possible mismatch)
 *   FUZZY FLAG     → name similarity ≥70% but not exact → flagged for review only
 *
 * Usage:
 *   DRY RUN (preview only, no DB writes):
 *     node scripts/migrate-variants.mjs
 *
 *   EXECUTE (actually merges and deletes):
 *     DRY_RUN=false node scripts/migrate-variants.mjs
 */

import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const db      = getFirestore();
const DRY_RUN = process.env.DRY_RUN !== 'false';

// ── Helpers ───────────────────────────────────────────────────────────────────
const norm     = (s = '') => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
const getProductName = (d) => d.name || d.product || '';
const getBrand       = (d) => {
  const b = d.brand || d.attributes?.brand || '';
  return norm(b) === '—' ? '' : b; // treat "—" as blank
};

const isBlankBrand = (d) => !norm(getBrand(d));

// Group key: normalized name + brand (empty brand allowed as own group)
const exactKey = (d) => `${norm(getProductName(d))}|||${norm(getBrand(d))}`;

// Levenshtein similarity (0–1) for fuzzy detection
function similarity(a, b) {
  const s1 = norm(a), s2 = norm(b);
  if (s1 === s2) return 1;
  const len = Math.max(s1.length, s2.length);
  if (!len) return 1;
  const dp = Array.from({ length: s1.length + 1 }, (_, i) =>
    Array.from({ length: s2.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      dp[i][j] = s1[i-1] === s2[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return 1 - dp[s1.length][s2.length] / len;
}

function extractVariants(data) {
  if (Array.isArray(data.variants) && data.variants.length > 0) return data.variants;
  if (data.flavor || data.size || data.price != null) {
    return [{
      flavor: (data.flavor || '').trim(),
      size:   (data.size   || '').trim(),
      price:  typeof data.price === 'number'
        ? data.price
        : parseFloat(String(data.price || '0').replace(/[^0-9.]/g, '')) || 0,
    }];
  }
  return [];
}

function toTimestampMs(ts) {
  if (!ts) return Infinity;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  return Infinity;
}

function dedupeVariants(variants) {
  const seen = new Set();
  return variants.filter(v => {
    const key = `${norm(v.flavor || '')}|${norm(v.size || '')}|${v.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(v => ({
    ...v,
    flavor: (v.flavor || '').trim(),
    size:   (v.size   || '').trim(),
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  migrate-variants.mjs v2 — ${DRY_RUN ? 'DRY RUN (no writes)' : '⚡ EXECUTING'}`);
  console.log(`══════════════════════════════════════════════════\n`);

  const snap = await db.collection('products').get();
  console.log(`Fetched ${snap.size} total documents.\n`);

  const allDocs = snap.docs.map(d => ({ id: d.id, data: d.data() }));

  // ── Step 1: Exact-match grouping (normalized Name + Brand) ─────────────────
  const exactGroups = new Map();
  allDocs.forEach(item => {
    const key = exactKey(item.data);
    if (!exactGroups.has(key)) exactGroups.set(key, []);
    exactGroups.get(key).push(item);
  });

  // ── Step 2: Separate auto-merge candidates from manual-review ─────────────
  // Split into:
  //   - groups where ALL have the same normalized Brand (including all-blank) → AUTO MERGE
  //   - not needed here since exactKey already normalizes brand

  const autoMergeGroups = [...exactGroups.values()].filter(g => g.length > 1);

  // ── Step 3: Cross-group fuzzy "possible duplicates" detection ─────────────
  // Compare products that have different brands but similar names
  const groupList = [...exactGroups.values()];
  const manualReview = [];

  // Use representative doc per group for cross-comparison
  const representatives = groupList.map(g => ({
    name:  getProductName(g[0].data),
    brand: getBrand(g[0].data),
    docs:  g,
    key:   exactKey(g[0].data),
  }));

  const flagged = new Set();
  for (let i = 0; i < representatives.length; i++) {
    for (let j = i + 1; j < representatives.length; j++) {
      const a = representatives[i];
      const b = representatives[j];
      if (flagged.has(a.key + '|||' + b.key) || flagged.has(b.key + '|||' + a.key)) continue;

      const nameSim  = similarity(a.name, b.name);
      const sameNorm = norm(a.name) === norm(b.name);

      // Case 1: Same normalized name, different non-empty brands → manual review
      if (sameNorm && norm(a.brand) !== norm(b.brand) &&
          !isBlankBrand(a.docs[0].data) && !isBlankBrand(b.docs[0].data)) {
        manualReview.push({
          reason: 'Same name, different brands',
          a: { name: a.name, brand: a.brand, docCount: a.docs.length, ids: a.docs.map(d => d.id) },
          b: { name: b.name, brand: b.brand, docCount: b.docs.length, ids: b.docs.map(d => d.id) },
        });
        flagged.add(a.key + '|||' + b.key);
      }

      // Case 2: Fuzzy name similarity ≥ 0.70 but not exact → flag for review
      else if (!sameNorm && nameSim >= 0.70) {
        manualReview.push({
          reason: `Similar names (${Math.round(nameSim * 100)}% match)`,
          a: { name: a.name, brand: a.brand, docCount: a.docs.length, ids: a.docs.map(d => d.id) },
          b: { name: b.name, brand: b.brand, docCount: b.docs.length, ids: b.docs.map(d => d.id) },
        });
        flagged.add(a.key + '|||' + b.key);
      }
    }
  }

  // ── Print Auto-Merge Groups ────────────────────────────────────────────────
  if (autoMergeGroups.length === 0) {
    console.log('✅ No auto-mergeable duplicates found.\n');
  } else {
    console.log(`Found ${autoMergeGroups.length} group(s) for AUTO-MERGE (${autoMergeGroups.reduce((s, g) => s + g.length - 1, 0)} docs to delete):\n`);
  }

  const batchOps = [];

  for (const group of autoMergeGroups) {
    group.sort((a, b) => toTimestampMs(a.data.createdAt) - toTimestampMs(b.data.createdAt));

    const base        = group[0];
    const duplicates  = group.slice(1);
    const mergedVars  = dedupeVariants(group.flatMap(item => extractVariants(item.data)));

    console.log(`─────────────────────────────────────────────────`);
    console.log(`PRODUCT : "${getProductName(base.data)}" [${getBrand(base.data) || '(no brand)'}]`);
    console.log(`Base ID : ${base.id}`);
    console.log(`  createdAt: ${base.data.createdAt?.toDate?.() ?? 'unknown'}`);
    console.log(`Duplicates to DELETE (${duplicates.length}):`);
    duplicates.forEach(d => console.log(`  • ${d.id}  createdAt: ${d.data.createdAt?.toDate?.() ?? 'unknown'}`));
    console.log(`Merged Variants (${mergedVars.length}):`);
    mergedVars.forEach((v, i) => {
      const extras = [
        v.sku            ? `sku=${v.sku}` : null,
        v.expirationDate ? `exp=${v.expirationDate}` : null,
      ].filter(Boolean).join('  ');
      console.log(`  [${i+1}] flavor="${v.flavor}"  size="${v.size}"  price=${v.price}  ${extras}`);
    });
    console.log('');

    batchOps.push({ base: base.id, mergedVars, deleteIds: duplicates.map(d => d.id) });
  }

  // ── Print Manual Review Section ────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════`);
  if (manualReview.length === 0) {
    console.log(`  ✅ No "possible duplicate" flags needing manual review.\n`);
  } else {
    console.log(`  ⚠️  POSSIBLE DUPLICATES — Needs Manual Review (${manualReview.length} pair(s))`);
    console.log(`  These were NOT auto-merged. Review manually before including.\n`);
    manualReview.forEach((pair, idx) => {
      console.log(`  [${idx+1}] Reason: ${pair.reason}`);
      console.log(`       A: "${pair.a.name}" [${pair.a.brand || 'no brand'}] — ${pair.a.docCount} doc(s)`);
      pair.a.ids.forEach(id => console.log(`          ID: ${id}`));
      console.log(`       B: "${pair.b.name}" [${pair.b.brand || 'no brand'}] — ${pair.b.docCount} doc(s)`);
      pair.b.ids.forEach(id => console.log(`          ID: ${id}`));
      console.log('');
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`══════════════════════════════════════════════════`);
  console.log(`Summary:`);
  console.log(`  Product groups to auto-merge : ${autoMergeGroups.length}`);
  console.log(`  Duplicate docs to delete     : ${batchOps.reduce((s, o) => s + o.deleteIds.length, 0)}`);
  console.log(`  Possible duplicates (review) : ${manualReview.length}`);

  if (DRY_RUN) {
    console.log(`\n  ⚠️  DRY RUN — No changes were made to the database.`);
    console.log(`  To execute, run: DRY_RUN=false node scripts/migrate-variants.mjs\n`);
  } else {
    // Execute in batches (Firestore limit: 500 ops per batch)
    const batch = db.batch();
    let opCount = 0;

    for (const op of batchOps) {
      batch.update(db.collection('products').doc(op.base), {
        variants:  op.mergedVars,
        updatedAt: FieldValue.serverTimestamp(),
      });
      opCount++;
      for (const id of op.deleteIds) {
        batch.delete(db.collection('products').doc(id));
        opCount++;
      }
    }

    if (opCount > 0) {
      await batch.commit();
      console.log(`\n  ✅ Migration complete!`);
      console.log(`     ${autoMergeGroups.length} products merged.`);
      console.log(`     ${batchOps.reduce((s, o) => s + o.deleteIds.length, 0)} duplicate documents deleted.\n`);
    } else {
      console.log(`\n  ℹ️  Nothing to do.\n`);
    }
  }
}

run().catch(e => { console.error('Error:', e); process.exit(1); });
