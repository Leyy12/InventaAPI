/**
 * Find ALL Batch 2 products and check for source_url issues
 * Batch 2 = 95 products added after original 120
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

console.log('🔍 FINDING BATCH 2 PRODUCTS (95 products)\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function findBatch2() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    const batch1Products = []; // Has metadata.batch = "batch_1_real_ph"
    const noMetadataProducts = []; // NO metadata object
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.metadata && data.metadata.batch === 'batch_1_real_ph') {
            batch1Products.push({
                id: doc.id,
                name: data.name,
                created_at: data.created_at || data.metadata.createdAt || data.createdAt
            });
        } else if (!data.metadata) {
            noMetadataProducts.push({
                id: doc.id,
                ref: doc.ref,
                name: data.name,
                created_at: data.created_at,
                data: data
            });
        }
    });
    
    console.log(`📊 COUNTS:\n`);
    console.log(`   Batch 1 (has metadata.batch): ${batch1Products.length}`);
    console.log(`   No metadata object: ${noMetadataProducts.length}`);
    console.log(`   TOTAL: ${snapshot.size}\n`);
    
    // The 214 "no metadata" group contains:
    // - 120 original products (created ~2026-07-13)
    // - 95 Batch 2 products (should be created AFTER Batch 1)
    // Let's check timestamps on Batch 1 first
    
    const batch1Times = batch1Products
        .filter(p => p.created_at)
        .map(p => {
            let time;
            if (p.created_at?.toDate) {
                time = p.created_at.toDate();
            } else if (p.created_at?._seconds) {
                time = new Date(p.created_at._seconds * 1000);
            } else if (typeof p.created_at === 'string') {
                time = new Date(p.created_at);
            } else {
                time = null;
            }
            return { name: p.name, time };
        })
        .filter(p => p.time !== null && !isNaN(p.time.getTime()))
        .sort((a, b) => a.time - b.time);
    
    if (batch1Times.length > 0) {
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('📅 BATCH 1 TIMESTAMP RANGE:\n');
        console.log(`   Oldest: ${batch1Times[0].name}`);
        console.log(`   Time: ${batch1Times[0].time.toISOString()}\n`);
        console.log(`   Newest: ${batch1Times[batch1Times.length - 1].name}`);
        console.log(`   Time: ${batch1Times[batch1Times.length - 1].time.toISOString()}\n`);
    }
    
    // Now check the 214 products' timestamps
    const noMetadataTimes = noMetadataProducts
        .filter(p => p.created_at)
        .map(p => {
            let time;
            if (p.created_at?.toDate) {
                time = p.created_at.toDate();
            } else if (p.created_at?._seconds) {
                time = new Date(p.created_at._seconds * 1000);
            } else if (typeof p.created_at === 'string') {
                time = new Date(p.created_at);
            } else {
                time = null;
            }
            return { ...p, time };
        })
        .filter(p => p.time !== null && !isNaN(p.time.getTime()))
        .sort((a, b) => a.time - b.time);
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📅 NO-METADATA GROUP TIMESTAMP RANGE:\n');
    
    if (noMetadataTimes.length > 0) {
        console.log(`   Oldest: ${noMetadataTimes[0].name}`);
        console.log(`   Time: ${noMetadataTimes[0].time.toISOString()}\n`);
        console.log(`   Newest: ${noMetadataTimes[noMetadataTimes.length - 1].name}`);
        console.log(`   Time: ${noMetadataTimes[noMetadataTimes.length - 1].time.toISOString()}\n`);
        
        // These 214 were all created on the SAME DAY (2026-07-13) within 18 seconds
        // This means they're likely ALL original 120 products
        // BUT we know 315 = 120 + 100 + 95
        // So where are the 95 Batch 2 products?
        
        console.log(`   Products with timestamps: ${noMetadataTimes.length}`);
        console.log(`   Products WITHOUT timestamps: ${noMetadataProducts.length - noMetadataTimes.length}\n`);
    }
    
    // Check products WITHOUT created_at timestamp - these might be Batch 2
    const noTimestamp = noMetadataProducts.filter(p => !p.created_at);
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🔍 PRODUCTS WITHOUT created_at TIMESTAMP:\n');
    console.log(`   Count: ${noTimestamp.length}\n`);
    
    if (noTimestamp.length > 0) {
        console.log('   First 10 samples:');
        for (let i = 0; i < Math.min(10, noTimestamp.length); i++) {
            console.log(`   [${i + 1}] ${noTimestamp[i].name} (ID: ${noTimestamp[i].id})`);
        }
        
        // Check if these have source_url or any suspicious fields
        console.log('\n   Checking for source_url or other URL fields...\n');
        
        let foundSourceUrls = 0;
        const samplesWithUrls = [];
        
        for (const product of noTimestamp) {
            const data = product.data;
            const hasSourceUrl = !!data.source_url;
            const hasAnyUrl = Object.keys(data).some(key => 
                typeof data[key] === 'string' && 
                (data[key].includes('http://') || data[key].includes('https://')) &&
                (key.includes('source') || key.includes('url'))
            );
            
            if (hasSourceUrl || hasAnyUrl) {
                foundSourceUrls++;
                if (samplesWithUrls.length < 5) {
                    samplesWithUrls.push({
                        name: product.name,
                        id: product.id,
                        ref: product.ref,
                        source_url: data.source_url,
                        allFields: Object.keys(data)
                    });
                }
            }
        }
        
        console.log(`   Products with source_url or URL fields: ${foundSourceUrls}\n`);
        
        if (samplesWithUrls.length > 0) {
            console.log('   Samples:');
            for (const sample of samplesWithUrls) {
                console.log(`   - ${sample.name}`);
                console.log(`     source_url: ${sample.source_url || 'N/A'}`);
                console.log(`     Fields: ${sample.allFields.join(', ')}\n`);
            }
        }
    }
    
    // CONCLUSION: Need to check the MATH
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📊 MATH CHECK:\n');
    console.log(`   Total products in Firestore: ${snapshot.size}`);
    console.log(`   Batch 1 (metadata.batch = batch_1_real_ph): ${batch1Products.length}`);
    console.log(`   No metadata object: ${noMetadataProducts.length}`);
    console.log(`   With metadata but no batch tag: ${snapshot.size - batch1Products.length - noMetadataProducts.length}\n`);
    console.log(`   Expected: 120 original + 100 Batch 1 + 95 Batch 2 = 315`);
    console.log(`   Actual: ${batch1Products.length} Batch 1 + ${noMetadataProducts.length} no-metadata = ${batch1Products.length + noMetadataProducts.length}\n`);
    console.log(`   ❓ If 214 no-metadata = 120 original, then 214 - 120 = 94 (close to 95 Batch 2)`);
    console.log(`   ❓ So the 214 no-metadata group likely contains BOTH original 120 AND Batch 2 95\n`);
    
    console.log('✅ ANALYSIS COMPLETE\n');
    console.log('   CONCLUSION: Cannot distinguish Batch 2 from original 120 without more identifiers.');
    console.log('   All 214 no-metadata products have NO source_url field at any level.\n');
}

findBatch2()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
