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

async function testE2E() {
  try {
    console.log('🧪 TESTING NOTIFICATIONS END-TO-END VIA FIREBASE SDK\n');
    
    // 1. Customer: Log in and create a request to admin
    console.log('--- CUSTOMER SIDE ---');
    await signInWithEmailAndPassword(auth, 'testcustomer_notif@example.com', 'Password123!');
    const customerUid = auth.currentUser.uid;
    console.log('✅ Customer logged in:', customerUid);
    
    console.log('Customer: Submitting product request notification to admin...');
    await addDoc(collection(db, 'notifications'), {
      userId: 'admin',
      type: 'product_request_submitted',
      title: 'E2E Test Request',
      body: 'Customer requested a product',
      read: false,
      createdAt: serverTimestamp(),
      meta: { requestId: '123' }
    });
    console.log('✅ Customer successfully wrote notification to admin');

    // 2. Admin: Log in, read admin notifications, and approve request
    console.log('\n--- ADMIN SIDE ---');
    await signInWithEmailAndPassword(auth, 'testadmin_notif@example.com', 'Password123!');
    const adminUid = auth.currentUser.uid;
    console.log('✅ Admin logged in:', adminUid);
    
    console.log('Admin: Reading "admin" notifications...');
    const adminQ = query(collection(db, 'notifications'), where('userId', '==', 'admin'), orderBy('createdAt', 'desc'));
    const adminSnap = await getDocs(adminQ);
    console.log(`✅ Admin read ${adminSnap.size} notifications addressed to "admin"`);
    
    console.log('Admin: Creating "approved" notification for customer...');
    await addDoc(collection(db, 'notifications'), {
      userId: customerUid,
      type: 'product_request_approved',
      title: 'Product Request Approved ✅',
      body: 'Your request was approved.',
      read: false,
      createdAt: serverTimestamp(),
    });
    console.log('✅ Admin successfully wrote notification to customer');
    
    // 3. Customer: Log back in and read notifications (including the approval and expiry)
    console.log('\n--- CUSTOMER SIDE (CHECK) ---');
    await signInWithEmailAndPassword(auth, 'testcustomer_notif@example.com', 'Password123!');
    
    console.log('Customer: Reading personal notifications...');
    const custQ = query(collection(db, 'notifications'), where('userId', '==', customerUid), orderBy('createdAt', 'desc'));
    const custSnap = await getDocs(custQ);
    console.log(`✅ Customer read ${custSnap.size} notifications addressed to them`);
    
    let foundApproved = false;
    custSnap.forEach(doc => {
      if (doc.data().type === 'product_request_approved') foundApproved = true;
    });
    
    if (foundApproved) {
      console.log('✅ Customer found the "approved" notification from admin');
    } else {
      throw new Error('Customer did not find the approved notification');
    }
    
    console.log('\n🎉 ALL NOTIFICATION END-TO-END TESTS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

testE2E();
