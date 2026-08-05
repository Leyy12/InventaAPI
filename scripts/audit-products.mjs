/**
 * audit-products.mjs
 *
 * Comprehensive read-only audit of the Firestore "products" collection.
 * No writes. Pure report.
 *
 * Detection Levels:
 *   1. EXACT    — normalized Name + Brand identical         → "Definite duplicates"
 *   2. FUZZY-A  — Name ≥85% similar, brand differs         → "Likely duplicates"
 *   3. FUZZY-B  — Name 80-85%, brand also similar ≥70%     → "Likely duplicates"
 *   4. CROSS    — similar Name + same Category + price ±20% → "Possible duplicates"
 *   5. FUZZY-C  — Name 70-80% similar, different brand     → "Possible duplicates"
 *
 * Usage:
 *   node scripts/audit-products.mjs
 *   node scripts/audit-products.mjs > audit-report.txt   (save to file)
 */

import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const db = getFirestore();

// ── String helpers ────────────────────────────────────────────────────────────
const norm = (s = '') =>
  String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[!,.']/g, '');

const isBlank = (s) => !norm(s);

/** Levenshtein distance */
function levenshtein(a, b) {
  const s1 = norm(a), s2 = norm(b);
  const m = s1.length, n = s2.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = s1[i-1] === s2[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

/** Similarity score 0–100 (percent) */
function sim(a, b) {
  const s1 = norm(a), s2 = norm(b);
  if (s1 === s2) return 100;
  const maxLen = Math.max(s1.length, s2.length);
  if (!maxLen) return 100;
  return Math.round((1 - levenshtein(s1, s2) / maxLen) * 100);
}

// ── Product helpers ───────────────────────────────────────────────────────────
const getName     = (d) => d.name || d.product || '';
const getBrand    = (d) => {
  const b = d.brand || d.attributes?.brand || '';
  return ['—', '-', 'n/a'].includes(norm(b)) ? '' : b;
};
const getCategory = (d) => d.category || d.attributes?.category || '';
const getStatus   = (d) => d.status || (d.is_active === false ? 'Archived' : 'Active');

function getMinPrice(d) {
  const prices = [];
  if (Array.isArray(d.variants) && d.variants.length) {
    d.variants.forEach(v => {
      const n = parseFloat(String(v.price ?? '').replace(/[^0-9.]/g, ''));
      if (!isNaN(n)) prices.push(n);
    });
  }
  if (!prices.length) {
    const n = parseFloat(String(d.price ?? d.attributes?.price ?? '').replace(/[^0-9.]/g, ''));
    if (!isNaN(n)) prices.push(n);
  }
  return prices.length ? Math.min(...prices) : null;
}

function getVariantSummary(d) {
  if (Array.isArray(d.variants) && d.variants.length) {
    return d.variants.map(v => {
      const parts = [v.flavor || v.value, v.size].filter(Boolean).join(' / ');
      const price = v.price != null ? ` ₱${parseFloat(String(v.price)).toFixed(2)}` : '';
      return `  • ${parts || '(unnamed)'}${price}`;
    }).join('\n');
  }
  const parts = [d.flavor || d.variant, d.size].filter(Boolean).join(' / ');
  const price = d.price != null ? ` ₱${parseFloat(String(d.price)).toFixed(2)}` : '';
  return `  • ${parts || '(no variant)'}${price}`;
}

function formatDoc(item) {
  const d = item.data;
  const ts = d.createdAt?.toDate?.()?.toISOString().slice(0, 10) ?? 'unknown';
  return [
    `  ID       : ${item.id}`,
    `  Name     : ${getName(d)}`,
    `  Brand    : ${getBrand(d) || '(blank)'}`,
    `  Category : ${getCategory(d) || '(blank)'}`,
    `  Status   : ${getStatus(d)}`,
    `  Price    : ${getMinPrice(d) != null ? '₱' + getMinPrice(d).toFixed(2) : '—'}`,
    `  Variants :`,
    getVariantSummary(d),
    `  Created  : ${ts}`,
  ].join('\n');
}

// ── Separator helpers ─────────────────────────────────────────────────────────
const HR  = '─'.repeat(60);
const HR2 = '═'.repeat(60);

// ── Dedup helper (avoid reporting same pair twice) ────────────────────────────
function pairKey(idA, idB) {
  return [idA, idB].sort().join('|||');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log('\n' + HR2);
  console.log('  PRODUCT CATALOG AUDIT REPORT');
  console.log('  ' + new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }));
  console.log(HR2 + '\n');

  const snap = await db.collection('products').get();
  const all  = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  console.log(`Total documents fetched: ${all.length}\n`);

  // ────────────────────────────────────────────────────────────────────────────
  // BUCKET 1: DEFINITE duplicates — exact normalized Name + Brand
  // ────────────────────────────────────────────────────────────────────────────
  const exactGroups = new Map();
  all.forEach(item => {
    const key = `${norm(getName(item.data))}|||${norm(getBrand(item.data))}`;
    if (!exactGroups.has(key)) exactGroups.set(key, []);
    exactGroups.get(key).push(item);
  });
  const definite = [...exactGroups.values()].filter(g => g.length > 1);

  console.log(HR2);
  console.log(`  BUCKET 1 — DEFINITE DUPLICATES (Exact Name + Brand match)`);
  console.log(`  Count: ${definite.length} group(s), ${definite.reduce((s, g) => s + g.length - 1, 0)} extra docs`);
  console.log(HR2);

  if (definite.length === 0) {
    // console.log('\n  ✅ None found.\n');
  } else {
    definite.forEach((group, gi) => {
      // console.log(`\n[D${gi+1}] "${getName(group[0].data)}" [${getBrand(group[0].data) || 'no brand'}] — ${group.length} documents`);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Pre-compute: pick one representative per exact-group for cross-comparison
  // (avoids re-flagging docs already in exact groups as "likely duplicates" of
  // each other — they're already in Bucket 1)
  // ────────────────────────────────────────────────────────────────────────────
  const repItems = [...exactGroups.values()].map(g => ({
    rep: g[0],
    group: g,
    allIds: new Set(g.map(d => d.id)),
  }));

  const seenPairs = new Set();
  const likely    = [];   // 85%+ name sim, or 80%+ name + 70%+ brand
  const possible  = [];   // 70-85% name sim OR cross-check hits

  // ────────────────────────────────────────────────────────────────────────────
  // BUCKET 2+3+5: Fuzzy name matching across groups
  // ────────────────────────────────────────────────────────────────────────────
  for (let i = 0; i < repItems.length; i++) {
    for (let j = i + 1; j < repItems.length; j++) {
      const A = repItems[i];
      const B = repItems[j];
      const pkA = [...A.allIds].sort()[0];
      const pkB = [...B.allIds].sort()[0];
      const pk  = pairKey(pkA, pkB);
      if (seenPairs.has(pk)) continue;

      const nameA = getName(A.rep.data);
      const nameB = getName(B.rep.data);
      const brA   = getBrand(A.rep.data);
      const brB   = getBrand(B.rep.data);
      const catA  = norm(getCategory(A.rep.data));
      const catB  = norm(getCategory(B.rep.data));

      const nameSim  = sim(nameA, nameB);
      const brandSim = (isBlank(brA) || isBlank(brB)) ? 0 : sim(brA, brB);

      // Skip if they are the same exact group (already in Bucket 1)
      if (pkA === pkB) continue;

      // ── LEVEL 2: Name ≥85% similar, brands differ ──────────────────────────
      if (nameSim >= 85 && norm(brA) !== norm(brB)) {
        seenPairs.add(pk);
        likely.push({
          reason: `Name ${nameSim}% similar, different brand`,
          nameSim, brandSim, catMatch: catA && catB && catA === catB,
          A, B,
        });
        continue;
      }

      // ── LEVEL 3: Name 80-85% AND brand similarity ≥70% ────────────────────
      if (nameSim >= 80 && nameSim < 85 && brandSim >= 70) {
        seenPairs.add(pk);
        likely.push({
          reason: `Name ${nameSim}% similar + brand ${brandSim}% similar`,
          nameSim, brandSim, catMatch: catA && catB && catA === catB,
          A, B,
        });
        continue;
      }

      // ── LEVEL 5: Name 70-85% similar (other cases) → possible ─────────────
      if (nameSim >= 70 && nameSim < 85) {
        seenPairs.add(pk);
        possible.push({
          reason: `Name ${nameSim}% similar`,
          nameSim, brandSim, catMatch: catA && catB && catA === catB,
          A, B,
          crossCheck: false,
        });
        continue;
      }
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // BUCKET 4: Cross-check — same Category + price within 20% + name ≥60%
  // ────────────────────────────────────────────────────────────────────────────
  for (let i = 0; i < repItems.length; i++) {
    for (let j = i + 1; j < repItems.length; j++) {
      const A = repItems[i];
      const B = repItems[j];
      const pkA = [...A.allIds].sort()[0];
      const pkB = [...B.allIds].sort()[0];
      const pk  = pairKey(pkA, pkB);
      if (seenPairs.has(pk)) continue;  // already reported

      const nameA = getName(A.rep.data);
      const nameB = getName(B.rep.data);
      const catA  = norm(getCategory(A.rep.data));
      const catB  = norm(getCategory(B.rep.data));
      const prA   = getMinPrice(A.rep.data);
      const prB   = getMinPrice(B.rep.data);

      if (!catA || !catB || catA !== catB) continue;
      if (prA == null || prB == null) continue;

      const pricePct = Math.abs(prA - prB) / Math.max(prA, prB);
      if (pricePct > 0.20) continue;

      const nameSim = sim(nameA, nameB);
      if (nameSim < 60) continue;

      seenPairs.add(pk);
      possible.push({
        reason: `Category match + price within ${Math.round(pricePct * 100)}% + name ${nameSim}% similar`,
        nameSim,
        brandSim: sim(getBrand(A.rep.data), getBrand(B.rep.data)),
        catMatch: true,
        A, B,
        crossCheck: true,
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Print BUCKET 2 — LIKELY DUPLICATES
  // ────────────────────────────────────────────────────────────────────────────
  let bucket2Output = '';
  bucket2Output += '\n' + HR2 + '\n';
  bucket2Output += `  BUCKET 2 — LIKELY DUPLICATES (85%+ name similarity or name+brand both high)\n`;
  bucket2Output += `  Count: ${likely.length} pair(s)\n`;
  bucket2Output += HR2 + '\n';

  if (likely.length === 0) {
    bucket2Output += '\n  ✅ None found.\n\n';
  } else {
    likely.forEach((entry, idx) => {
      const { reason, nameSim, brandSim, catMatch, A, B } = entry;
      const allDocsA = A.group.length;
      const allDocsB = B.group.length;
      bucket2Output += `\n[L${idx+1}] ${reason}\n`;
      bucket2Output += `  Category match: ${catMatch ? 'YES ✓' : 'no'}\n`;
      bucket2Output += `\n  GROUP A (${allDocsA} doc${allDocsA > 1 ? 's' : ''}):\n`;
      A.group.forEach(item => { bucket2Output += '\n' + formatDoc(item) + '\n'; });
      bucket2Output += `\n  GROUP B (${allDocsB} doc${allDocsB > 1 ? 's' : ''}):\n`;
      B.group.forEach(item => { bucket2Output += '\n' + formatDoc(item) + '\n'; });
      bucket2Output += '\n' + HR + '\n';
    });
  }
  
  fs.writeFileSync('bucket-2-results.txt', bucket2Output, 'utf8');
  console.log('Wrote bucket-2-results.txt');

  // ────────────────────────────────────────────────────────────────────────────
  // Print BUCKET 3 — POSSIBLE DUPLICATES
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n' + HR2);
  console.log(`  BUCKET 3 — POSSIBLE DUPLICATES (70–85% name similarity or cross-check)`);
  console.log(`  Count: ${possible.length} pair(s)`);
  console.log(HR2);

  if (possible.length === 0) {
    // console.log('\n  ✅ None found.\n');
  } else {
    possible.forEach((entry, idx) => {
      // no-op
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Final summary
  // ────────────────────────────────────────────────────────────────────────────
  const definiteDocs  = definite.reduce((s, g) => s + g.length, 0);
  const definiteExtra = definite.reduce((s, g) => s + g.length - 1, 0);
  const likelyExtra   = likely.reduce((s, e) => {
    // Count all docs in each side beyond 1
    return s + Math.max(0, e.A.group.length - 1) + Math.max(0, e.B.group.length - 1);
  }, 0);

  const estAfterDefinite = all.length - definiteExtra;
  const estAfterAll      = all.length - definiteExtra - likelyExtra;

  console.log('\n' + HR2);
  console.log('  FINAL SUMMARY');
  console.log(HR2);
  console.log(`\n  Total documents in collection         : ${all.length}`);
  console.log(`\n  BUCKET 1 — Definite duplicates`);
  console.log(`    Groups found                         : ${definite.length}`);
  console.log(`    Extra documents (to be removed)      : ${definiteExtra}`);
  console.log(`    Estimated docs after merging Bucket 1: ${estAfterDefinite}`);
  console.log(`\n  BUCKET 2 — Likely duplicates`);
  console.log(`    Pairs found                          : ${likely.length}`);
  console.log(`    (Requires human review before merge)`);
  console.log(`\n  BUCKET 3 — Possible duplicates`);
  console.log(`    Pairs found                          : ${possible.length}`);
  console.log(`    (Requires careful human review)`);
  console.log(`\n  Estimated final count (after Buckets 1+2 if all approved):`);
  console.log(`    ${estAfterAll} documents`);
  console.log('\n  ⚠️  This is a READ-ONLY report. No database changes were made.');
  console.log('  To execute Bucket 1 merges: DRY_RUN=false node scripts/migrate-variants.mjs\n');
}

run().catch(e => { console.error('Audit failed:', e); process.exit(1); });
