/**
 * FRESH VERIFICATION - Batch 1 Fix Persistence Check
 * Re-query the 5 sample products from live Firestore right now
 * Project: inventaapi-db (LIVE FIRESTORE)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🔍 FRESH VERIFICATION - BATCH 1 FIX PERSISTENCE\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}`);
console.log(`⏰ Query Time: ${new Date().toISOString()}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

const SAMPLE_PRODUCTS = [
    'Stanley Utility Knife with Retractable Blade',
    'Oishi Prawn Crackers',
    'Gaviscon Double Action Sachet',
    'Yale Entrance Knobset Stainless Steel',
    'Flanax 275mg Tablet'
];

async function verifyFix() {
    console.log('🔄 RE-QUERYING 5 SAMPLE PRODUCTS FROM LIVE FIRESTORE...\n');
    
    const productsRef = db.collection('products');
    
    for (let i = 0; i < SAMPLE_PRODUCTS.length; i++) {
        const productName = SAMPLE_PRODUCTS[i];
        const querySnapshot = await productsRef.where('name', '==', productName).limit(1).get();
        
        if (querySnapshot.empty) {
            console.log(`[${i + 1}] ❌ NOT FOUND: ${productName}\n`);
            continue;
        }
        
        const doc = querySnapshot.docs[0];
        const data = doc.data();
        
        console.log(`[${i + 1}] ${productName}`);
        console.log(`    Document ID: ${doc.id}`);
        console.log(`    ─────────────────────────────────────────────────────`);
        console.log(`    metadata.source_url: ${data.metadata?.source_url || 'false (removed)'}`);
        console.log(`    metadata.pricing_method: ${data.metadata?.pricing_method || 'NOT SET'}`);
        console.log(`    metadata.pricing_note: ${data.metadata?.pricing_note || 'NOT SET'}`);
        console.log(`    metadata.batch: ${data.metadata?.batch || 'NOT SET'}`);
        console.log(`    ─────────────────────────────────────────────────────`);
        
        // Verification checks
        const hasSourceUrl = !!data.metadata?.source_url;
        const hasPricingMethod = data.metadata?.pricing_method === 'estimated';
        const hasPricingNote = !!data.metadata?.pricing_note;
        
        console.log(`    ✅ source_url removed? ${!hasSourceUrl}`);
        console.log(`    ✅ pricing_method = "estimated"? ${hasPricingMethod}`);
        console.log(`    ✅ pricing_note exists? ${hasPricingNote}\n`);
        
        if (hasSourceUrl || !hasPricingMethod || !hasPricingNote) {
            console.log(`    ⚠️  FIX DID NOT PERSIST for this product!\n`);
        }
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✅ FRESH VERIFICATION COMPLETE\n');
}

verifyFix()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
