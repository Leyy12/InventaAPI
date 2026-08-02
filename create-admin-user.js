/**
 * Create Admin User Script
 * 
 * This script creates a new admin user in Firebase Auth and Firestore
 * Run with: node create-admin-user.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config();

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// New admin user credentials
const ADMIN_EMAIL = 'superadmin@inventaapi.com';
const ADMIN_PASSWORD = 'SuperAdmin2024!';  // Strong password for testing

async function createAdminUser() {
  try {
    console.log('🔥 Creating admin user...');
    console.log('📧 Email:', ADMIN_EMAIL);
    console.log('🔑 Password:', ADMIN_PASSWORD);
    console.log('');

    // Step 1: Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    
    const user = userCredential.user;
    console.log('✅ Firebase Auth user created');
    console.log('   UID:', user.uid);
    console.log('');

    // Step 2: Create user document in Firestore with admin role
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: ADMIN_EMAIL,
      fullName: 'Admin User',
      role: 'admin',  // ⭐ This is the key field
      plan: 'Unlimited',
      businessName: 'InventaAPI',
      createdAt: new Date().toISOString(),
      isActive: true,
    });

    console.log('✅ Firestore user document created with admin role');
    console.log('');
    console.log('🎉 SUCCESS! Admin user created successfully!');
    console.log('');
    console.log('📋 Login credentials:');
    console.log('   Email:', ADMIN_EMAIL);
    console.log('   Password:', ADMIN_PASSWORD);
    console.log('');
    console.log('🔗 Login at: http://localhost:3001/login');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating admin user:', error.code, error.message);
    
    if (error.code === 'auth/email-already-in-use') {
      console.log('');
      console.log('⚠️  This email is already registered.');
      console.log('💡 Try logging in with:');
      console.log('   Email:', ADMIN_EMAIL);
      console.log('   Password: [the password you used before]');
      console.log('');
      console.log('Or change the email in this script and run again.');
    }
    
    process.exit(1);
  }
}

// Run the script
createAdminUser();
