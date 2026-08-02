/**
 * Admin Account Cleanup & Setup Script
 * 
 * This script uses Firebase Admin SDK to:
 * 1. Delete old admin accounts from Firebase Auth
 * 2. Delete their corresponding Firestore documents
 * 3. Create proper Firestore document for superadmin account
 * 
 * Run with: node scripts/cleanup-admin-accounts.js
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Initialize Firebase Admin SDK using service-account.json
if (!getApps().length) {
    let serviceAccount;
    try {
        serviceAccount = require(path.resolve(__dirname, '../service-account.json'));
    } catch (err) {
        console.error('❌ service-account.json not found at project root.');
        process.exit(1);
    }
    try {
        initializeApp({ credential: cert(serviceAccount) });
        console.log('✅ Firebase Admin SDK initialized\n');
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
        process.exit(1);
    }
}

const auth = getAuth();
const db = getFirestore();

// Accounts to delete
const ACCOUNTS_TO_DELETE = [
    'balquinkevinconeal27@gmail.com',
    'admin@inventaapi.com',
];

// Super admin account to setup
const SUPERADMIN_EMAIL = 'superadmin@inventaapi.com';

/**
 * Delete user from Firebase Auth by email
 */
async function deleteAuthUser(email) {
    try {
        // Get user by email
        const user = await auth.getUserByEmail(email);
        const uid = user.uid;
        
        console.log(`   UID: ${uid}`);
        
        // Delete from Firebase Auth
        await auth.deleteUser(uid);
        console.log(`   ✅ Deleted from Firebase Auth`);
        
        return uid;
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.log(`   ⚠️  User not found in Firebase Auth (already deleted or never existed)`);
            return null;
        }
        throw error;
    }
}

/**
 * Delete user document from Firestore
 */
async function deleteFirestoreDoc(uid) {
    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
            await userRef.delete();
            console.log(`   ✅ Deleted from Firestore`);
        } else {
            console.log(`   ℹ️  No Firestore document found (nothing to delete)`);
        }
    } catch (error) {
        console.error(`   ❌ Error deleting Firestore document:`, error.message);
    }
}

/**
 * Get UID for superadmin account
 */
async function getSuperadminUID() {
    try {
        const user = await auth.getUserByEmail(SUPERADMIN_EMAIL);
        return user.uid;
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.error(`❌ Superadmin account not found: ${SUPERADMIN_EMAIL}`);
            console.error(`   Please create this account first using Firebase Auth`);
            return null;
        }
        throw error;
    }
}

/**
 * Create Firestore document for superadmin
 */
async function createSuperadminDocument(uid) {
    try {
        const userRef = db.collection('users').doc(uid);
        
        // Check if document already exists
        const existingDoc = await userRef.get();
        if (existingDoc.exists) {
            console.log(`   ⚠️  Firestore document already exists`);
            const existingData = existingDoc.data();
            console.log(`   Current role: ${existingData.role}`);
            
            // Update role if not admin
            if (existingData.role?.toLowerCase() !== 'admin') {
                console.log(`   🔄 Updating role to 'admin'...`);
                await userRef.update({
                    role: 'admin',
                    fullName: 'Super Admin',
                    plan: 'Unlimited',
                    businessName: 'InventaAPI',
                    isActive: true,
                });
                console.log(`   ✅ Document updated with admin role`);
            } else {
                console.log(`   ✅ Already has admin role, no changes needed`);
            }
            return;
        }
        
        // Create new document
        const userData = {
            uid: uid,
            email: SUPERADMIN_EMAIL,
            fullName: 'Super Admin',
            role: 'admin',  // lowercase - IMPORTANT
            plan: 'Unlimited',
            businessName: 'InventaAPI',
            createdAt: new Date().toISOString(),
            isActive: true,
        };
        
        await userRef.set(userData);
        console.log(`   ✅ Firestore document created`);
        console.log(`   Fields: uid, email, fullName, role (admin), plan, businessName, createdAt, isActive`);
        
    } catch (error) {
        console.error(`   ❌ Error creating Firestore document:`, error.message);
    }
}

/**
 * Main execution
 */
async function main() {
    console.log('🔥 Starting Admin Account Cleanup & Setup\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // STEP 1: Delete old admin accounts
    console.log('📌 STEP 1: Deleting old admin accounts\n');
    
    for (const email of ACCOUNTS_TO_DELETE) {
        console.log(`🗑️  Deleting: ${email}`);
        
        // Delete from Auth
        const uid = await deleteAuthUser(email);
        
        // Delete from Firestore (if we got a UID)
        if (uid) {
            await deleteFirestoreDoc(uid);
        }
        
        console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // STEP 2: Setup superadmin account
    console.log('📌 STEP 2: Setting up superadmin account\n');
    console.log(`👤 Account: ${SUPERADMIN_EMAIL}`);
    
    // Get UID
    const superadminUID = await getSuperadminUID();
    
    if (!superadminUID) {
        console.log('\n❌ Cannot proceed without superadmin UID');
        console.log('   The account should already exist in Firebase Auth');
        process.exit(1);
    }
    
    console.log(`   UID: ${superadminUID}`);
    
    // Create/update Firestore document
    console.log(`\n📄 Creating/updating Firestore document...`);
    await createSuperadminDocument(superadminUID);
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // STEP 3: Summary
    console.log('✅ CLEANUP & SETUP COMPLETE!\n');
    console.log('📋 Final Admin Account:\n');
    console.log('   Email:    superadmin@inventaapi.com');
    console.log('   Password: SuperAdmin2024!');
    console.log('   Role:     admin');
    console.log('   UID:      ' + superadminUID);
    console.log('\n🔗 Login at: http://localhost:3001/login\n');
    
    process.exit(0);
}

// Run the script
main().catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
});
