/**
 * List all 15 products with their current images
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

async function listProductImages() {
  const snapshot = await db.collection('products').get();
  
  console.log('📦 CURRENT PRODUCTS & IMAGES:\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  snapshot.forEach((doc, index) => {
    const data = doc.data();
    console.log(`${index + 1}. ${data.name}`);
    console.log(`   SKU: ${data.sku}`);
    console.log(`   Segment: ${data.segment}`);
    console.log(`   Image: ${data.image_url}`);
    console.log(`   Variants: ${data.variants?.length || 0}\n`);
  });
  
  console.log(`\nTotal: ${snapshot.size} products\n`);
}

listProductImages()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
