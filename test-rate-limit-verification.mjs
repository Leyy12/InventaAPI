import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

console.log('═══════════════════════════════════════════════════════════════');
console.log('🧪 RATE LIMIT VERIFICATION TEST - FRESH API KEY');
console.log('═══════════════════════════════════════════════════════════════\n');

// Create a FRESH Free-tier test user
const userId = 'test_limit_verify_' + Date.now();
await db.collection('users').doc(userId).set({
    uid: userId,
    fullName: 'Rate Limit Test User',
    email: 'ratelimit@test.local',
    plan: 'Starter',
    apiRequestLimit: 50,
    apiRequestsUsed: 0,
    role: 'Developer',
    createdAt: new Date().toISOString()
});

// Create a FRESH API key
const keyString = `daas_verify_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
await db.collection('api_keys').add({
    key: keyString,
    name: 'Rate Limit Verification Key',
    userId: userId,
    userEmail: 'ratelimit@test.local',
    plan: 'Starter',
    requestsUsed: 0,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    status: 'active',
    linkedProducts: [],
    linkedProductIds: []
});

console.log('✅ Created fresh test key:');
console.log(`   Key: ${keyString}`);
console.log(`   User: ${userId}`);
console.log(`   Limit: 50 requests/day\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 POWERSHELL TEST COMMAND:');
console.log('═══════════════════════════════════════════════════════════════\n');

// Output PowerShell loop command that shows request 50 succeeds, request 51 fails
console.log(`# Test loop: requests 1-51 (expect 50 to succeed, 51 to fail with 429)`);
console.log(`for ($i=1; $i -le 51; $i++) {`);
console.log(`    try {`);
console.log(`        Invoke-WebRequest -Uri "http://localhost:5000/daas/v1/catalog" -Headers @{"x-api-key"="${keyString}"} -UseBasicParsing -ErrorAction Stop | Out-Null`);
console.log(`        Write-Host "Request $i : ✅ OK"`);
console.log(`    } catch {`);
console.log(`        if ($_.Exception.Response.StatusCode.value__ -eq 429) {`);
console.log(`            Write-Host "Request $i : ❌ 429 RATE LIMIT EXCEEDED"`);
console.log(`            Write-Host "Response: $($_.ErrorDetails.Message)"`);
console.log(`            break`);
console.log(`        } else {`);
console.log(`            Write-Host "Request $i : ❌ Error $($_.Exception.Response.StatusCode.value__)"`);
console.log(`        }`);
console.log(`    }`);
console.log(`}\n`);

console.log('═══════════════════════════════════════════════════════════════');

process.exit(0);
