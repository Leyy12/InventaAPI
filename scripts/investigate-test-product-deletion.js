/**
 * Investigate how TEST_SYNC_PRODUCT_E2E_EDITED disappeared
 * Then create new test product for proper delete sync test
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🔍 INVESTIGATING TEST PRODUCT DELETION\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function investigate() {
    const productsRef = db.collection('products');
    
    // Check current count
    const snapshot = await productsRef.get();
    console.log(`📊 Current total products: ${snapshot.size}\n`);
    
    // Search for test product
    console.log('🔎 Searching for TEST_SYNC_PRODUCT_E2E_EDITED...\n');
    
    const testQuery = await productsRef
        .where('name', '==', 'TEST_SYNC_PRODUCT_E2E_EDITED')
        .get();
    
    if (testQuery.empty) {
        console.log('❌ Product NOT FOUND in Firestore\n');
        console.log('📜 Investigation:\n');
        console.log('   - Product was confirmed to exist earlier (uyGF3QKDKzMPLdl3nvDo)');
        console.log('   - Product count changed from 315 → 314');
        console.log('   - Likely deleted during earlier testing or manual cleanup\n');
    } else {
        console.log('✅ Product STILL EXISTS in Firestore\n');
        const doc = testQuery.docs[0];
        console.log(`   Document ID: ${doc.id}`);
        console.log(`   Data:`, JSON.stringify(doc.data(), null, 2), '\n');
    }
    
    // Search by SKU as backup
    console.log('🔎 Searching by SKU (TEST-99999)...\n');
    
    const skuQuery = await productsRef
        .where('sku', '==', 'TEST-99999')
        .get();
    
    if (skuQuery.empty) {
        console.log('❌ No product with SKU TEST-99999 found\n');
    } else {
        console.log('✅ Found product with SKU TEST-99999:\n');
        const doc = skuQuery.docs[0];
        console.log(`   Document ID: ${doc.id}`);
        console.log(`   Name: ${doc.data().name}\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📝 CREATING NEW TEST PRODUCT FOR DELETE SYNC TEST\n');
    
    // Create new test product
    const newTestProduct = {
        sku: 'TEST-DELETE-SYNC-2024',
        name: 'TEST_DELETE_SYNC_PRODUCT',
        category: 'Test Category',
        segment: 'Hardware',
        price: 999.99,
        size: 'N/A',
        description: 'Test product for delete sync verification',
        image_url: '',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    
    const newDocRef = await productsRef.add(newTestProduct);
    
    console.log('✅ Created new test product:\n');
    console.log(`   Document ID: ${newDocRef.id}`);
    console.log(`   Name: ${newTestProduct.name}`);
    console.log(`   SKU: ${newTestProduct.sku}\n`);
    
    // Verify count increased
    const afterSnapshot = await productsRef.get();
    console.log(`📊 Product count after creation: ${afterSnapshot.size}\n`);
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📋 NEXT STEPS - MANUAL DELETE SYNC TEST:\n');
    console.log('   1. Open customer dashboard: http://localhost:3000/dashboard/products');
    console.log(`   2. Search for "TEST_DELETE_SYNC_PRODUCT" - should show 1 result`);
    console.log(`   3. Note the current product count (should be ${afterSnapshot.size})\n`);
    console.log('   4. Open admin panel: http://localhost:4000/products');
    console.log('   5. Search for "TEST_DELETE_SYNC_PRODUCT"');
    console.log('   6. Delete the product from admin panel\n');
    console.log('   7. Refresh customer dashboard');
    console.log('   8. Confirm:');
    console.log('      - Product no longer appears in search');
    console.log(`      - Product count decreased to ${afterSnapshot.size - 1}\n`);
    console.log('   Expected: Delete sync works (product disappears from customer view)\n');
}

investigate()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
