import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function updateLeah() {
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
    fullName: "Leah Dela Rosa"
  });
  
  const updated = await doc.ref.get();
  console.log("Updated data:");
  console.log(JSON.stringify(updated.data(), null, 2));
}

updateLeah().catch(console.error);
