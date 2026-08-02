/**
 * Count Products in LIVE FIRESTORE DATABASE
 * Project: inventaapi-db
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🔥 LIVE FIRESTORE PRODUCT COUNT\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function countProducts() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.count().get();
    
    console.log(`📊 TOTAL PRODUCTS IN LIVE FIRESTORE: ${snapshot.data().count}\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Get sample products to show structure
    console.log('📋 SAMPLE PRODUCTS (first 5):\n');
    const sampleSnapshot = await productsRef.limit(5).get();
    
    sampleSnapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`[${index + 1}] ID: ${doc.id}`);
        console.log(`    Name: ${data.name || 'N/A'}`);
        console.log(`    Price: ${data.price || 'N/A'}`);
        console.log(`    source_url: ${data.source_url || 'NONE'}`);
        console.log('');
    });
    
    return snapshot.data().count;
}

countProducts()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
