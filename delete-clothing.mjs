import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

if (!getApps().length) {
  const serviceAccount = require(path.resolve(__dirname, 'service-account.json'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function cleanupClothing() {
  console.log("=== CLOTHING CATALOG CLEANUP (LIVE DB) ===");
  const snapshot = await db.collection('products').get();
  
  const clothingDocs = snapshot.docs.filter(doc => {
    const data = doc.data();
    return (
      (data.businessType && data.businessType.toLowerCase().trim() === 'clothing') ||
      (data.segment && data.segment.toLowerCase().trim() === 'clothing')
    );
  });

  console.log(`Found ${clothingDocs.length} clothing documents.`);
  
  if (clothingDocs.length === 0) {
    console.log("✅ Nothing to delete.");
    return;
  }
  
  // Batch delete in groups of 500
  const batchSize = 450;
  for (let i = 0; i < clothingDocs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = clothingDocs.slice(i, i + batchSize);
    chunk.forEach(doc => {
      console.log(`  Deleting: ${doc.data().name} (${doc.id})`);
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`  ✓ Batch ${Math.floor(i/batchSize)+1} committed (${chunk.length} items).`);
  }
  
  // Verify
  const verify = await db.collection('products').get();
  const remaining = verify.docs.filter(doc => {
    const d = doc.data();
    return (d.businessType || '').toLowerCase() === 'clothing' || (d.segment || '').toLowerCase() === 'clothing';
  });
  
  console.log(`\n=== VERIFICATION ===`);
  console.log(`Clothing products remaining: ${remaining.length}`);
  if (remaining.length === 0) {
    console.log('✅ PASS: All clothing products successfully deleted from Firestore.');
  } else {
    console.log('❌ FAIL: Some clothing products still present:');
    remaining.forEach(d => console.log(`  - ${d.data().name}`));
  }
}

cleanupClothing().catch(console.error);
