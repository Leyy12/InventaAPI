const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

if (!getApps().length) {
  const sa = JSON.parse(fs.readFileSync('./service-account.json', 'utf8'));
  initializeApp({ credential: cert(sa) });
}

const auth = getAuth();
const db = getFirestore();

async function setupSuperAdmin() {
  const email = 'superadmin@inventaapi.com';
  const password = 'SuperAdmin123!';
  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`User ${email} already exists. Updating password...`);
    await auth.updateUser(userRecord.uid, { password });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`User ${email} not found. Creating...`);
      userRecord = await auth.createUser({
        email,
        password,
        displayName: 'Super Admin',
      });
    } else {
      console.error('Error fetching user:', error);
      process.exit(1);
    }
  }

  console.log(`Ensuring Firestore record has admin role for uid: ${userRecord.uid}`);
  await db.collection('users').doc(userRecord.uid).set({
    email,
    role: 'admin',
    fullName: 'Super Admin',
    createdAt: new Date(),
  }, { merge: true });

  console.log('Super Admin setup complete!');
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

setupSuperAdmin().catch(console.error);
