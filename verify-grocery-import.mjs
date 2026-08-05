/**
 * Verify Grocery Import
 * 1. Check total Grocery product count
 * 2. Check for duplicate SKUs across ALL products
 * 3. Verify GR-004 variants show Flavor format
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

console.log('🔍 VERIFICATION REPORT\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function verify() {
  // -------------------------------------------------------------------------
  // 1. Total Grocery Product Count
  // -------------------------------------------------------------------------
  console.log('1️⃣ GROCERY PRODUCT COUNT\n');
  
  const grocerySnapshot = await db.collection('products')
    .where('segment', '==', 'Grocery')
    .get();
  
  console.log(`   Total Grocery products: ${grocerySnapshot.size}`);
  console.log(`   Expected: 33 (5 existing + 28 new)\n`);
  
  if (grocerySnapshot.size === 33) {
    console.log('   ✅ Count matches expected\n');
  } else {
    console.log(`   ⚠️  Count mismatch! Expected 33, got ${grocerySnapshot.size}\n`);
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // -------------------------------------------------------------------------
  // 2. Check for Duplicate SKUs (ALL products, any segment)
  // -------------------------------------------------------------------------
  console.log('2️⃣ DUPLICATE SKU CHECK (ALL SEGMENTS)\n');
  
  const allProductsSnapshot = await db.collection('products').get();
  const skuMap = new Map();
  const duplicates = [];
  
  allProductsSnapshot.forEach(doc => {
    const data = doc.data();
    const productSku = data.sku;
    
    // Check product-level SKU
    if (skuMap.has(productSku)) {
      duplicates.push({ sku: productSku, type: 'product', products: [skuMap.get(productSku), doc.id] });
    } else {
      skuMap.set(productSku, doc.id);
    }
    
    // Check variant SKUs
    if (data.variants && data.variants.length > 0) {
      data.variants.forEach(variant => {
        if (skuMap.has(variant.sku)) {
          duplicates.push({ sku: variant.sku, type: 'variant', products: [skuMap.get(variant.sku), doc.id] });
        } else {
          skuMap.set(variant.sku, doc.id);
        }
      });
    }
  });
  
  console.log(`   Total SKUs checked: ${skuMap.size}`);
  console.log(`   Duplicate SKUs found: ${duplicates.length}\n`);
  
  if (duplicates.length === 0) {
    console.log('   ✅ No duplicate SKUs found\n');
  } else {
    console.log('   ❌ DUPLICATES FOUND:\n');
    duplicates.forEach(dup => {
      console.log(`      ${dup.sku} (${dup.type}) - Products: ${dup.products.join(', ')}`);
    });
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // -------------------------------------------------------------------------
  // 3. Verify GR-004 Variants (Century Tuna Flakes)
  // -------------------------------------------------------------------------
  console.log('3️⃣ GR-004 CENTURY TUNA FLAKES VERIFICATION\n');
  
  const gr004Snapshot = await db.collection('products').where('sku', '==', 'GR-004').get();
  
  if (gr004Snapshot.empty) {
    console.log('   ❌ GR-004 not found!\n');
  } else {
    const doc = gr004Snapshot.docs[0];
    const data = doc.data();
    
    console.log(`   Name: ${data.name}`);
    console.log(`   Description: ${data.description}`);
    console.log(`   Base Price: ₱${data.price}`);
    console.log(`   Variants: ${data.variants?.length || 0}\n`);
    
    if (data.name === 'Century Tuna Flakes') {
      console.log('   ✅ Name correctly updated (removed "in Oil")\n');
    } else {
      console.log(`   ⚠️  Name not updated: "${data.name}"\n`);
    }
    
    console.log('   Variant Details:\n');
    if (data.variants && data.variants.length > 0) {
      data.variants.forEach((v, i) => {
        console.log(`   ${i + 1}. ${v.variantName}: ${v.value}`);
        console.log(`      SKU: ${v.sku}`);
        console.log(`      Price: ₱${v.price}\n`);
      });
      
      const hasFlavor = data.variants.every(v => v.variantName === 'Flavor');
      if (hasFlavor) {
        console.log('   ✅ All variants use "Flavor" variantName\n');
      } else {
        console.log('   ⚠️  Not all variants use "Flavor" variantName\n');
      }
      
      const hasOil = data.variants.some(v => v.value.includes('Oil'));
      const hasHotSpicy = data.variants.some(v => v.value.includes('Hot & Spicy'));
      const hasAfritada = data.variants.some(v => v.value.includes('Afritada'));
      
      console.log(`   Oil variant present: ${hasOil ? '✅' : '❌'}`);
      console.log(`   Hot & Spicy variant present: ${hasHotSpicy ? '✅' : '❌'}`);
      console.log(`   Afritada variant present: ${hasAfritada ? '✅' : '❌'}\n`);
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // -------------------------------------------------------------------------
  // 4. Quick Sample of New Products
  // -------------------------------------------------------------------------
  console.log('4️⃣ SAMPLE NEW PRODUCTS\n');
  
  const sampleSkus = ['GR-006', 'GR-010', 'GR-015', 'GR-023', 'GR-030'];
  
  for (const sku of sampleSkus) {
    const snapshot = await db.collection('products').where('sku', '==', sku).get();
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      console.log(`   ${sku}: ${data.name}`);
      console.log(`      Segment: ${data.segment}`);
      console.log(`      Variants: ${data.variants?.length || 0}\n`);
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

verify()
  .then(() => {
    console.log('✅ VERIFICATION COMPLETE\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
