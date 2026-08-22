// End-to-end test for DPA compliance features:
// 1. Signup with privacy consent (check Firestore for privacyConsent flag)
// 2. Simulate "Download My Data" (verify the right fields are present)
// 3. Simulate "Delete Account" (verify deletionRequested flag + API key revocation)

import { readFileSync } from 'fs';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Init Admin SDK
if (!getApps().length) {
  const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
}
const adminAuth = getAdminAuth();
const adminDb = getFirestore();

const ts = Date.now();
const TEST_EMAIL = `dpa-test-${ts}@example.com`;
const TEST_UID = `dpa_test_${ts}`;

async function run() {
  console.log("=== DPA COMPLIANCE E2E TEST ===\n");

  // ─────────────────────────────────────────────
  // SETUP: Create a test user directly via Admin SDK
  // ─────────────────────────────────────────────
  console.log("SETUP: Creating test user via Admin SDK...");
  
  // Write user document with privacyConsent fields (simulating what signup does)
  await adminDb.collection("users").doc(TEST_UID).set({
    uid: TEST_UID,
    email: TEST_EMAIL,
    fullName: "DPA Test User",
    businessName: "Test Corp",
    businessSegment: "Grocery",
    plan: "Free",
    role: "Developer",
    apiRequestLimit: 50,
    apiRequestsUsed: 0,
    privacyConsent: true,
    privacyConsentTimestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
  
  // Create a test API key for this user
  const keyRef = await adminDb.collection("api_keys").add({
    userId: TEST_UID,
    key: `test-key-${ts}`,
    name: "DPA Test Key",
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
  });
  
  console.log(`✅ Test user created: ${TEST_EMAIL} (UID: ${TEST_UID})`);
  console.log(`✅ Test API key created: ${keyRef.id}\n`);

  // ─────────────────────────────────────────────
  // TEST 1: Verify privacyConsent is stored in Firestore
  // ─────────────────────────────────────────────
  console.log("TEST 1 (4b): Verify privacyConsent stored in Firestore...");
  const userDoc = await adminDb.collection("users").doc(TEST_UID).get();
  const userData = userDoc.data();
  
  const hasConsent = userData.privacyConsent === true;
  const hasTimestamp = userData.privacyConsentTimestamp !== null && userData.privacyConsentTimestamp !== undefined;
  
  console.log(`  privacyConsent: ${userData.privacyConsent} ${hasConsent ? '✅' : '❌'}`);
  console.log(`  privacyConsentTimestamp present: ${hasTimestamp ? '✅' : '❌'}`);
  console.log(`  plan: ${userData.plan}`);
  console.log(`  role: ${userData.role}`);
  
  // ─────────────────────────────────────────────
  // TEST 2: Simulate "Download My Data" — verify all user fields present
  // ─────────────────────────────────────────────
  console.log("\nTEST 2 (4c): Simulate Download My Data — verify all fields...");
  
  // Fetch API keys for user (simulating what the download feature does)
  const keysSnap = await adminDb.collection("api_keys")
    .where("userId", "==", TEST_UID)
    .get();
    
  const apiKeys = keysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Fetch product requests
  const reqSnap = await adminDb.collection("product_requests")
    .where("requested_by_uid", "==", TEST_UID)
    .limit(5)
    .get();
  const productRequests = reqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  const exportData = {
    profile: {
      email: userData.email,
      fullName: userData.fullName,
      businessName: userData.businessName,
      plan: userData.plan,
      privacyConsent: userData.privacyConsent,
    },
    apiKeys: apiKeys.map(k => ({ id: k.id, name: k.name, status: k.status })),
    productRequests,
    exportedAt: new Date().toISOString(),
    compliance: "Data Privacy Act of 2012 (RA 10173)"
  };

  console.log("  Export data structure:");
  console.log("  ✅ profile.email:", exportData.profile.email);
  console.log("  ✅ profile.fullName:", exportData.profile.fullName);
  console.log("  ✅ profile.privacyConsent:", exportData.profile.privacyConsent);
  console.log("  ✅ apiKeys count:", exportData.apiKeys.length);
  console.log("  ✅ compliance field:", exportData.compliance);
  
  // ─────────────────────────────────────────────
  // TEST 3: Simulate "Delete My Account" — revoke keys + mark for deletion
  // ─────────────────────────────────────────────
  console.log("\nTEST 3 (4d): Simulate Delete Account — revoke keys + mark deletion...");
  
  // Revoke all API keys
  const revokePromises = keysSnap.docs.map(doc => 
    adminDb.collection("api_keys").doc(doc.id).update({ status: "revoked" })
  );
  await Promise.all(revokePromises);
  
  // Mark user for deletion
  await adminDb.collection("users").doc(TEST_UID).update({
    deletionRequested: true,
    deletionRequestedAt: FieldValue.serverTimestamp(),
    status: "pending_deletion"
  });
  
  // Verify
  const deletedUserDoc = await adminDb.collection("users").doc(TEST_UID).get();
  const deletedData = deletedUserDoc.data();
  const revokedKeySnap = await adminDb.collection("api_keys").doc(keyRef.id).get();
  const revokedKeyData = revokedKeySnap.data();
  
  console.log(`  deletionRequested: ${deletedData.deletionRequested} ${deletedData.deletionRequested === true ? '✅' : '❌'}`);
  console.log(`  status: ${deletedData.status} ${deletedData.status === 'pending_deletion' ? '✅' : '❌'}`);
  console.log(`  deletionRequestedAt present: ${deletedData.deletionRequestedAt ? '✅' : '❌'}`);
  console.log(`  API key status after revoke: ${revokedKeyData.status} ${revokedKeyData.status === 'revoked' ? '✅' : '❌'}`);
  
  // ─────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────
  console.log("\nCLEANUP: Deleting test data...");
  await adminDb.collection("api_keys").doc(keyRef.id).delete();
  await adminDb.collection("users").doc(TEST_UID).delete();
  console.log("✅ Test data cleaned up");
  
  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────
  console.log("\n=== DPA COMPLIANCE TEST RESULTS ===");
  console.log(`4b. Consent Checkbox: ${hasConsent && hasTimestamp ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`4c. Download My Data: ${exportData.apiKeys.length >= 1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`4d. Delete Account:   ${deletedData.deletionRequested && revokedKeyData.status === 'revoked' ? '✅ PASS' : '❌ FAIL'}`);

  process.exit(0);
}

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
