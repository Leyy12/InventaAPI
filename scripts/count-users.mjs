import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

async function run() {
  const snapshot = await db.collection('users').get();
  console.log(`Final user count: ${snapshot.size}`);
}

run().catch(console.error);
