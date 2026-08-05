import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

async function run() {
  console.log('--- Step 1: Query 555 Sardines Variants ---');
  const snap = await db.collection('products').where('name', '==', '555 Sardines').limit(1).get();
  
  if (snap.empty) {
    console.error('555 Sardines not found');
    process.exit(1);
  }
  
  const doc = snap.docs[0];
  const data = doc.data();
  console.log(`Current variants for 555 Sardines:`);
  console.log(JSON.stringify(data.variants, null, 2));

  console.log('\n--- Step 2: Remove duplicate entry ---');
  if (data.variants && data.variants.length > 1) {
    // Filter out the bad one: flavor: "Tomato Sauce 155g"
    const newVariants = data.variants.filter(v => v.flavor !== 'Tomato Sauce 155g');
    
    await db.collection('products').doc(doc.id).update({ variants: newVariants });
    console.log(`✅ Cleaned 555 Sardines. New variants count: ${newVariants.length}`);
    console.log(JSON.stringify(newVariants, null, 2));
  } else {
    console.log('No duplicate found to clean.');
  }

  console.log('\n--- Step 3: Scan all 105 products for similar duplicates ---');
  const allSnap = await db.collection('products').get();
  let foundIssues = 0;
  
  allSnap.forEach(d => {
    const p = d.data();
    if (!p.variants || p.variants.length <= 1) return;
    
    // Look for variants where the flavor contains digits (which often means size was included in the string)
    // AND there's another variant that represents the same thing but cleanly formatted.
    // Let's just flag any product where flavor contains digits or 'g', 'ml', 'kg' 
    // AND it has more than 1 variant, just to review manually.
    const suspectVariants = p.variants.filter(v => 
      v.flavor && (
        /\d+[a-zA-Z]+/.test(v.flavor) || // e.g. "155g"
        /\d+ [a-zA-Z]+/.test(v.flavor) || // e.g. "155 g"
        v.flavor.includes(p.size || '')
      )
    );
    
    // Also look for variants that are too similar, or have overlapping flavors
    const flavors = p.variants.map(v => (v.flavor || '').toLowerCase().trim());
    const hasSimilarFlavors = flavors.some((f1, i) => 
      flavors.some((f2, j) => i !== j && (f1.includes(f2) || f2.includes(f1)))
    );
    
    if (suspectVariants.length > 0 || hasSimilarFlavors) {
      if (p.name !== '555 Sardines') { // Already fixed
        foundIssues++;
        console.log(`\nProduct: ${p.name} (ID: ${d.id})`);
        console.log(`Variants:`, JSON.stringify(p.variants, null, 2));
      }
    }
  });
  
  if (foundIssues === 0) {
    console.log('\n✅ No other similar duplicate patterns found.');
  } else {
    console.log(`\n⚠️ Found ${foundIssues} other product(s) that might need review.`);
  }
}

run().catch(console.error);
