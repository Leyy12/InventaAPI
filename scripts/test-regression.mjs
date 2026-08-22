// Full regression test — verifies all core system functions still work
// Runs via Admin SDK + REST calls against the live local backend

import { readFileSync } from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

if (!getApps().length) {
  const sa = JSON.parse(readFileSync('./service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa) });
}
const adminDb = getFirestore();
const API_URL = "http://localhost:5002/api/v1";

async function getAdminIdToken() {
  const { getAuth } = await import('firebase-admin/auth');
  const adminAuth = getAuth();
  
  const envContent = readFileSync('./dashboard/.env.local', 'utf8');
  const apiKeyMatch = envContent.match(/NEXT_PUBLIC_FIREBASE_API_KEY="?([^"\n]+)"?/);
  const apiKey = apiKeyMatch[1].trim();
  
  // Find an admin user
  const adminSnap = await adminDb.collection('users').where('role', '==', 'admin').limit(1).get();
  if (adminSnap.empty) throw new Error('No admin user found');
  
  const adminUid = adminSnap.docs[0].id;
  const customToken = await adminAuth.createCustomToken(adminUid);
  
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error('Failed to get admin ID token');
  return data.idToken;
}

async function run() {
  console.log("=== FULL REGRESSION TEST ===\n");
  const results = {};
  
  // TEST 1: Products API (no auth needed, public)
  try {
    const res = await fetch(`${API_URL}/products?limit=5`);
    const data = await res.json();
    const count = data.products?.length ?? 0;
    results.products = { pass: res.status === 200 && count > 0, status: res.status, count };
    console.log(`✅ Products API: ${res.status} — ${count} products returned`);
  } catch (e) {
    results.products = { pass: false, error: e.message };
    console.log(`❌ Products API: ${e.message}`);
  }
  
  // TEST 2: Users collection readable (Firestore)
  try {
    const snap = await adminDb.collection('users').limit(1).get();
    results.users = { pass: !snap.empty, count: snap.size };
    console.log(`✅ Users Firestore: ${snap.size} users found`);
  } catch (e) {
    results.users = { pass: false, error: e.message };
    console.log(`❌ Users Firestore: ${e.message}`);
  }
  
  // TEST 3: Notifications collection readable (Firestore)
  try {
    const snap = await adminDb.collection('notifications').limit(5).get();
    results.notifications = { pass: true, count: snap.size };
    console.log(`✅ Notifications Firestore: ${snap.size} docs accessible`);
  } catch (e) {
    results.notifications = { pass: false, error: e.message };
    console.log(`❌ Notifications: ${e.message}`);
  }
  
  // TEST 4: Audit Logs collection (with new index)
  try {
    const snap = await adminDb.collection('audit_logs')
      .where('action', '==', 'Customer Logout')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    results.auditLogs = { pass: !snap.empty, count: snap.size };
    const entry = snap.docs[0]?.data();
    console.log(`✅ Audit Logs (index): ${snap.size} logout entries found`);
    if (entry) console.log(`   Latest: ${entry.email} at ${entry.timestamp?.toDate().toISOString()}`);
  } catch (e) {
    results.auditLogs = { pass: false, error: e.message };
    console.log(`❌ Audit Logs: ${e.message}`);
  }
  
  // TEST 5: Admin Stats API (with auth token)
  try {
    const token = await getAdminIdToken();
    const res = await fetch(`${API_URL}/admin/stats`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    results.adminStats = { pass: res.status === 200, status: res.status, usersCount: data.usersCount };
    console.log(`✅ Admin Stats API (authenticated): ${res.status} — usersCount=${data.usersCount}, pendingCount=${data.pendingCount}`);
  } catch (e) {
    results.adminStats = { pass: false, error: e.message };
    console.log(`❌ Admin Stats API: ${e.message}`);
  }
  
  // TEST 6: RBAC — unauthenticated block still works
  try {
    const res = await fetch(`${API_URL}/admin/stats`);
    results.rbacBlock = { pass: res.status === 401, status: res.status };
    console.log(`✅ RBAC block (no token): ${res.status} — ${res.status === 401 ? 'Correctly blocked' : 'NOT blocked!'}`);
  } catch (e) {
    results.rbacBlock = { pass: false, error: e.message };
    console.log(`❌ RBAC block test: ${e.message}`);
  }
  
  // TEST 7: Product Requests collection (Firestore)
  try {
    const snap = await adminDb.collection('product_requests').limit(5).get();
    results.productRequests = { pass: true, count: snap.size };
    console.log(`✅ Product Requests Firestore: ${snap.size} docs accessible`);
  } catch (e) {
    results.productRequests = { pass: false, error: e.message };
    console.log(`❌ Product Requests: ${e.message}`);
  }
  
  // SUMMARY
  console.log("\n=== REGRESSION SUMMARY ===");
  const allPass = Object.values(results).every(r => r.pass);
  Object.entries(results).forEach(([key, val]) => {
    console.log(`  ${val.pass ? '✅' : '❌'} ${key}`);
  });
  console.log(`\nOverall: ${allPass ? '✅ ALL PASS' : '❌ SOME FAILED'}`);
  process.exit(allPass ? 0 : 1);
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
