const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

if (!getApps().length) {
  const sa = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function run() {
  console.log("=== DPA VERIFICATION: Privacy Consent ===");
  const usersSnap = await db.collection('users').where('email', '==', 'lili123456@gmail.com').get();
  
  if (usersSnap.empty) {
    console.log("❌ Test user not found.");
    return;
  }
  
  const user = usersSnap.docs[0].data();
  console.log("User Email:", user.email);
  console.log("Plan:", user.plan);
  
  if (user.privacyConsent) {
    console.log("✅ privacyConsent: true");
  } else {
    console.log("❌ privacyConsent is missing or false");
  }
  
  if (user.privacyConsentTimestamp) {
    console.log("✅ privacyConsentTimestamp:", user.privacyConsentTimestamp.toDate().toISOString());
  } else {
    console.log("❌ privacyConsentTimestamp is missing");
  }
  console.log("=========================================");
}

run().catch(console.error);
