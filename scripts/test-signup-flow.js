/**
 * Test Signup Flow - Simulates Dashboard Signup
 * 
 * This script tests if the current Firestore rules allow signup
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';
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

// Test data - exact same format as dashboard signup
const testEmail = `test.signup.${Date.now()}@example.com`;
const testPassword = 'Test123!';

console.log('🧪 TESTING SIGNUP FLOW\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📧 Test Email: ${testEmail}`);
console.log(`🔒 Test Password: ${testPassword}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function testSignup() {
    try {
        console.log('STEP 1: Creating Firebase Auth account...\n');
        
        const userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
        const user = userCredential.user;
        
        console.log('   ✅ Firebase Auth account created');
        console.log(`   UID: ${user.uid}\n`);
        
        console.log('STEP 2: Creating Firestore user document...\n');
        
        // EXACT same data structure as dashboard signup (line 52-64)
        const userData = {
            uid: user.uid,
            fullName: "Test User",
            email: testEmail,
            businessName: "Test Business",
            businessSegment: "Hardware Store",
            plan: "Starter",
            role: "Developer",
            apiRequestLimit: 50,
            apiRequestsUsed: 0,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp()
        };
        
        console.log('   Writing data:');
        console.log(`   - uid: ${userData.uid}`);
        console.log(`   - email: ${userData.email}`);
        console.log(`   - role: ${userData.role}`);
        console.log(`   - plan: ${userData.plan}`);
        console.log(`   - apiRequestLimit: ${userData.apiRequestLimit}\n`);
        
        await setDoc(doc(db, "users", user.uid), userData);
        
        console.log('   ✅ Firestore document created successfully\n');
        
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('✅ SIGNUP FLOW TEST: PASSED\n');
        console.log('📋 RESULT:\n');
        console.log('   - Firebase Auth: ✅ Account created');
        console.log('   - Firestore: ✅ Document created');
        console.log('   - Signup flow: ✅ WORKING CORRECTLY\n');
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        process.exit(0);
        
    } catch (error) {
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('❌ SIGNUP FLOW TEST: FAILED\n');
        console.log('📋 ERROR DETAILS:\n');
        console.log(`   Code: ${error.code || 'Unknown'}`);
        console.log(`   Message: ${error.message}`);
        
        if (error.code === 'permission-denied') {
            console.log('\n🚨 FIRESTORE SECURITY RULES BLOCKED THE WRITE\n');
            console.log('   Possible causes:');
            console.log('   1. Rules require different field values');
            console.log('   2. Rules validation failed (role/plan/limit)');
            console.log('   3. Bootstrap email check blocking all writes');
            console.log('\n   Next: Check Firebase Console → Firestore → Rules\n');
        }
        
        console.log('═══════════════════════════════════════════════════════════════\n');
        
        process.exit(1);
    }
}

testSignup();
