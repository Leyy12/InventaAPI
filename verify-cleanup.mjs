import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

initializeApp({ projectId: "api-inventa-b2-dev" });

const db = getFirestore();

async function verifyCleanup() {
  console.log("=== VERIFYING CLOTHING CATALOG CLEANUP ===");
  try {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    let clothingCount = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (
        (data.businessType && data.businessType.toLowerCase() === 'clothing') ||
        (data.segment && data.segment.toLowerCase() === 'clothing') ||
        (data.category && data.category.toLowerCase().includes('clothing'))
      ) {
        clothingCount++;
        console.log(`FOUND RESIDUAL CLOTHING: ${doc.id} - ${data.name}`);
      }
    });
    
    if (clothingCount === 0) {
      console.log(`✅ VERIFICATION SUCCESS: 0 Clothing products found in database.`);
    } else {
      console.log(`❌ VERIFICATION FAILED: Found ${clothingCount} clothing products.`);
    }
  } catch (error) {
    console.error("Verification error:", error);
  }
}

verifyCleanup();
