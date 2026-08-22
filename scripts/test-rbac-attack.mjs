// Test RBAC using Admin SDK custom tokens — avoids Firebase Auth signup quota limits
import { readFileSync } from 'fs';
import { initializeApp as initAdminApp, getApps, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

// Init Admin SDK
if (!getApps().length) {
  const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
  initAdminApp({ credential: cert(serviceAccount) });
}
const adminAuth = getAdminAuth();
const adminDb = getFirestore();

const API_URL = "http://localhost:5002/api/v1";

async function mintIdToken(customToken) {
  const apiKey = JSON.parse(readFileSync('./dashboard/.env.local', 'utf8').split('\n')
    .find(l => l.startsWith('NEXT_PUBLIC_FIREBASE_API_KEY'))
    ?.split('=')[1]?.trim() || '""');
  return null; // fallback - will use Admin SDK's signInWithCustomToken equivalent via REST
}

async function getIdTokenForUid(uid) {
  // Create a custom token and exchange it for an ID token via REST
  const customToken = await adminAuth.createCustomToken(uid);
  
  // Exchange custom token for ID token using Firebase REST API
  const envContent = readFileSync('./dashboard/.env.local', 'utf8');
  const apiKeyMatch = envContent.match(/NEXT_PUBLIC_FIREBASE_API_KEY="?([^"\n]+)"?/);
  const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;
  
  if (!apiKey) throw new Error('Could not read NEXT_PUBLIC_FIREBASE_API_KEY');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to exchange custom token: ${err}`);
  }
  
  const data = await res.json();
  return data.idToken;
}

async function testRBAC() {
  console.log("=== RBAC Security Test ===\n");
  
  // Create temp users via Admin SDK
  const ts = Date.now();
  const customerUid = `test_customer_${ts}`;
  const adminUid = `test_admin_${ts}`;
  
  // Write user docs
  await adminDb.collection('users').doc(customerUid).set({
    email: `customer.${ts}@test.com`,
    role: 'Developer',
    plan: 'Free'
  });
  
  await adminDb.collection('users').doc(adminUid).set({
    email: `admin.${ts}@test.com`,
    role: 'admin',
    plan: 'Enterprise'
  });
  
  console.log("1. Getting ID tokens for Customer and Admin...");
  const customerToken = await getIdTokenForUid(customerUid);
  const adminToken = await getIdTokenForUid(adminUid);
  console.log("✅ Tokens acquired\n");

  let allPassed = true;

  // Test 1: No token -> 401
  console.log("TEST 1: No token → GET /admin/stats (Expect 401)");
  let res = await fetch(`${API_URL}/admin/stats`);
  const t1 = res.status === 401;
  console.log(`  Status: ${res.status} ${t1 ? '✅' : '❌ FAIL'}`);
  allPassed = allPassed && t1;

  // Test 2: Customer token -> 403
  console.log("TEST 2: Customer token → GET /admin/stats (Expect 403)");
  res = await fetch(`${API_URL}/admin/stats`, {
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });
  const t2 = res.status === 403;
  console.log(`  Status: ${res.status} ${t2 ? '✅' : '❌ FAIL'}`);
  const body2 = await res.json();
  console.log(`  Response: ${JSON.stringify(body2)}`);
  allPassed = allPassed && t2;

  // Test 3: Customer token -> 403 for product approve
  console.log("TEST 3: Customer token → PUT /product-requests/fake/approve (Expect 403)");
  res = await fetch(`${API_URL}/product-requests/fake-id/approve`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });
  const t3 = res.status === 403;
  console.log(`  Status: ${res.status} ${t3 ? '✅' : '❌ FAIL'}`);
  allPassed = allPassed && t3;

  // Test 4: Admin token -> 200 for stats
  console.log("TEST 4: Admin token → GET /admin/stats (Expect 200)");
  res = await fetch(`${API_URL}/admin/stats`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const t4 = res.status === 200;
  console.log(`  Status: ${res.status} ${t4 ? '✅' : '❌ FAIL'}`);
  if (t4) {
    const stats = await res.json();
    console.log(`  Data: usersCount=${stats.usersCount}, pendingCount=${stats.pendingCount}`);
  }
  allPassed = allPassed && t4;

  console.log(`\n=== Result: ${allPassed ? '✅ ALL RBAC TESTS PASSED' : '❌ SOME TESTS FAILED'} ===`);
  
  // Cleanup
  await adminDb.collection('users').doc(customerUid).delete();
  await adminDb.collection('users').doc(adminUid).delete();
  
  process.exit(allPassed ? 0 : 1);
}

testRBAC().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
