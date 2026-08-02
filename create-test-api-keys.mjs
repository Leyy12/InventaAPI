import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

console.log('═══════════════════════════════════════════════════════════════');
console.log('🔧 CREATING TEST USERS & API KEYS FOR PLAN ENFORCEMENT TESTING');
console.log('═══════════════════════════════════════════════════════════════\n');

// Create Free-tier test user
const freeUserId = 'test_free_user_' + Date.now();
await db.collection('users').doc(freeUserId).set({
    uid: freeUserId,
    fullName: 'Test Free User',
    email: 'testfree@example.com',
    plan: 'Starter',  // Free tier
    apiRequestLimit: 50,
    apiRequestsUsed: 0,
    role: 'Developer',
    createdAt: new Date().toISOString()
});

console.log('✅ Created FREE user:');
console.log(`   User ID: ${freeUserId}`);
console.log(`   Plan: Starter (Free)`);
console.log(`   Limit: 50 req/day\n`);

// Create Pro-tier test user
const proUserId = 'test_pro_user_' + Date.now();
await db.collection('users').doc(proUserId).set({
    uid: proUserId,
    fullName: 'Test Pro User',
    email: 'testpro@example.com',
    plan: 'Pro',
    apiRequestLimit: 5000,
    apiRequestsUsed: 0,
    role: 'Developer',
    subscription_status: 'active',
    createdAt: new Date().toISOString()
});

console.log('✅ Created PRO user:');
console.log(`   User ID: ${proUserId}`);
console.log(`   Plan: Pro`);
console.log(`   Limit: 5000 req/day\n`);

// Create API key for Free user
const freeKeyString = `daas_test_free_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
const freeKeyRef = await db.collection('api_keys').add({
    key: freeKeyString,
    name: 'Test Free API Key',
    userId: freeUserId,
    userEmail: 'testfree@example.com',
    plan: 'Starter',
    requestsUsed: 0,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    status: 'active',
    linkedProducts: [],
    linkedProductIds: []
});

console.log('✅ Created FREE API key:');
console.log(`   Key: ${freeKeyString}`);
console.log(`   Doc ID: ${freeKeyRef.id}\n`);

// Create API key for Pro user
const proKeyString = `daas_test_pro_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
const proKeyRef = await db.collection('api_keys').add({
    key: proKeyString,
    name: 'Test Pro API Key',
    userId: proUserId,
    userEmail: 'testpro@example.com',
    plan: 'Pro',
    requestsUsed: 0,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    status: 'active',
    linkedProducts: [],
    linkedProductIds: []
});

console.log('✅ Created PRO API key:');
console.log(`   Key: ${proKeyString}`);
console.log(`   Doc ID: ${proKeyRef.id}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 TEST COMMANDS:');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('# Test 1: Free user hits /sales-feed (should get 403)');
console.log(`Invoke-WebRequest -Uri "http://localhost:5000/api/v1/daas/sales-feed" -Headers @{"x-api-key"="${freeKeyString}"} -ErrorAction SilentlyContinue | Select-Object StatusCode,Content\n`);

console.log('# Test 2: Pro user hits /sales-feed (should get 200)');
console.log(`Invoke-WebRequest -Uri "http://localhost:5000/api/v1/daas/sales-feed" -Headers @{"x-api-key"="${proKeyString}"} | Select-Object StatusCode,Content\n`);

console.log('# Test 3: Free user hits /catalog (should get 200 with rate limit info)');
console.log(`Invoke-WebRequest -Uri "http://localhost:5000/api/v1/daas/catalog" -Headers @{"x-api-key"="${freeKeyString}"} | Select-Object StatusCode,Content\n`);

console.log('═══════════════════════════════════════════════════════════════');

process.exit(0);
