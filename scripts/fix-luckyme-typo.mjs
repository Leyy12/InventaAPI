import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

async function run() {
  // Fix "60 gI" typo in Lucky Me! Instant Pancit Canton
  const snap = await db.collection('products').where('name', '==', 'Lucky Me! Instant Pancit Canton').limit(1).get();
  if (!snap.empty) {
    const docRef = snap.docs[0].ref;
    const data = snap.docs[0].data();
    const fixedVariants = data.variants.map(v => ({
      ...v,
      size: (v.size || '').replace(/gI$/i, 'g').replace(/^\s+|\s+$/g, '')
    }));
    await docRef.update({ variants: fixedVariants, updatedAt: FieldValue.serverTimestamp() });
    console.log('✅ Fixed Lucky Me! Instant Pancit Canton variants:');
    fixedVariants.forEach((v, i) => console.log(`  [${i+1}] flavor="${v.flavor}" size="${v.size}" price=${v.price}`));
  } else {
    console.log('Not found');
  }
}
run().catch(console.error);
