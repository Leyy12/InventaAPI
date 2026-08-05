/**
 * Check exact current state of Lucky Me Pancit Canton (GR-003)
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

async function checkLuckyMe() {
  const snapshot = await db.collection('products').where('sku', '==', 'GR-003').get();
  
  if (snapshot.empty) {
    console.log('GR-003 not found');
    return;
  }
  
  const doc = snapshot.docs[0];
  const data = doc.data();
  
  console.log('📦 CURRENT GR-003 STATE:\n');
  console.log(`Name: ${data.name}`);
  console.log(`SKU: ${data.sku}`);
  console.log(`Description: ${data.description}`);
  console.log(`Base Price: ₱${data.price}\n`);
  console.log(`Variants (${data.variants?.length || 0}):\n`);
  
  if (data.variants && data.variants.length > 0) {
    data.variants.forEach((v, i) => {
      console.log(`${i + 1}. ${v.variantName}: ${v.value}`);
      console.log(`   SKU: ${v.sku}`);
      console.log(`   Price: ₱${v.price}\n`);
    });
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('🆕 NEW BATCH FLAVORS:\n');
  console.log('1. Original (60g) - ₱18.50');
  console.log('2. Kalamansi (60g) - ₱18.50');
  console.log('3. Chilimansi (60g) - ₱18.50');
  console.log('4. Sweet & Spicy (60g) - ₱18.50');
  console.log('5. Extra Hot Chili (60g) - ₱19.00\n');
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('🔍 OVERLAP ANALYSIS:\n');
  
  const existingFlavors = data.variants?.map(v => v.value.toLowerCase()) || [];
  const newFlavors = ['Original', 'Kalamansi', 'Chilimansi', 'Sweet & Spicy', 'Extra Hot Chili'];
  
  console.log('Existing flavors (normalized):');
  existingFlavors.forEach(f => console.log(`   - ${f}`));
  console.log('');
  
  const duplicates = [];
  const genuinelyNew = [];
  
  newFlavors.forEach(flavor => {
    const normalized = flavor.toLowerCase();
    if (existingFlavors.includes(normalized)) {
      duplicates.push(flavor);
    } else {
      genuinelyNew.push(flavor);
    }
  });
  
  console.log('❌ DUPLICATES (skip these):');
  if (duplicates.length === 0) {
    console.log('   None\n');
  } else {
    duplicates.forEach(f => console.log(`   - ${f}`));
    console.log('');
  }
  
  console.log('✅ GENUINELY NEW (add these):');
  if (genuinelyNew.length === 0) {
    console.log('   None\n');
  } else {
    genuinelyNew.forEach(f => console.log(`   - ${f}`));
    console.log('');
  }
  
  console.log(`📊 FINAL COUNT: Add ${genuinelyNew.length} new variants to GR-003\n`);
}

checkLuckyMe()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
