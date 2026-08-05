import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

async function run() {
  const snap = await db.collection('products').get();
  const missing = snap.docs.filter(d => {
    const data = d.data();
    return data.is_active !== true && data.status !== 'Active' && data.status !== 'active';
  });
  
  console.log(`Found ${missing.length} products missing both is_active and status:Active:`);
  missing.forEach(d => console.log(' -', d.id, '|', d.data().name, '| is_active:', d.data().is_active, '| status:', d.data().status));
  
  if (missing.length > 0) {
    const batch = db.batch();
    missing.forEach(d => {
      batch.update(d.ref, { is_active: true, status: 'Active', updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
    console.log(`\n✅ Fixed ${missing.length} products — set is_active:true and status:Active.`);
  }
}
run().catch(console.error);
