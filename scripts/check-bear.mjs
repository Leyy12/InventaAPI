import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function run() {
  const snap = await db.collection('products').where('name', '==', 'Bear Brand Powdered Milk Drink').get();
  snap.docs.forEach(d => console.log(JSON.stringify(d.data().variants, null, 2)));
}
run().catch(console.error);
