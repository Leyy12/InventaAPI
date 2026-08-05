/**
 * Check existing Grocery products in Firestore
 * To prevent duplicates before importing new batch
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function checkExistingGrocery() {
  console.log('🔍 CHECKING EXISTING GROCERY PRODUCTS\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const snapshot = await db.collection('products')
    .where('segment', '==', 'Grocery')
    .get();
  
  console.log(`📦 Total Grocery products: ${snapshot.size}\n`);
  
  if (snapshot.size === 0) {
    console.log('   No existing Grocery products found.\n');
    return;
  }
  
  console.log('EXISTING GROCERY PRODUCTS:\n');
  
  const products = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    products.push({
      id: doc.id,
      sku: data.sku,
      name: data.name,
      variants: data.variants?.length || 0
    });
  });
  
  // Sort by SKU
  products.sort((a, b) => a.sku.localeCompare(b.sku));
  
  products.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   SKU: ${p.sku}`);
    console.log(`   Variants: ${p.variants}`);
    console.log(`   Document ID: ${p.id}\n`);
  });
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('📋 DUPLICATE CHECK TARGETS:\n');
  console.log('   Check new batch for these product names:');
  products.forEach(p => {
    console.log(`   - ${p.name}`);
  });
  console.log('\n');
}

checkExistingGrocery()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
