import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function run() {
  const snap = await db.collection('users')
    .where('email', '==', 'delarosaleah38@gmail.com')
    .limit(1)
    .get();
  
  if (snap.empty) {
    console.log('User not found.');
    return;
  }
  
  const doc = snap.docs[0];
  console.log('Document ID:', doc.id);
  console.log('All fields:');
  console.log(JSON.stringify(doc.data(), null, 2));
}

run().catch(console.error);
