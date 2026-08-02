/**
 * Fix User Role Script
 * Ensures delarosaleah38@gmail.com is NOT an admin
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
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
const db = getFirestore(app);

async function fixUserRole() {
  try {
    console.log('🔍 Searching for user: delarosaleah38@gmail.com\n');
    
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', 'delarosaleah38@gmail.com'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log('❌ User not found in Firestore');
      console.log('💡 This user needs to sign up first to create a Firestore document');
      process.exit(1);
    }
    
    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();
    
    console.log('📋 Current user data:');
    console.log(`   Name: ${userData.fullName || 'N/A'}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Role: ${userData.role || 'N/A'}`);
    console.log(`   Plan: ${userData.plan || 'N/A'}`);
    console.log(`   Business: ${userData.businessName || 'N/A'}`);
    console.log(`   Segment: ${userData.businessSegment || 'N/A'}\n`);
    
    if (userData.role === 'Admin') {
      console.log('⚠️  This user is currently an ADMIN - fixing to Customer role...\n');
      
      await updateDoc(doc(db, 'users', userDoc.id), {
        role: 'Customer',
        fullName: 'Leah M. Dela Rosa',
        businessName: 'Dela Rosa Store',
        businessSegment: 'Hardware Store',
        plan: 'Professional',
        subscription_status: 'active'
      });
      
      console.log('✅ User role fixed!');
      console.log('   New role: Customer');
      console.log('   Plan: Professional (active subscription)');
    } else {
      console.log('✅ User role is already correct (Customer)');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixUserRole();
