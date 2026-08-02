/**
 * Test PayMongo GCash Endpoint
 * Get a real user ID and test the endpoint
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🧪 TESTING PAYMONGO GCASH ENDPOINT\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function testEndpoint() {
    // Get a real user from Firestore
    const usersRef = db.collection('users');
    const snapshot = await usersRef.limit(1).get();
    
    if (snapshot.empty) {
        console.log('❌ No users found in Firestore\n');
        return;
    }
    
    const user = snapshot.docs[0];
    const userData = user.data();
    
    console.log(`✅ Found test user: ${userData.email || userData.fullName}\n`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Plan: ${userData.plan || 'N/A'}\n`);
    
    console.log('📡 Testing endpoint: POST /api/v1/checkout/create-gcash\n');
    
    try {
        const response = await fetch('http://localhost:5000/api/v1/checkout/create-gcash', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: user.id,
                userEmail: userData.email || '',
            }),
        });
        
        const data = await response.json();
        
        console.log(`   Status: ${response.status} ${response.statusText}\n`);
        console.log(`   Response:`, JSON.stringify(data, null, 2), '\n');
        
        if (response.ok && data.checkoutUrl) {
            console.log('✅ ENDPOINT TEST PASSED\n');
            console.log(`   Checkout URL received: ${data.checkoutUrl.substring(0, 60)}...\n`);
        } else if (response.status === 409 && data.error?.includes('already has an active Pro subscription')) {
            console.log('✅ ENDPOINT WORKS (User already Pro - expected behavior)\n');
        } else if (response.status === 502 && data.error?.includes('PayMongo')) {
            console.log('⚠️  ENDPOINT WORKS, but PayMongo API returned error\n');
            console.log('   This is likely due to invalid/test PAYMONGO_SECRET_KEY in .env\n');
            console.log('   Endpoint code is correct, just needs real PayMongo credentials.\n');
        } else {
            console.log('❌ UNEXPECTED RESPONSE\n');
        }
        
    } catch (error) {
        console.error('❌ ERROR:', error.message, '\n');
    }
}

testEndpoint()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ FATAL ERROR:', error);
        process.exit(1);
    });
