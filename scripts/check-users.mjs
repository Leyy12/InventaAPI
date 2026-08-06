import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function run() {
  const snap = await db.collection('users').get();
  snap.forEach(d => {
    const data = d.data();
    console.log({ id: d.id, email: data.email, fullName: data.fullName, role: data.role });
  });
}
run().catch(console.error);
