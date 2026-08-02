/**
 * Final Metadata Audit Closeout
 * 1. Identify the 1 product with metadata but no batch field
 * 2. Show Batch 2 samples from Hardware and Grocery (not just Pharmacy)
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

console.log('🔍 FINAL METADATA AUDIT CLOSEOUT\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function finalAudit() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    // Task 1: Find the 1 product with metadata but no batch field
    console.log('📋 TASK 1: IDENTIFY PRODUCT WITH METADATA BUT NO BATCH FIELD\n');
    
    let productWithMetadataNoBatch = null;
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.metadata && !data.metadata.batch) {
            productWithMetadataNoBatch = {
                id: doc.id,
                name: data.name,
                allFields: Object.keys(data),
                metadataFields: Object.keys(data.metadata || {}),
                fullData: data
            };
        }
    });
    
    if (productWithMetadataNoBatch) {
        console.log(`✅ FOUND: ${productWithMetadataNoBatch.name}\n`);
        console.log(`   Document ID: ${productWithMetadataNoBatch.id}`);
        console.log(`   All fields: ${productWithMetadataNoBatch.allFields.join(', ')}`);
        console.log(`   metadata fields: ${productWithMetadataNoBatch.metadataFields.join(', ')}`);
        console.log(`   created_at: ${productWithMetadataNoBatch.fullData.created_at || 'NOT FOUND'}`);
        console.log(`   createdAt: ${productWithMetadataNoBatch.fullData.createdAt || 'NOT FOUND'}`);
        console.log(`\n   Full raw structure:`);
        console.log(JSON.stringify(productWithMetadataNoBatch.fullData, null, 2));
    } else {
        console.log(`❌ NOT FOUND\n`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('📋 TASK 2: SHOW BATCH 2 SAMPLES FROM ALL SEGMENTS\n');
    
    // Collect all Batch 2 products (created_at timestamp field, no metadata)
    const batch2Products = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.metadata && data.created_at) {
            let time = null;
            if (data.created_at?.toDate) {
                time = data.created_at.toDate();
            } else if (data.created_at?._seconds) {
                time = new Date(data.created_at._seconds * 1000);
            }
            
            if (time && !isNaN(time.getTime())) {
                batch2Products.push({
                    id: doc.id,
                    name: data.name,
                    segment: data.segment,
                    category: data.category,
                    time,
                    has_source_url: !!data.source_url,
                    has_nested_source_url: Object.keys(data).some(key => 
                        typeof data[key] === 'object' && 
                        data[key] !== null && 
                        data[key].source_url
                    ),
                    allFields: Object.keys(data)
                });
            }
        }
    });
    
    // Group by segment
    const bySegment = {};
    for (const product of batch2Products) {
        const segment = product.segment || 'Unknown';
        if (!bySegment[segment]) {
            bySegment[segment] = [];
        }
        bySegment[segment].push(product);
    }
    
    console.log(`✅ FOUND ${batch2Products.length} BATCH 2 PRODUCTS\n`);
    console.log(`   Breakdown by segment:\n`);
    for (const [segment, products] of Object.entries(bySegment)) {
        console.log(`   - ${segment}: ${products.length} products`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('📦 HARDWARE BATCH 2 SAMPLES (at least 3):\n');
    
    const hardwareProducts = bySegment['Hardware'] || [];
    for (let i = 0; i < Math.min(3, hardwareProducts.length); i++) {
        const product = hardwareProducts[i];
        console.log(`[${i + 1}] ${product.name}`);
        console.log(`    Category: ${product.category}`);
        console.log(`    Created: ${product.time.toISOString()}`);
        console.log(`    Has source_url (top-level): ${product.has_source_url}`);
        console.log(`    Has source_url (nested): ${product.has_nested_source_url}`);
        console.log(`    All fields: ${product.allFields.join(', ')}\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🛒 GROCERY BATCH 2 SAMPLES (at least 3):\n');
    
    const groceryProducts = bySegment['Grocery'] || [];
    for (let i = 0; i < Math.min(3, groceryProducts.length); i++) {
        const product = groceryProducts[i];
        console.log(`[${i + 1}] ${product.name}`);
        console.log(`    Category: ${product.category}`);
        console.log(`    Created: ${product.time.toISOString()}`);
        console.log(`    Has source_url (top-level): ${product.has_source_url}`);
        console.log(`    Has source_url (nested): ${product.has_nested_source_url}`);
        console.log(`    All fields: ${product.allFields.join(', ')}\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('💊 PHARMACY BATCH 2 SAMPLES (at least 3):\n');
    
    const pharmacyProducts = bySegment['Pharmacy'] || [];
    for (let i = 0; i < Math.min(3, pharmacyProducts.length); i++) {
        const product = pharmacyProducts[i];
        console.log(`[${i + 1}] ${product.name}`);
        console.log(`    Category: ${product.category}`);
        console.log(`    Created: ${product.time.toISOString()}`);
        console.log(`    Has source_url (top-level): ${product.has_source_url}`);
        console.log(`    Has source_url (nested): ${product.has_nested_source_url}`);
        console.log(`    All fields: ${product.allFields.join(', ')}\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📊 SUMMARY - source_url CHECK ACROSS ALL SEGMENTS:\n');
    
    let totalWithSourceUrl = 0;
    let totalWithNestedSourceUrl = 0;
    
    for (const product of batch2Products) {
        if (product.has_source_url) totalWithSourceUrl++;
        if (product.has_nested_source_url) totalWithNestedSourceUrl++;
    }
    
    console.log(`   Total Batch 2 products: ${batch2Products.length}`);
    console.log(`   With top-level source_url: ${totalWithSourceUrl}`);
    console.log(`   With nested source_url: ${totalWithNestedSourceUrl}\n`);
    
    if (totalWithSourceUrl === 0 && totalWithNestedSourceUrl === 0) {
        console.log('   ✅ CONFIRMED: ALL Batch 2 products (Hardware, Pharmacy, Grocery) are CLEAN\n');
    } else {
        console.log('   🚨 FOUND source_url issues in Batch 2!\n');
    }
    
    console.log('✅ FINAL METADATA AUDIT CLOSEOUT COMPLETE\n');
}

finalAudit()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
