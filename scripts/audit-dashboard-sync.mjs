import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function run() {
  const snap = await db.collection('products').get();
  const total = snap.size;
  const withIsActive = snap.docs.filter(d => d.data().is_active === true).length;
  const withStatus = snap.docs.filter(d => d.data().status === 'Active').length;
  const withVariants = snap.docs.filter(d => (d.data().variants || []).length > 0).length;
  console.log('Total docs:', total);
  console.log('is_active===true:', withIsActive);
  console.log('status===Active:', withStatus);
  console.log('has variants array:', withVariants);

  for (const name of ['Lucky Me! Instant Pancit Canton', 'Alaska Condensed Milk', '555 Sardines']) {
    const r = await db.collection('products').where('name', '==', name).limit(1).get();
    if (!r.empty) {
      const d = r.docs[0].data();
      console.log('\nPRODUCT:', name);
      console.log('  is_active:', d.is_active, '| status:', d.status);
      console.log('  variants count:', (d.variants || []).length);
      console.log('  root price/size/sku:', d.price, '/', d.size, '/', d.sku);
      (d.variants || []).forEach((v, i) => {
        console.log(`  variant[${i}]:`, JSON.stringify(v));
      });
    }
  }
}
run().catch(console.error);
