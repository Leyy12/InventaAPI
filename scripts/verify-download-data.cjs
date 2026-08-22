const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

if (!getApps().length) {
  const sa = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function run() {
  console.log("=== DPA VERIFICATION: Download My Data ===");
  const email = 'lili123456@gmail.com';
  
  // 1. Get User Profile
  const usersSnap = await db.collection('users').where('email', '==', email).get();
  if (usersSnap.empty) {
    console.log("Test user not found.");
    return;
  }
  const userDoc = usersSnap.docs[0];
  const userData = userDoc.data();
  const uid = userDoc.id;
  
  // 2. Get API Keys
  const keysSnap = await db.collection('api_keys').where('userId', '==', uid).get();
  const apiKeys = keysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // 3. Get Product Requests
  const requestsSnap = await db.collection('product_requests').where('requested_by_uid', '==', uid).get();
  const productRequests = requestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Assemble the final JSON payload exactly like the API would
  const exportData = {
    profile: {
      uid: uid,
      email: userData.email,
      fullName: userData.fullName || userData.name,
      businessName: userData.businessName,
      businessSegment: userData.businessSegment,
      plan: userData.plan,
      role: userData.role,
      privacyConsentTimestamp: userData.privacyConsentTimestamp ? userData.privacyConsentTimestamp.toDate() : null
    },
    apiKeys: apiKeys,
    productRequests: productRequests,
    exportDate: new Date().toISOString()
  };

  console.log("JSON Output:");
  console.log(JSON.stringify(exportData, null, 2));
  console.log("==========================================");
}

run().catch(console.error);
