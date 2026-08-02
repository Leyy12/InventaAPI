/**
 * Verify and Cleanup Super Admin Documents
 * 
 * This script:
 * 1. Lists ALL documents in users collection with superadmin email or admin role
 * 2. Identifies orphaned documents (no Auth account)
 * 3. Deletes orphaned documents
 * 4. Shows final state
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const serviceAccount = JSON.parse(
    readFileSync(join(rootDir, 'service-account.json'), 'utf8')
);

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
    });
}

const auth = getAuth();
const db = getFirestore();

const SUPERADMIN_EMAIL = 'superadmin@inventaapi.com';

async function verifyAndCleanup() {
    console.log('🔍 VERIFYING SUPER ADMIN DOCUMENTS\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Step 1: Find ALL documents with superadmin email
    console.log('📌 STEP 1: Searching Firestore for superadmin documents\n');
    
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', SUPERADMIN_EMAIL).get();
    
    console.log(`   Found ${snapshot.size} document(s) with email: ${SUPERADMIN_EMAIL}\n`);
    
    if (snapshot.empty) {
        console.log('   ⚠️  No documents found!\n');
        return;
    }
    
    const documents = [];
    snapshot.forEach(doc => {
        documents.push({
            id: doc.id,
            data: doc.data()
        });
    });
    
    // Step 2: Check which UIDs have Auth accounts
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📌 STEP 2: Checking Auth accounts for each document\n');
    
    const results = [];
    
    for (const doc of documents) {
        console.log(`   Document ID: ${doc.id}`);
        console.log(`      Email: ${doc.data.email}`);
        console.log(`      Role: ${doc.data.role}`);
        console.log(`      FullName: ${doc.data.fullName}`);
        
        let hasAuth = false;
        try {
            const authUser = await auth.getUser(doc.id);
            hasAuth = true;
            console.log(`      ✅ HAS Auth account (${authUser.email})`);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                console.log(`      ❌ NO Auth account (ORPHANED)`);
            } else {
                console.log(`      ⚠️  Error checking Auth: ${error.message}`);
            }
        }
        
        results.push({
            id: doc.id,
            data: doc.data,
            hasAuth: hasAuth
        });
        
        console.log('');
    }
    
    // Step 3: Identify orphaned documents
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📌 STEP 3: Identifying orphaned documents\n');
    
    const orphaned = results.filter(r => !r.hasAuth);
    const valid = results.filter(r => r.hasAuth);
    
    console.log(`   Valid documents (with Auth): ${valid.length}`);
    console.log(`   Orphaned documents (no Auth): ${orphaned.length}\n`);
    
    if (orphaned.length === 0) {
        console.log('   ✅ No orphaned documents found!\n');
    } else {
        console.log('   🗑️  Orphaned documents to delete:\n');
        orphaned.forEach(doc => {
            console.log(`      - ${doc.id} (email: ${doc.data.email})`);
        });
        console.log('');
    }
    
    // Step 4: Delete orphaned documents
    if (orphaned.length > 0) {
        console.log('═══════════════════════════════════════════════════════════════\n');
        console.log('📌 STEP 4: Deleting orphaned documents\n');
        
        for (const doc of orphaned) {
            console.log(`   Deleting: ${doc.id}...`);
            await db.collection('users').doc(doc.id).delete();
            console.log(`   ✅ Deleted\n`);
        }
    }
    
    // Step 5: Final summary
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✅ CLEANUP COMPLETE\n');
    console.log('📋 Final Super Admin Status:\n');
    
    if (valid.length === 1) {
        const validDoc = valid[0];
        console.log(`   ✅ ONE valid super admin account found:`);
        console.log(`      Document ID: ${validDoc.id}`);
        console.log(`      Email: ${validDoc.data.email}`);
        console.log(`      Role: ${validDoc.data.role}`);
        console.log(`      Has Auth: YES`);
    } else if (valid.length === 0) {
        console.log(`   ❌ NO valid super admin accounts found!`);
    } else {
        console.log(`   ⚠️  MULTIPLE (${valid.length}) valid super admin accounts found:`);
        valid.forEach(doc => {
            console.log(`      - ${doc.id} (${doc.data.email})`);
        });
    }
    
    console.log('\n');
}

verifyAndCleanup()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    });
