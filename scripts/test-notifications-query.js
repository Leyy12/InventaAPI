import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, orderBy, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import dotenv from 'dotenv';

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

async function test() {
  try {
    await signInWithEmailAndPassword(auth, 'test.signup.1787372907634@example.com', 'Test123!');
    console.log('Logged in as:', auth.currentUser.uid);
    
    try {
      console.log('Adding test notification addressed to admin...');
      await addDoc(collection(db, 'notifications'), {
        userId: 'admin',
        type: 'product_request_submitted',
        title: 'Test Request',
        body: 'This is a test request',
        read: false,
        createdAt: serverTimestamp(),
      });
      console.log('Successfully added notification.');
    } catch (err) {
      console.error('Failed to add notification:', err.message);
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    
    console.log('Executing query for user notifications...');
    const snap = await getDocs(q);
    console.log('Query succeeded! Found', snap.size, 'notifications.');
    
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err.message);
    process.exit(1);
  }
}
test();
