/**
 * Check source_url fields in LIVE FIRESTORE DATABASE
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

console.log('🔍 SOURCE_URL FIELD CHECK\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function checkSourceUrls() {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    
    console.log(`📊 Total products: ${snapshot.size}\n`);
    
    let withSourceUrl = 0;
    let withoutSourceUrl = 0;
    const sourceUrlSamples = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.source_url) {
            withSourceUrl++;
            if (sourceUrlSamples.length < 5) {
                sourceUrlSamples.push({
                    id: doc.id,
                    name: data.name,
                    source_url: data.source_url
                });
            }
        } else {
            withoutSourceUrl++;
        }
    });
    
    console.log(`✅ Products WITH source_url: ${withSourceUrl}`);
    console.log(`❌ Products WITHOUT source_url: ${withoutSourceUrl}\n`);
    
    if (withSourceUrl > 0) {
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('📋 SAMPLE PRODUCTS WITH source_url:\n');
        sourceUrlSamples.forEach((product, index) => {
            console.log(`[${index + 1}] ${product.name}`);
            console.log(`    ID: ${product.id}`);
            console.log(`    source_url: ${product.source_url}\n`);
        });
    }
    
    return { withSourceUrl, withoutSourceUrl };
}

checkSourceUrls()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
