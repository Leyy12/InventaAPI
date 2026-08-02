/**
 * Check the 95 Batch 2 products (those with created_at timestamp 2026-07-29)
 * Check for source_url and apply fix if found
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

console.log('🔍 CHECKING BATCH 2 PRODUCTS (95 products with created_at timestamps)\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function checkBatch2() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    const batch2Products = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        // Batch 2 = has created_at (lowercase with underscore) AND no metadata object
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
                    ref: doc.ref,
                    name: data.name,
                    time,
                    data
                });
            }
        }
    });
    
    batch2Products.sort((a, b) => a.time - b.time);
    
    console.log(`📊 FOUND ${batch2Products.length} BATCH 2 PRODUCTS\n`);
    console.log(`   Timestamp range: ${batch2Products[0].time.toISOString()} to ${batch2Products[batch2Products.length - 1].time.toISOString()}\n`);
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🔍 CHECKING FOR source_url FIELD:\n');
    
    let withSourceUrl = 0;
    let withNestedSourceUrl = 0;
    const samples = [];
    
    for (const product of batch2Products) {
        const data = product.data;
        const hasTopLevelSourceUrl = !!data.source_url;
        const hasImageUrl = !!data.image_url;
        
        // Check all fields for any source-related URLs
        let foundSourceUrl = false;
        let sourceUrlField = null;
        let sourceUrlValue = null;
        
        for (const [key, value] of Object.entries(data)) {
            if (key === 'source_url') {
                foundSourceUrl = true;
                sourceUrlField = 'source_url';
                sourceUrlValue = value;
                withSourceUrl++;
                break;
            }
            if (typeof value === 'object' && value !== null && value.source_url) {
                foundSourceUrl = true;
                sourceUrlField = `${key}.source_url`;
                sourceUrlValue = value.source_url;
                withNestedSourceUrl++;
                break;
            }
        }
        
        if (foundSourceUrl && samples.length < 10) {
            samples.push({
                name: product.name,
                id: product.id,
                ref: product.ref,
                sourceUrlField,
                sourceUrlValue,
                time: product.time
            });
        }
    }
    
    console.log(`   Total Batch 2 products: ${batch2Products.length}`);
    console.log(`   With top-level source_url: ${withSourceUrl}`);
    console.log(`   With nested source_url: ${withNestedSourceUrl}\n`);
    
    if (samples.length > 0) {
        console.log('🚨 FOUND source_url IN BATCH 2!\n');
        console.log('   Sample products:\n');
        
        for (let i = 0; i < samples.length; i++) {
            console.log(`   [${i + 1}] ${samples[i].name}`);
            console.log(`       ${samples[i].sourceUrlField}: ${samples[i].sourceUrlValue}`);
            console.log(`       Created: ${samples[i].time.toISOString()}\n`);
        }
        
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('🔧 APPLYING FIX TO BATCH 2 PRODUCTS...\n');
        
        // Apply fix: remove source_url, add metadata with pricing info
        const batch = db.batch();
        let updateCount = 0;
        
        for (const sample of samples) {
            batch.update(sample.ref, {
                'source_url': FieldValue.delete(),
                'metadata': {
                    batch: 'batch_2_real_ph',
                    pricing_method: 'estimated',
                    pricing_note: 'Pricing was LLM-estimated based on Philippine market research, not fetched from external sources.',
                    createdAt: sample.time
                }
            });
            updateCount++;
        }
        
        // If there are more products with source_url beyond the samples
        for (const product of batch2Products) {
            const data = product.data;
            if (data.source_url && !samples.find(s => s.id === product.id)) {
                batch.update(product.ref, {
                    'source_url': FieldValue.delete(),
                    'metadata': {
                        batch: 'batch_2_real_ph',
                        pricing_method: 'estimated',
                        pricing_note: 'Pricing was LLM-estimated based on Philippine market research, not fetched from external sources.',
                        createdAt: product.time
                    }
                });
                updateCount++;
            }
        }
        
        console.log(`   Updating ${updateCount} products...\n`);
        await batch.commit();
        console.log('   ✅ Batch commit successful!\n');
        
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('📋 VERIFICATION - Re-querying 5 samples:\n');
        
        for (let i = 0; i < Math.min(5, samples.length); i++) {
            const sample = samples[i];
            const doc = await sample.ref.get();
            const data = doc.data();
            
            console.log(`[${i + 1}] ${sample.name}`);
            console.log(`    OLD: source_url = ${sample.sourceUrlValue}`);
            console.log(`    NEW: source_url = ${data.source_url || 'REMOVED ✅'}`);
            console.log(`    NEW: metadata.pricing_method = ${data.metadata?.pricing_method || 'NOT SET'}`);
            console.log(`    NEW: metadata.batch = ${data.metadata?.batch || 'NOT SET'}\n`);
        }
        
        console.log(`✅ BATCH 2 FIX COMPLETE! Updated ${updateCount} products.\n`);
        
    } else {
        console.log('✅ NO source_url FOUND IN BATCH 2\n');
        console.log('   All Batch 2 products are clean.\n');
        console.log('   Sample Batch 2 products (first 5):\n');
        
        for (let i = 0; i < Math.min(5, batch2Products.length); i++) {
            const product = batch2Products[i];
            const data = product.data;
            console.log(`   [${i + 1}] ${product.name}`);
            console.log(`       Fields: ${Object.keys(data).join(', ')}`);
            console.log(`       source_url: ${data.source_url || 'NOT FOUND'}`);
            console.log(`       image_url: ${data.image_url ? 'EXISTS' : 'NOT FOUND'}\n`);
        }
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📊 FINAL PRODUCT COUNT BREAKDOWN:\n');
    console.log(`   Original 120: 119 (no metadata, createdAt field)`);
    console.log(`   Batch 1: 100 (metadata.batch = batch_1_real_ph)`);
    console.log(`   Batch 2: ${batch2Products.length} (no metadata, created_at field)`);
    console.log(`   Other: 1 (has metadata but no batch tag)`);
    console.log(`   TOTAL: ${119 + 100 + batch2Products.length + 1}\n`);
}

checkBatch2()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
