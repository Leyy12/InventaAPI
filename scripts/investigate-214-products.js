/**
 * Investigate the 214 products without metadata
 * Check for source_url fields and identify Batch 2 by timestamp
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

console.log('🔍 INVESTIGATING 214 PRODUCTS WITHOUT METADATA\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function investigate() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    const withMetadata = [];
    const withoutMetadata = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.metadata) {
            withMetadata.push({
                id: doc.id,
                name: data.name,
                batch: data.metadata.batch || 'NO_BATCH_TAG',
                createdAt: data.createdAt || data.metadata.createdAt || null
            });
        } else {
            withoutMetadata.push({
                id: doc.id,
                ref: doc.ref,
                name: data.name,
                createdAt: data.createdAt,
                allFields: Object.keys(data)
            });
        }
    });
    
    console.log(`📊 BREAKDOWN:\n`);
    console.log(`   With metadata: ${withMetadata.length}`);
    console.log(`   Without metadata: ${withoutMetadata.length}`);
    console.log(`   TOTAL: ${snapshot.size}\n`);
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📋 RAW STRUCTURE OF 10 PRODUCTS WITHOUT METADATA:\n');
    
    for (let i = 0; i < Math.min(10, withoutMetadata.length); i++) {
        const product = withoutMetadata[i];
        const doc = await product.ref.get();
        const data = doc.data();
        
        console.log(`[${i + 1}] ${product.name} (ID: ${product.id})`);
        console.log(`    All fields: ${product.allFields.join(', ')}`);
        console.log(`    createdAt: ${product.createdAt}`);
        console.log(`    source_url (top-level): ${data.source_url || 'NOT FOUND'}`);
        console.log(`    Full raw data:`, JSON.stringify(data, null, 2).substring(0, 500));
        console.log(`    ─────────────────────────────────────────────────────\n`);
    }
    
    // Sort by createdAt to find timestamp patterns
    const sorted = withoutMetadata
        .filter(p => p.createdAt)
        .sort((a, b) => {
            const timeA = a.createdAt?.toDate?.() || new Date(a.createdAt);
            const timeB = b.createdAt?.toDate?.() || new Date(b.createdAt);
            return timeA - timeB;
        });
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📅 TIMESTAMP ANALYSIS:\n');
    console.log(`   Products with timestamp: ${sorted.length}\n`);
    
    if (sorted.length > 0) {
        const oldest = sorted[0];
        const newest = sorted[sorted.length - 1];
        const oldestTime = oldest.createdAt?.toDate?.() || new Date(oldest.createdAt);
        const newestTime = newest.createdAt?.toDate?.() || new Date(newest.createdAt);
        
        console.log(`   Oldest: ${oldest.name}`);
        console.log(`   Created: ${oldestTime.toISOString()}\n`);
        console.log(`   Newest: ${newest.name}`);
        console.log(`   Created: ${newestTime.toISOString()}\n`);
        
        // Try to find a gap that might separate original 120 from Batch 2
        console.log('   First 5 products (oldest):');
        for (let i = 0; i < Math.min(5, sorted.length); i++) {
            const time = sorted[i].createdAt?.toDate?.() || new Date(sorted[i].createdAt);
            console.log(`   - ${sorted[i].name} (${time.toISOString()})`);
        }
        
        console.log('\n   Last 5 products (newest):');
        for (let i = Math.max(0, sorted.length - 5); i < sorted.length; i++) {
            const time = sorted[i].createdAt?.toDate?.() || new Date(sorted[i].createdAt);
            console.log(`   - ${sorted[i].name} (${time.toISOString()})`);
        }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('🔍 CHECKING FOR BATCH 2 PRODUCT NAMES (Century Tuna, Boysen, etc.):\n');
    
    const batch2Keywords = ['Century Tuna', 'Boysen', 'San Miguel', 'Knorr', 'Nestea', 'Del Monte', 'Alaska', 'Argentina', 'Spam'];
    const possibleBatch2 = [];
    
    for (const product of withoutMetadata) {
        for (const keyword of batch2Keywords) {
            if (product.name.toLowerCase().includes(keyword.toLowerCase())) {
                possibleBatch2.push(product);
                break;
            }
        }
    }
    
    console.log(`   Found ${possibleBatch2.length} products matching Batch 2 keywords:\n`);
    for (let i = 0; i < Math.min(10, possibleBatch2.length); i++) {
        console.log(`   [${i + 1}] ${possibleBatch2[i].name}`);
    }
    
    console.log('\n✅ INVESTIGATION COMPLETE\n');
}

investigate()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
