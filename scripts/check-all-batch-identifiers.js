/**
 * Check what batch identifiers exist in products
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

console.log('🔍 CHECKING ALL BATCH IDENTIFIERS\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function checkBatches() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    const batchCounts = {};
    const productsWithMetadata = [];
    const productsWithoutMetadata = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.metadata) {
            productsWithMetadata.push({
                id: doc.id,
                name: data.name,
                batch: data.metadata.batch || 'NO_BATCH_FIELD',
                hasSourceUrl: !!data.metadata.source_url
            });
            
            const batchKey = data.metadata.batch || 'NO_BATCH_FIELD';
            batchCounts[batchKey] = (batchCounts[batchKey] || 0) + 1;
        } else {
            productsWithoutMetadata.push({
                id: doc.id,
                name: data.name
            });
        }
    });
    
    console.log(`📊 RESULTS:\n`);
    console.log(`   Total products: ${snapshot.size}`);
    console.log(`   Products WITH metadata object: ${productsWithMetadata.length}`);
    console.log(`   Products WITHOUT metadata object: ${productsWithoutMetadata.length}\n`);
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📋 BATCH BREAKDOWN:\n');
    
    for (const [batch, count] of Object.entries(batchCounts)) {
        console.log(`   ${batch}: ${count} products`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('📋 SAMPLES WITH metadata.batch:\n');
    
    for (let i = 0; i < Math.min(5, productsWithMetadata.length); i++) {
        const product = productsWithMetadata[i];
        console.log(`[${i + 1}] ${product.name}`);
        console.log(`    Batch: ${product.batch}`);
        console.log(`    Has source_url: ${product.hasSourceUrl}\n`);
    }
    
    if (productsWithoutMetadata.length > 0) {
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('📋 SAMPLES WITHOUT metadata object:\n');
        
        for (let i = 0; i < Math.min(3, productsWithoutMetadata.length); i++) {
            const product = productsWithoutMetadata[i];
            console.log(`[${i + 1}] ${product.name} (ID: ${product.id})`);
        }
    }
}

checkBatches()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
