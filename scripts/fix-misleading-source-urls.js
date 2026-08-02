/**
 * FIX MISLEADING SOURCE_URL METADATA
 * Relabel metadata.source_url to metadata.pricing_method: "estimated"
 * Project: inventaapi-db (LIVE FIRESTORE)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🔧 FIXING MISLEADING SOURCE_URL METADATA\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function fixSourceUrls() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    let productsToFix = [];
    
    // Find all products with metadata.source_url
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.metadata && data.metadata.source_url) {
            productsToFix.push({
                id: doc.id,
                ref: doc.ref,
                name: data.name,
                oldSourceUrl: data.metadata.source_url,
                batch: data.metadata.batch || 'unknown'
            });
        }
    });
    
    console.log(`📊 Found ${productsToFix.length} products with metadata.source_url\n`);
    
    if (productsToFix.length === 0) {
        console.log('✅ No products need fixing!\n');
        return;
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🔧 APPLYING FIX...\n');
    console.log('   Action: Remove metadata.source_url');
    console.log('   Action: Add metadata.pricing_method: "estimated"\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const batch = db.batch();
    let count = 0;
    
    for (const product of productsToFix) {
        batch.update(product.ref, {
            'metadata.source_url': FieldValue.delete(),
            'metadata.pricing_method': 'estimated',
            'metadata.pricing_note': 'Pricing was LLM-estimated based on Philippine market research, not fetched from external sources.'
        });
        count++;
        
        if (count % 50 === 0) {
            console.log(`   Progress: ${count}/${productsToFix.length} products queued...`);
        }
    }
    
    console.log(`   Committing batch update of ${count} products...\n`);
    await batch.commit();
    console.log('   ✅ Batch commit successful!\n');
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📋 VERIFICATION - Showing 5 updated products:\n');
    
    // Verify first 5 products
    for (let i = 0; i < Math.min(5, productsToFix.length); i++) {
        const product = productsToFix[i];
        const doc = await product.ref.get();
        const data = doc.data();
        
        console.log(`[${i + 1}] ${product.name}`);
        console.log(`    ID: ${product.id}`);
        console.log(`    Batch: ${product.batch}`);
        console.log(`    OLD: metadata.source_url = ${product.oldSourceUrl}`);
        console.log(`    NEW: metadata.pricing_method = ${data.metadata.pricing_method || 'N/A'}`);
        console.log(`    NEW: metadata.pricing_note = ${data.metadata.pricing_note || 'N/A'}`);
        console.log(`    ✅ metadata.source_url removed? ${!data.metadata.source_url}\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`✅ FIX COMPLETE! Updated ${count} products.\n`);
}

fixSourceUrls()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
