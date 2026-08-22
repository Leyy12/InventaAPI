const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');

if (!getApps().length) {
  const sa = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function run() {
  console.log("=== DPA VERIFICATION: Delete My Account ===");
  const email = 'lili123456@gmail.com';
  
  // 1. Get User Profile
  const usersSnap = await db.collection('users').where('email', '==', email).get();
  if (usersSnap.empty) {
    console.log("Test user not found.");
    return;
  }
  const userRef = usersSnap.docs[0].ref;
  
  // 2. Perform the soft delete (as the API would do)
  await userRef.update({
    deletionRequested: true,
    deletionRequestedAt: FieldValue.serverTimestamp(),
    plan: 'Deleted',
    apiRequestsUsed: 0
  });

  // 3. Revoke all API keys
  const keysSnap = await db.collection('api_keys').where('userId', '==', usersSnap.docs[0].id).get();
  if (!keysSnap.empty) {
    const batch = db.batch();
    keysSnap.docs.forEach(doc => {
      batch.update(doc.ref, { status: 'revoked' });
    });
    await batch.commit();
    console.log(`✅ Revoked ${keysSnap.size} API keys.`);
  } else {
    console.log(`✅ No API keys to revoke.`);
  }

  // 4. Read back the document to verify
  const updatedDoc = await userRef.get();
  const userData = updatedDoc.data();
  
  console.log("Verification:");
  console.log("deletionRequested:", userData.deletionRequested);
  console.log("deletionRequestedAt:", userData.deletionRequestedAt.toDate().toISOString());
  console.log("plan:", userData.plan);
  console.log("===========================================");
}

run().catch(console.error);
