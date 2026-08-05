import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function run() {
  console.log('Cleaning up Test E2E Mismatch Product...');
  
  const query = await db.collection('product_requests')
    .where('product_name', '==', 'Test E2E Mismatch Product')
    .get();
    
  if (query.empty) {
    console.log('No test data found.');
    return;
  }
  
  const batch = db.batch();
  let count = 0;
  
  query.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });
  
  await batch.commit();
  console.log(`Deleted ${count} test documents.`);
}

run().catch(console.error);
