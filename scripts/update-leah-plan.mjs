import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function updateLeahPlan() {
  const snap = await db.collection('users')
    .where('email', '==', 'delarosaleah38@gmail.com')
    .limit(1)
    .get();
  
  if (snap.empty) {
    console.log('User not found.');
    return;
  }
  
  const doc = snap.docs[0];
  await doc.ref.update({
    plan: "free"
  });
  
  const updated = await doc.ref.get();
  console.log("Updated data:");
  console.log(JSON.stringify(updated.data(), null, 2));
}

updateLeahPlan().catch(console.error);
