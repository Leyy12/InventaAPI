import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const auth = getAuth();
const db = getFirestore();

async function createOrUpdateUser(email, password, role) {
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    await auth.updateUser(userRecord.uid, { password });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({ email, password });
    } else throw err;
  }
  
  await db.collection('users').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: email,
    fullName: role === 'Admin' ? 'Test Admin' : 'Test Customer',
    businessName: 'Test Business',
    businessSegment: 'Other',
    plan: 'Free',
    role: role,
    apiRequestLimit: role === 'Admin' ? 9999 : 50,
  }, { merge: true });
  
  console.log(`Setup ${role} account: ${email} -> UID: ${userRecord.uid}`);
}

async function main() {
  await createOrUpdateUser('testcustomer_notif@example.com', 'Password123!', 'Developer');
  await createOrUpdateUser('testadmin_notif@example.com', 'Password123!', 'Admin');
  process.exit(0);
}
main();
