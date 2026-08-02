/**
 * Check Batch 2 Products for metadata.source_url
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

console.log('🔍 CHECKING BATCH 2 PRODUCTS FOR source_url\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function checkBatch2() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    let batch2Products = [];
    let batch2WithSourceUrl = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        // Batch 2 identifier
        if (data.metadata && data.metadata.batch === 'batch_2_real_ph') {
            batch2Products.push({
                id: doc.id,
                ref: doc.ref,
                name: data.name,
                hasSourceUrl: !!data.metadata.source_url,
                sourceUrl: data.metadata.source_url || null
            });
            
            if (data.metadata.source_url) {
                batch2WithSourceUrl.push({
                    id: doc.id,
                    ref: doc.ref,
                    name: data.name,
                    sourceUrl: data.metadata.source_url
                });
            }
        }
    });
    
    console.log(`📊 BATCH 2 SUMMARY:\n`);
    console.log(`   Total Batch 2 products found: ${batch2Products.length}`);
    console.log(`   Batch 2 with metadata.source_url: ${batch2WithSourceUrl.length}\n`);
    
    if (batch2WithSourceUrl.length > 0) {
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('🚨 FOUND BATCH 2 PRODUCTS WITH source_url:\n');
        
        const samplesToShow = Math.min(5, batch2WithSourceUrl.length);
        for (let i = 0; i < samplesToShow; i++) {
            const product = batch2WithSourceUrl[i];
            console.log(`[${i + 1}] ${product.name}`);
            console.log(`    ID: ${product.id}`);
            console.log(`    metadata.source_url: ${product.sourceUrl}\n`);
        }
        
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('🔧 APPLYING SAME FIX TO BATCH 2...\n');
        
        const batch = db.batch();
        
        for (const product of batch2WithSourceUrl) {
            batch.update(product.ref, {
                'metadata.source_url': FieldValue.delete(),
                'metadata.pricing_method': 'estimated',
                'metadata.pricing_note': 'Pricing was LLM-estimated based on Philippine market research, not fetched from external sources.'
            });
        }
        
        console.log(`   Committing batch update of ${batch2WithSourceUrl.length} products...\n`);
        await batch.commit();
        console.log('   ✅ Batch commit successful!\n');
        
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('📋 VERIFICATION - Showing 5 updated Batch 2 products:\n');
        
        for (let i = 0; i < samplesToShow; i++) {
            const product = batch2WithSourceUrl[i];
            const doc = await product.ref.get();
            const data = doc.data();
            
            console.log(`[${i + 1}] ${product.name}`);
            console.log(`    ID: ${product.id}`);
            console.log(`    OLD: metadata.source_url = ${product.sourceUrl}`);
            console.log(`    NEW: metadata.pricing_method = ${data.metadata.pricing_method || 'N/A'}`);
            console.log(`    NEW: metadata.pricing_note = ${data.metadata.pricing_note || 'N/A'}`);
            console.log(`    ✅ metadata.source_url removed? ${!data.metadata.source_url}\n`);
        }
        
        console.log(`✅ BATCH 2 FIX COMPLETE! Updated ${batch2WithSourceUrl.length} products.\n`);
        
    } else {
        console.log('✅ NO Batch 2 products have metadata.source_url\n');
        console.log('   All Batch 2 products are already clean.\n');
    }
}

checkBatch2()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
