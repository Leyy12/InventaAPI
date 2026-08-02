/**
 * Create Super Admin Account Script
 * 
 * This script uses Firebase Admin SDK to:
 * 1. Create Firebase Auth account for superadmin@inventaapi.com with FIXED UID
 * 2. Create/update Firestore document with admin role
 * 
 * ⚠️  CRITICAL: FIXED UID CONFIGURATION
 * 
 * The superadmin UID is FIXED and must NEVER be changed without also updating:
 * - dashboard/.env.local: NEXT_PUBLIC_SUPERADMIN_UID
 * - admin-panel/.env.local: NEXT_PUBLIC_SUPERADMIN_UID (if applicable)
 * 
 * Why fixed UID?
 * - Prevents accidental lockout (auth-context.tsx checks UID to skip auto-heal)
 * - No backdoor risk (UID is server-verified, not user-controllable)
 * - Consistent across environments
 * 
 * ⚠️  DO NOT change SUPERADMIN_UID without updating ALL .env files!
 * 
 * Run with: node scripts/create-superadmin.js
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Load service account from JSON file
const serviceAccount = JSON.parse(
    readFileSync(join(rootDir, 'service-account.json'), 'utf8')
);

// Initialize Firebase Admin SDK
if (!getApps().length) {
    try {
        initializeApp({
            credential: cert(serviceAccount),
        });
        console.log('✅ Firebase Admin SDK initialized');
        console.log(`📋 Project: ${serviceAccount.project_id}\n`);
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
        process.exit(1);
    }
}

const auth = getAuth();
const db = getFirestore();

// ═══════════════════════════════════════════════════════════════════════════
// SUPERADMIN CONFIGURATION - SINGLE SOURCE OF TRUTH
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️  CRITICAL: These values MUST match .env files:
//
//   dashboard/.env.local:
//     NEXT_PUBLIC_SUPERADMIN_UID="VpDeXopPT5cm7EtrgjfCrJ60Gjr2"
//
//   admin-panel/.env.local:
//     NEXT_PUBLIC_SUPERADMIN_UID="VpDeXopPT5cm7EtrgjfCrJ60Gjr2"
//
// Why fixed UID?
// - Prevents accidental privilege escalation/demotion
// - Consistent across all environments
// - auth-context.tsx uses this to skip auto-heal for superadmin
//
// ⚠️  NEVER change these values without updating ALL .env files!
//
// ═══════════════════════════════════════════════════════════════════════════

const SUPERADMIN_UID = 'VpDeXopPT5cm7EtrgjfCrJ60Gjr2';        // FIXED - DO NOT CHANGE
const SUPERADMIN_EMAIL = 'superadmin@inventaapi.com';
const SUPERADMIN_PASSWORD = 'SuperAdmin2024!';

/**
 * Create or get Firebase Auth user WITH FIXED UID
 */
async function createOrGetAuthUser() {
    try {
        // Try to get existing user first (by UID)
        try {
            const existingUser = await auth.getUser(SUPERADMIN_UID);
            console.log('   ℹ️  Auth account already exists');
            console.log(`   UID: ${existingUser.uid}`);
            console.log(`   Email: ${existingUser.email}`);
            
            // Verify email matches
            if (existingUser.email !== SUPERADMIN_EMAIL) {
                console.warn(`   ⚠️  Email mismatch! Expected: ${SUPERADMIN_EMAIL}, Found: ${existingUser.email}`);
                console.warn(`   Updating email to ${SUPERADMIN_EMAIL}...`);
                await auth.updateUser(SUPERADMIN_UID, { email: SUPERADMIN_EMAIL });
                console.log('   ✅ Email updated');
            }
            
            return existingUser.uid;
        } catch (uidError) {
            if (uidError.code === 'auth/user-not-found') {
                // UID doesn't exist, check if email exists (might be different UID)
                try {
                    const emailUser = await auth.getUserByEmail(SUPERADMIN_EMAIL);
                    console.error(`   ❌ CONFLICT: Email ${SUPERADMIN_EMAIL} exists with DIFFERENT UID!`);
                    console.error(`      Expected UID: ${SUPERADMIN_UID}`);
                    console.error(`      Found UID:    ${emailUser.uid}`);
                    console.error(`   `);
                    console.error(`   ACTION REQUIRED: Delete the existing account first:`);
                    console.error(`      1. Go to Firebase Console → Authentication`);
                    console.error(`      2. Delete user: ${SUPERADMIN_EMAIL}`);
                    console.error(`      3. Re-run this script`);
                    process.exit(1);
                } catch (emailError) {
                    if (emailError.code === 'auth/user-not-found') {
                        // Neither UID nor email exists - create new
                        console.log('   🔨 Creating new Firebase Auth account with FIXED UID...');
                        const newUser = await auth.createUser({
                            uid: SUPERADMIN_UID,              // ⭐ FIXED UID
                            email: SUPERADMIN_EMAIL,
                            password: SUPERADMIN_PASSWORD,
                            emailVerified: true,
                            disabled: false,
                        });
                        console.log(`   ✅ Auth account created`);
                        console.log(`   UID: ${newUser.uid}`);
                        console.log(`   Email: ${newUser.email}`);
                        return newUser.uid;
                    }
                    throw emailError;
                }
            }
            throw uidError;
        }
    } catch (error) {
        console.error('   ❌ Error with Firebase Auth:', error.message);
        throw error;
    }
}

/**
 * Create or update Firestore document
 */
async function createOrUpdateFirestoreDoc(uid) {
    try {
        const userRef = db.collection('users').doc(uid);
        
        // Check if document exists
        const existingDoc = await userRef.get();
        
        const userData = {
            uid: uid,
            email: SUPERADMIN_EMAIL,
            fullName: 'Super Admin',
            role: 'admin',  // lowercase - IMPORTANT
            plan: 'Unlimited',
            businessName: 'InventaAPI',
            createdAt: existingDoc.exists ? existingDoc.data().createdAt : new Date().toISOString(),
            isActive: true,
        };
        
        if (existingDoc.exists) {
            console.log('   ℹ️  Firestore document already exists');
            const existingData = existingDoc.data();
            console.log(`   Current role: ${existingData.role}`);
            
            // Update if needed
            if (existingData.role?.toLowerCase() !== 'admin') {
                console.log('   🔄 Updating role to admin...');
                await userRef.update(userData);
                console.log('   ✅ Document updated');
            } else {
                console.log('   ✅ Already configured correctly');
            }
        } else {
            // Create new document
            console.log('   🔨 Creating new Firestore document...');
            await userRef.set(userData);
            console.log('   ✅ Document created');
        }
        
        console.log(`\n   📄 Document fields:`);
        console.log(`      uid: ${userData.uid}`);
        console.log(`      email: ${userData.email}`);
        console.log(`      fullName: ${userData.fullName}`);
        console.log(`      role: ${userData.role} (lowercase)`);
        console.log(`      plan: ${userData.plan}`);
        console.log(`      businessName: ${userData.businessName}`);
        console.log(`      isActive: ${userData.isActive}`);
        
    } catch (error) {
        console.error('   ❌ Error with Firestore document:', error.message);
        throw error;
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🔥 Creating Super Admin Account\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`👤 Email: ${SUPERADMIN_EMAIL}`);
    console.log(`🔑 Password: ${SUPERADMIN_PASSWORD}\n`);
    
    // Step 1: Create or get Firebase Auth account
    console.log('📌 STEP 1: Firebase Authentication\n');
    const uid = await createOrGetAuthUser();
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // Step 2: Create or update Firestore document
    console.log('📌 STEP 2: Firestore Document\n');
    await createOrUpdateFirestoreDoc(uid);
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // Summary
    console.log('✅ SUPER ADMIN ACCOUNT READY!\n');
    console.log('📋 Login Credentials:\n');
    console.log('   Email:    superadmin@inventaapi.com');
    console.log('   Password: SuperAdmin2024!');
    console.log(`   UID:      ${uid} (FIXED)\n`);
    console.log('⚠️  IMPORTANT: UID is FIXED and must match .env files:\n');
    console.log('   dashboard/.env.local:');
    console.log(`     NEXT_PUBLIC_SUPERADMIN_UID="${uid}"\n`);
    console.log('   admin-panel/.env.local:');
    console.log(`     NEXT_PUBLIC_SUPERADMIN_UID="${uid}"\n`);
    console.log('🔗 Login at: http://localhost:3001/login\n');
    
    process.exit(0);
}

// Run the script
main().catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    console.error(error);
    process.exit(1);
});
