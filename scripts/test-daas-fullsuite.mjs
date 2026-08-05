/**
 * test-daas-fullsuite.mjs
 * 
 * Full test suite: checks ALL products with 2+ variants and verifies that
 * root-level price/size in the DaaS response matches the lowest-price variant.
 */

import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const API_KEY = 'daas_clean_ms9t8n1k_avxawv27';
const BASE_URL = 'http://localhost:5000';

async function run() {
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  DaaS Full Test Suite — all products with 2+ variants`);
  console.log(`══════════════════════════════════════════════════\n`);

  // Fetch live catalog from the API endpoint
  const res = await fetch(`${BASE_URL}/daas/v1/catalog`, {
    headers: { 'x-api-key': API_KEY }
  });
  const body = await res.json();

  if (body.status !== 'success') {
    console.error('API Error:', body);
    process.exit(1);
  }

  const allProducts = body.products;
  const multiVariant = allProducts.filter(p => p.variants && p.variants.length >= 2);
  
  console.log(`Total products in catalog : ${allProducts.length}`);
  console.log(`Products with 2+ variants : ${multiVariant.length}\n`);

  let mismatches = 0;

  // Print header
  console.log(
    'Product Name'.padEnd(42) +
    'Vars'.padEnd(5) +
    'Base Flavor'.padEnd(22) +
    'Base Size'.padEnd(12) +
    'Root Price'.padEnd(12) +
    'Root Size'.padEnd(12) +
    'Match?'
  );
  console.log('─'.repeat(115));

  for (const p of multiVariant) {
    // Compute expected base variant (lowest price) locally
    const base = p.variants.reduce((prev, curr) => {
      const pP = typeof prev.price === 'number' ? prev.price : parseFloat(prev.price) || Infinity;
      const cP = typeof curr.price === 'number' ? curr.price : parseFloat(curr.price) || Infinity;
      return (cP < pP) ? curr : prev;
    }, p.variants[0]);

    const expectedPrice = typeof base.price === 'number' ? base.price : parseFloat(base.price) || null;
    const rootPriceMatch = p.price === expectedPrice;
    const rootSizeMatch  = (p.size || '') === (base.size || '');
    const match = rootPriceMatch && rootSizeMatch;

    if (!match) mismatches++;

    const name = (p.name || '').substring(0, 40);
    const flavor = (base.flavor || '—').substring(0, 20);
    const baseSize = (base.size || '—').substring(0, 10);
    const rootPrice = p.price != null ? `₱${p.price}` : '—';
    const rootSize  = p.size || '—';

    console.log(
      name.padEnd(42) +
      String(p.variants.length).padEnd(5) +
      flavor.padEnd(22) +
      baseSize.padEnd(12) +
      rootPrice.padEnd(12) +
      rootSize.padEnd(12) +
      (match ? '✅' : `❌ exp ₱${expectedPrice}/${base.size}`)
    );
  }

  console.log('─'.repeat(115));
  if (mismatches === 0) {
    console.log(`\n✅ ALL ${multiVariant.length} multi-variant products have correct root-level price/size!\n`);
  } else {
    console.log(`\n❌ ${mismatches} product(s) have mismatched root-level fields.\n`);
  }
}

run().catch(console.error);
