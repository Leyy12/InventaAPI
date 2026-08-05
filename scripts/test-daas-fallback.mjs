import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function testProducts() {
  // Find specific multi-variant products
  const targets = [
    'Lucky Me! Instant Pancit Canton',
    '555 Sardines',
    'Jack \'n Jill Chippy',
    'Jack \'n Jill Piattos',
    'Nescafé Classic',
  ];

  for (const name of targets) {
    const snap = await db.collection('products').where('name', '==', name).limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0];
      const p = { id: d.id, ...d.data() };
      const variants = p.variants || [];

      // Compute base variant (lowest price)
      let baseVariant = variants[0] || {};
      if (variants.length > 1) {
        baseVariant = variants.reduce((prev, curr) => {
          const pP = typeof prev.price === 'number' ? prev.price : parseFloat(prev.price) || Infinity;
          const cP = typeof curr.price === 'number' ? curr.price : parseFloat(curr.price) || Infinity;
          return (cP < pP) ? curr : prev;
        }, variants[0]);
      }

      const result = {
        id: p.id,
        sku: p.sku || baseVariant.sku || null,
        name: p.name,
        category: p.category,
        price: p.price ?? baseVariant.price ?? null,
        size: p.size || baseVariant.size || null,
        expirationDate: p.expirationDate || baseVariant.expirationDate || null,
        variants: variants,
      };

      console.log('\n════════════════════════════════════════');
      console.log(`PRODUCT: ${result.name}`);
      console.log(`  Root price: ₱${result.price}  |  Root size: ${result.size}`);
      console.log(`  Variants (${variants.length}):`);
      variants.forEach((v, i) => {
        console.log(`    [${i+1}] flavor="${v.flavor}" size="${v.size}" price=${v.price}`);
      });
      console.log(`  → Base variant selected (lowest price): flavor="${baseVariant.flavor}" size="${baseVariant.size}" price=${baseVariant.price}`);
    } else {
      console.log(`\nNOT FOUND: ${name}`);
    }
  }
}

testProducts().catch(console.error);
