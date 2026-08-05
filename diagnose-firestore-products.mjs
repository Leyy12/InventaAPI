/**
 * READ-ONLY Diagnostic Script
 * Fetches sample products from Firestore to diagnose rendering issue
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, 'dashboard/.env.local') });

// Initialize Firebase Admin
if (!getApps().length) {
  const serviceAccountPath = resolve(__dirname, 'service-account.json');
  initializeApp({
    credential: cert(serviceAccountPath)
  });
}

const db = getFirestore();

async function diagnoseProducts() {
  console.log('========================================');
  console.log('FIRESTORE PRODUCTS DIAGNOSTIC REPORT');
  console.log('========================================\n');

  try {
    // 1. Get total count
    const allProductsSnapshot = await db.collection('products').get();
    console.log(`📊 TOTAL PRODUCTS IN FIRESTORE: ${allProductsSnapshot.size}\n`);

    // 2. Check for our new seeded products (GR-001, PHARM-009, HW-001)
    console.log('🔍 CHECKING FOR NEWLY SEEDED PRODUCTS:\n');
    
    const newProducts = ['GR-001', 'PHARM-009', 'HW-001'];
    for (const sku of newProducts) {
      const snapshot = await db.collection('products').where('sku', '==', sku).limit(1).get();
      if (snapshot.empty) {
        console.log(`   ❌ ${sku}: NOT FOUND`);
      } else {
        console.log(`   ✅ ${sku}: EXISTS (ID: ${snapshot.docs[0].id})`);
      }
    }

    // 3. Fetch 3 sample products: 1 old + 2 new
    console.log('\n========================================');
    console.log('📄 SAMPLE PRODUCT DOCUMENTS (RAW):');
    console.log('========================================\n');

    // Get first product (likely old)
    const firstProduct = allProductsSnapshot.docs[0];
    console.log('--- SAMPLE 1: First Product in Collection (Likely OLD) ---');
    console.log(`Document ID: ${firstProduct.id}`);
    console.log('Full Data:', JSON.stringify(firstProduct.data(), null, 2));
    console.log('\n');

    // Get GR-001 if exists
    const gr001Snapshot = await db.collection('products').where('sku', '==', 'GR-001').limit(1).get();
    if (!gr001Snapshot.empty) {
      console.log('--- SAMPLE 2: GR-001 (NEWLY SEEDED) ---');
      console.log(`Document ID: ${gr001Snapshot.docs[0].id}`);
      console.log('Full Data:', JSON.stringify(gr001Snapshot.docs[0].data(), null, 2));
      console.log('\n');
    }

    // Get PHARM-009 if exists
    const pharm009Snapshot = await db.collection('products').where('sku', '==', 'PHARM-009').limit(1).get();
    if (!pharm009Snapshot.empty) {
      console.log('--- SAMPLE 3: PHARM-009 (NEWLY SEEDED) ---');
      console.log(`Document ID: ${pharm009Snapshot.docs[0].id}`);
      console.log('Full Data:', JSON.stringify(pharm009Snapshot.docs[0].data(), null, 2));
      console.log('\n');
    }

    // 4. Check field presence across all products
    console.log('========================================');
    console.log('📋 FIELD PRESENCE ANALYSIS (First 10 products):');
    console.log('========================================\n');

    const sampleDocs = allProductsSnapshot.docs.slice(0, 10);
    sampleDocs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`Product ${index + 1} (${data.sku || 'NO SKU'}):`);
      console.log(`  - name: ${data.name ? '✅' : '❌ MISSING'}`);
      console.log(`  - description: ${data.description ? '✅' : '❌ MISSING'}`);
      console.log(`  - price: ${data.price !== undefined ? '✅' : '❌ MISSING'}`);
      console.log(`  - image_url: ${data.image_url ? '✅' : '❌ MISSING'}`);
      console.log(`  - segment: ${data.segment ? '✅' : '❌ MISSING'}`);
      console.log(`  - is_active: ${data.is_active !== undefined ? '✅' : '❌ MISSING'}`);
      console.log(`  - variants: ${data.variants ? `✅ (${data.variants.length} items)` : '⚪ undefined'}`);
      console.log(`  - expirationDate: ${data.expirationDate ? '✅' : '⚪ undefined'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
  }
}

diagnoseProducts()
  .then(() => {
    console.log('✅ Diagnostic complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
