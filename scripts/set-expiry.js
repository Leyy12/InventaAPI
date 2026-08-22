import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function setExpiry() {
  const uid = '4P1LtSUfWzawZShLzUWvrDbFEAI3'; // testcustomer_notif@example.com
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 2); // 2 days from now
  
  await db.collection('users').doc(uid).set({
    plan: 'Pro',
    subscriptionExpiresAt: expiresAt.toISOString()
  }, { merge: true });
  
  console.log('Set expiry to 2 days from now for ' + uid);
  process.exit(0);
}

setExpiry();
