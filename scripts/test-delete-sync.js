/**
 * Test Delete Sync - Delete test product and verify it disappears
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🗑️  DELETE SYNC TEST\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function testDeleteSync() {
    const productsRef = db.collection('products');
    
    // Count products before
    const beforeSnapshot = await productsRef.get();
    console.log(`📊 Product count BEFORE delete: ${beforeSnapshot.size}\n`);
    
    // Find test product
    const testQuery = await productsRef
        .where('name', '==', 'TEST_SYNC_PRODUCT_E2E_EDITED')
        .limit(1)
        .get();
    
    if (testQuery.empty) {
        console.log('❌ Test product not found (may have been already deleted)\n');
        console.log('   Product name: TEST_SYNC_PRODUCT_E2E_EDITED');
        console.log('   SKU: TEST-99999\n');
        return;
    }
    
    const testDoc = testQuery.docs[0];
    const testData = testDoc.data();
    
    console.log('✅ Found test product:\n');
    console.log(`   Name: ${testData.name}`);
    console.log(`   SKU: ${testData.sku}`);
    console.log(`   Document ID: ${testDoc.id}\n`);
    
    console.log('🗑️  Deleting product from Firestore...\n');
    
    await testDoc.ref.delete();
    
    console.log('✅ Product deleted from Firestore\n');
    
    // Count products after
    const afterSnapshot = await productsRef.get();
    console.log(`📊 Product count AFTER delete: ${afterSnapshot.size}\n`);
    
    const difference = beforeSnapshot.size - afterSnapshot.size;
    console.log(`   Difference: -${difference} product${difference !== 1 ? 's' : ''}\n`);
    
    // Verify it's really gone
    const verifyQuery = await productsRef
        .where('name', '==', 'TEST_SYNC_PRODUCT_E2E_EDITED')
        .limit(1)
        .get();
    
    if (verifyQuery.empty) {
        console.log('✅ VERIFICATION PASSED: Product no longer exists in Firestore\n');
    } else {
        console.log('❌ VERIFICATION FAILED: Product still exists in Firestore!\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📋 MANUAL VERIFICATION NEEDED:\n');
    console.log('   1. Open customer dashboard: http://localhost:3000/dashboard/products');
    console.log('   2. Confirm product count shows 314 (was 315)');
    console.log('   3. Search for "TEST_SYNC_PRODUCT_E2E_EDITED" - should show no results\n');
    console.log('   Expected: Product disappeared from customer view\n');
}

testDeleteSync()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
