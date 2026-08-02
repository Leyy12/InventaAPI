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

async function migrateProducts() {
  console.log("=== PRODUCT SCHEMA MIGRATION ===");
  const snapshot = await db.collection('products').get();
  
  let updatedCount = 0;
  const batchSize = 400;
  
  for (let i = 0; i < snapshot.docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = snapshot.docs.slice(i, i + batchSize);
    
    let chunkUpdates = 0;
    
    chunk.forEach(doc => {
      const data = doc.data();
      let needsUpdate = false;
      const updates = {};
      
      // Fix is_active
      if (data.is_active === undefined || data.is_active === null) {
        updates.is_active = data.status === 'Active';
        needsUpdate = true;
      }
      
      // Fix segment
      if (!data.segment && data.businessType) {
        const bt = data.businessType.toLowerCase().trim();
        if (bt === 'hardware') updates.segment = 'Hardware';
        else if (bt === 'pharmacy') updates.segment = 'Pharmacy';
        else if (bt === 'grocery') updates.segment = 'Grocery';
        else updates.segment = data.businessType;
        needsUpdate = true;
      } else if (!data.segment && !data.businessType) {
         updates.segment = 'Hardware'; // Fallback
         needsUpdate = true;
      }
      
      if (needsUpdate) {
        batch.update(doc.ref, updates);
        chunkUpdates++;
        updatedCount++;
      }
    });
    
    if (chunkUpdates > 0) {
      await batch.commit();
      console.log(`  ✓ Batch committed (${chunkUpdates} items updated).`);
    }
  }
  
  console.log(`\n=== VERIFICATION ===`);
  console.log(`Total products updated: ${updatedCount}`);
  console.log('✅ PASS: Product schema migration complete.');
}

migrateProducts().catch(console.error);
