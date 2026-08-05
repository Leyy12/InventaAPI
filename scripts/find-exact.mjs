import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
const db = getFirestore();

async function run() {
  const snap = await db.collection('products').get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[!,.']/g, '');
  const getName = d => d.name || d.product || '';
  
  const groups = new Map();
  docs.forEach(d => {
    const n = norm(getName(d));
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(d);
  });
  
  let printed = false;
  groups.forEach((items, name) => {
    if (items.length > 1) {
      // Check if they have different non-blank brands
      const brands = new Set(items.map(i => norm(i.brand || i.attributes?.brand || '')));
      if (brands.size > 1 && !brands.has('')) {
        console.log('\nEXACT NAME MATCH, DIFFERENT BRANDS:');
        items.forEach(i => console.log('  ID: ' + i.id + ' | Name: ' + getName(i) + ' | Brand: ' + (i.brand || '(blank)')));
        printed = true;
      }
    }
  });
  if (!printed) console.log('No exact name matches found with different brands.');
}

run().catch(console.error);
