import './database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

async function checkLatest() {
  try {
    const snapshot = await db.collection("products")
      .orderBy("createdAt", "desc")
      .limit(3)
      .get();
    
    console.log(`Found ${snapshot.size} recently added products:\n`);
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`Name: ${data.name}`);
      console.log(`Brand: ${data.brand}`);
      console.log(`Category: ${data.category}`);
      console.log(`Status: ${data.status}`);
      console.log(`Variants:`, JSON.stringify(data.variants, null, 2));
      console.log(`Created At: ${data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt}`);
      console.log('-------------------------');
    });
  } catch (e) {
    console.error("Error querying Firestore:", e);
  }
}

checkLatest();
