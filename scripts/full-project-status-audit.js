/**
 * Full Project Status Audit
 * Evidence-based verification of all pending items
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🔍 FULL PROJECT STATUS AUDIT\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}`);
console.log(`⏰ Audit Time: ${new Date().toISOString()}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function auditProject() {
    
    // ========================================================================
    // ITEM 5: PRODUCT IMAGES - Check if using Unsplash or Firebase Storage
    // ========================================================================
    console.log('📸 ITEM 5: PRODUCT IMAGES SOURCE CHECK\n');
    
    const productsRef = db.collection('products');
    const snapshot = await productsRef.limit(20).get();
    
    let unsplashCount = 0;
    let firebaseCount = 0;
    let emptyCount = 0;
    let otherCount = 0;
    const sampleImages = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const imageUrl = data.image_url || data.image;
        
        if (!imageUrl || imageUrl === '') {
            emptyCount++;
        } else if (imageUrl.includes('unsplash.com')) {
            unsplashCount++;
            if (sampleImages.length < 5) {
                sampleImages.push({ name: data.name, url: imageUrl });
            }
        } else if (imageUrl.includes('firebase') || imageUrl.includes('googleapis.com')) {
            firebaseCount++;
            if (sampleImages.length < 5) {
                sampleImages.push({ name: data.name, url: imageUrl });
            }
        } else {
            otherCount++;
            if (sampleImages.length < 5) {
                sampleImages.push({ name: data.name, url: imageUrl });
            }
        }
    });
    
    console.log(`   Checked ${snapshot.size} products:\n`);
    console.log(`   Using Unsplash Source: ${unsplashCount}`);
    console.log(`   Using Firebase Storage: ${firebaseCount}`);
    console.log(`   Empty/No image: ${emptyCount}`);
    console.log(`   Other sources: ${otherCount}\n`);
    
    if (sampleImages.length > 0) {
        console.log('   Sample image URLs:');
        for (const sample of sampleImages) {
            console.log(`   - ${sample.name}: ${sample.url.substring(0, 80)}...`);
        }
    }
    
    if (unsplashCount > 0) {
        console.log('\n   ❌ STATUS: Still using deprecated Unsplash Source');
        console.log('   📋 ACTION NEEDED: Migrate to Firebase Storage or alternative\n');
    } else if (firebaseCount > 0) {
        console.log('\n   ✅ STATUS: Using Firebase Storage\n');
    } else {
        console.log('\n   ⏳ STATUS: No images or using other sources\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // ========================================================================
    // ITEM 7: PAYMONGO GCASH ENDPOINT CHECK
    // ========================================================================
    console.log('💳 ITEM 7: PAYMONGO GCASH ENDPOINT CHECK\n');
    
    const endpointFile = 'routes/checkout.js';
    if (existsSync(endpointFile)) {
        const content = readFileSync(endpointFile, 'utf8');
        
        // Check for the endpoint definition
        const hasGcashEndpoint = content.includes('/create-gcash') || content.includes('create-gcash');
        const hasCorrectPayMongoURL = content.includes('api.paymongo.com/v1/');
        
        console.log(`   File exists: ${endpointFile}`);
        console.log(`   Has /create-gcash endpoint: ${hasGcashEndpoint}`);
        console.log(`   Has correct PayMongo API URL: ${hasCorrectPayMongoURL}\n`);
        
        // Show relevant lines
        const lines = content.split('\n');
        console.log('   Relevant code sections:');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('create-gcash') || 
                (lines[i].includes('paymongo') && lines[i].includes('http'))) {
                console.log(`   Line ${i + 1}: ${lines[i].trim()}`);
            }
        }
        
        console.log('\n   ⏳ STATUS: Code exists, needs actual API test to confirm fix\n');
    } else {
        console.log(`   ❌ File not found: ${endpointFile}\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // ========================================================================
    // ITEM 1: FIRESTORE INDEXES DEPLOYMENT STATUS
    // ========================================================================
    console.log('📊 ITEM 1: FIRESTORE INDEXES DEPLOYMENT STATUS\n');
    
    const indexFile = 'firestore.indexes.json';
    if (existsSync(indexFile)) {
        const indexes = JSON.parse(readFileSync(indexFile, 'utf8'));
        console.log(`   Index file exists: ${indexFile}`);
        console.log(`   Number of indexes defined: ${indexes.indexes?.length || 0}\n`);
        
        if (indexes.indexes && indexes.indexes.length > 0) {
            console.log('   Defined indexes:');
            for (const index of indexes.indexes) {
                console.log(`   - Collection: ${index.collectionGroup}`);
                console.log(`     Fields: ${index.fields?.map(f => f.fieldPath).join(', ')}`);
                console.log(`     Query scope: ${index.queryScope}\n`);
            }
        }
        
        console.log('   ⏳ STATUS: Index file exists, deployment status unknown');
        console.log('   📋 VERIFY: Run `firebase deploy --only firestore:indexes` to confirm\n');
    } else {
        console.log(`   ❌ File not found: ${indexFile}\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // ========================================================================
    // ITEM 2: FIRESTORE SECURITY RULES DEPLOYMENT STATUS
    // ========================================================================
    console.log('🔒 ITEM 2: FIRESTORE SECURITY RULES DEPLOYMENT STATUS\n');
    
    const rulesFile = 'FINAL_FIRESTORE_RULES_TO_PUBLISH.rules';
    const defaultRulesFile = 'firestore.rules';
    
    if (existsSync(rulesFile)) {
        const content = readFileSync(rulesFile, 'utf8');
        console.log(`   Rules file exists: ${rulesFile}`);
        console.log(`   File size: ${content.length} characters`);
        console.log(`   Contains "allow read" rules: ${content.includes('allow read')}`);
        console.log(`   Contains "allow write" rules: ${content.includes('allow write')}\n`);
        
        console.log('   ⏳ STATUS: Rules file exists, deployment status unknown');
        console.log('   📋 VERIFY: Run `firebase deploy --only firestore:rules` to confirm\n');
    } else if (existsSync(defaultRulesFile)) {
        console.log(`   Found default rules file: ${defaultRulesFile}`);
        console.log(`   ❌ Custom rules file not found: ${rulesFile}\n`);
    } else {
        console.log(`   ❌ No rules files found\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // ========================================================================
    // ITEM 6: ADMIN-TO-CUSTOMER PRODUCT SYNC - DELETE TEST
    // ========================================================================
    console.log('🗑️  ITEM 6: ADMIN-TO-CUSTOMER PRODUCT SYNC - DELETE TEST\n');
    
    // Check if test product exists
    const testProductQuery = await productsRef
        .where('name', '==', 'TEST_SYNC_PRODUCT_E2E_EDITED')
        .limit(1)
        .get();
    
    if (!testProductQuery.empty) {
        const testProduct = testProductQuery.docs[0];
        console.log(`   ✅ Test product found: ${testProduct.data().name}`);
        console.log(`   Document ID: ${testProduct.id}`);
        console.log(`   SKU: ${testProduct.data().sku}\n`);
        console.log('   📋 ACTION NEEDED: Delete this product from admin and verify it disappears\n');
    } else {
        console.log('   ❌ Test product not found (may have been already deleted)\n');
        console.log('   📋 ACTION NEEDED: Create new test product, then test delete sync\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('📋 AUDIT SUMMARY\n');
    console.log('Items requiring manual verification:\n');
    console.log('   ⏳ Item 1: Firestore indexes - run deployment command');
    console.log('   ⏳ Item 2: Firestore rules - run deployment command');
    console.log('   ⏳ Item 3: Button colors - visual screenshot needed');
    console.log('   ⏳ Item 4: Coming Soon pages - manual click tests needed');
    console.log(`   ${unsplashCount > 0 ? '❌' : '✅'} Item 5: Product images - ${unsplashCount > 0 ? 'still using Unsplash' : 'no Unsplash detected'}`);
    console.log('   ⏳ Item 6: Delete sync test - needs actual deletion test');
    console.log('   ⏳ Item 7: PayMongo endpoint - needs API test');
    console.log('   ⏳ Item 8: Auth redirect fix - needs login test\n');
    
    console.log('✅ AUDIT COMPLETE\n');
}

auditProject()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
