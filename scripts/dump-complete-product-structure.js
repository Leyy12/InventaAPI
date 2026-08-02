/**
 * COMPLETE PRODUCT STRUCTURE DUMP
 * Shows ALL fields including nested metadata
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

console.log('🔍 COMPLETE PRODUCT STRUCTURE DUMP\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function dumpProductStructures() {
    const productsRef = db.collection('products');
    
    // Get first 10 products to show variety
    const snapshot = await productsRef.limit(10).get();
    
    console.log(`📊 Showing COMPLETE structure of first 10 products:\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    let hasTopLevelSourceUrl = 0;
    let hasNestedSourceUrl = 0;
    let hasMetadataObject = 0;
    
    snapshot.forEach((doc, index) => {
        const data = doc.data();
        
        console.log(`[${index + 1}] DOCUMENT ID: ${doc.id}`);
        console.log(`    Product Name: ${data.name || 'N/A'}\n`);
        console.log('    COMPLETE RAW DATA:');
        console.log(JSON.stringify(data, null, 2));
        console.log('\n    FIELD CHECK:');
        console.log(`    - Has top-level source_url? ${data.source_url ? 'YES' : 'NO'}`);
        console.log(`    - Has metadata object? ${data.metadata ? 'YES' : 'NO'}`);
        if (data.metadata) {
            console.log(`    - Has metadata.source_url? ${data.metadata.source_url ? 'YES' : 'NO'}`);
            if (data.metadata.source_url) {
                console.log(`    - metadata.source_url VALUE: ${data.metadata.source_url}`);
                hasNestedSourceUrl++;
            }
            hasMetadataObject++;
        }
        if (data.source_url) {
            console.log(`    - source_url VALUE: ${data.source_url}`);
            hasTopLevelSourceUrl++;
        }
        console.log('\n═══════════════════════════════════════════════════════════════\n');
    });
    
    console.log('📋 SUMMARY:\n');
    console.log(`   Total products checked: ${snapshot.size}`);
    console.log(`   Products with metadata object: ${hasMetadataObject}`);
    console.log(`   Products with top-level source_url: ${hasTopLevelSourceUrl}`);
    console.log(`   Products with metadata.source_url: ${hasNestedSourceUrl}\n`);
    
    // Now check ALL 315 products for nested source_url
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🔎 CHECKING ALL 315 PRODUCTS FOR NESTED source_url...\n');
    
    const allSnapshot = await productsRef.get();
    let totalWithNestedSourceUrl = 0;
    const samplesWithSourceUrl = [];
    
    allSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.metadata && data.metadata.source_url) {
            totalWithNestedSourceUrl++;
            if (samplesWithSourceUrl.length < 5) {
                samplesWithSourceUrl.push({
                    id: doc.id,
                    name: data.name,
                    source_url: data.metadata.source_url,
                    batch: data.metadata.batch || 'unknown'
                });
            }
        }
    });
    
    console.log(`📊 RESULT: ${totalWithNestedSourceUrl} products have metadata.source_url\n`);
    
    if (totalWithNestedSourceUrl > 0) {
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('🚨 FOUND PRODUCTS WITH NESTED source_url:\n');
        samplesWithSourceUrl.forEach((product, index) => {
            console.log(`[${index + 1}] ${product.name}`);
            console.log(`    ID: ${product.id}`);
            console.log(`    Batch: ${product.batch}`);
            console.log(`    metadata.source_url: ${product.source_url}\n`);
        });
    } else {
        console.log('✅ NO nested metadata.source_url fields found in any of 315 products\n');
    }
}

dumpProductStructures()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
