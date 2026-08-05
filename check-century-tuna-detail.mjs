/**
 * Check exact current state of Century Tuna (GR-004)
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

async function checkCenturyTuna() {
  const snapshot = await db.collection('products').where('sku', '==', 'GR-004').get();
  
  if (snapshot.empty) {
    console.log('GR-004 not found');
    return;
  }
  
  const doc = snapshot.docs[0];
  const data = doc.data();
  
  console.log('📦 CURRENT GR-004 STATE:\n');
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
}

checkCenturyTuna()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
