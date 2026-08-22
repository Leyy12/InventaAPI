import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: './dashboard/.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function testLogoutFlow() {
  const email = 'testcustomer_notif@example.com';
  const password = 'Test123!';

  try {
    const timestamp = Date.now();
    const testEmail = `logout.test.${timestamp}@example.com`;
    console.log(`1. Creating temp user ${testEmail}...`);
    
    // Use createUser instead of signIn to guarantee success
    const { createUserWithEmailAndPassword } = await import('firebase/auth');
    const cred = await createUserWithEmailAndPassword(auth, testEmail, password);
    const user = cred.user;
    console.log(`✅ Logged in as ${user.uid}`);

    // Wait 2 seconds to ensure auth state stabilizes
    await new Promise(r => setTimeout(r, 2000));

    console.log('2. Simulating logout flow (write audit_logs then signout)...');
    
    // Simulate what the React code does:
    await addDoc(collection(db, "audit_logs"), {
      action: "Customer Logout",
      userId: user.uid,
      email: user.email,
      timestamp: serverTimestamp(),
    });
    console.log('✅ Audit log written to Firestore successfully');

    await signOut(auth);
    console.log('✅ Signed out of Firebase Auth');

    // Now let's use the Admin SDK to verify the log exists
    // (since client can't read audit_logs if they are not admin)
    console.log('3. Verifying the log was saved in the database...');
    
    // Need admin SDK for verification because of firestore rules (admin read-only)
    const admin = await import('firebase-admin/app');
    const firestoreAdmin = await import('firebase-admin/firestore');
    
    if (!admin.getApps().length) {
      const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
      admin.initializeApp({ credential: admin.cert(serviceAccount) });
    }
    const adminDb = firestoreAdmin.getFirestore();
    
    const snap = await adminDb.collection('audit_logs')
      .where('userId', '==', user.uid)
      .where('action', '==', 'Customer Logout')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
      
    if (!snap.empty) {
      const doc = snap.docs[0].data();
      console.log('🎉 SUCCESS! Found the logout log in Firestore:');
      console.log(JSON.stringify({
        action: doc.action,
        email: doc.email,
        time: doc.timestamp ? doc.timestamp.toDate() : 'unknown'
      }, null, 2));
    } else {
      console.error('❌ FAILED: Log was not found in the database');
    }

  } catch (err) {
    console.error('❌ Error during test:', err);
  } finally {
    process.exit(0);
  }
}

testLogoutFlow();
