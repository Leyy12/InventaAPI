/**
 * Firestore Cleanup & Superadmin Setup Script
 *
 * SITUATION SUMMARY:
 * - Firebase Auth (users/passwords) is managed by project: inventaapi
 * - Firestore database is managed by project: inventaapi-db
 * - This service account (inventaapi-db) has access to Firestore only.
 * - Firebase Auth for inventaapi is a SEPARATE project.
 *
 * What this script does (Firestore only):
 *   1. Removes old placeholder docs (u_admin, u_developer)
 *   2. Creates/updates the Firestore 'users' doc for superadmin@inventaapi.com
 *
 * NOTE: To delete users from Firebase Auth (inventaapi project), you must either:
 *   - Go to Firebase Console → inventaapi → Authentication → Delete manually, OR
 *   - Generate a service account key from the *inventaapi* project (not inventaapi-db)
 *
 * Run with: node scripts/cleanup-firestore-only.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── Init Firebase Admin ─────────────────────────────────────────────────────
let serviceAccount;
try {
    serviceAccount = require(path.resolve(__dirname, '../service-account.json'));
} catch (err) {
    console.error('❌ service-account.json not found at project root.');
    process.exit(1);
}

if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
    console.log('✅ Firebase Admin SDK initialized');
    console.log(`   Project: ${serviceAccount.project_id}\n`);
}

const db = getFirestore();

// ─── Config ──────────────────────────────────────────────────────────────────
const DOCS_TO_DELETE = ['u_admin', 'u_developer'];
const SUPERADMIN_EMAIL = 'superadmin@inventaapi.com';
// Use the UID from Firebase Auth → inventaapi project for superadmin
// If you don't know the UID yet, go to Firebase Console → inventaapi → Auth → copy UID
const SUPERADMIN_UID = 'REPLACE_WITH_ACTUAL_UID'; // <-- fill this in if known

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🔥 Firestore Cleanup & Superadmin Setup\n');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // STEP 1: Delete old placeholder docs
    console.log('📌 STEP 1: Removing old placeholder documents\n');
    for (const docId of DOCS_TO_DELETE) {
        const ref = db.collection('users').doc(docId);
        const snap = await ref.get();
        if (snap.exists) {
            await ref.delete();
            console.log(`   ✅ Deleted Firestore doc: users/${docId}`);
        } else {
            console.log(`   ℹ️  Doc not found (already gone): users/${docId}`);
        }
    }

    // STEP 2: Create / update superadmin Firestore doc
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('📌 STEP 2: Setting up superadmin Firestore document\n');

    // Search by email in case UID is already stored
    const existing = await db.collection('users')
        .where('email', '==', SUPERADMIN_EMAIL)
        .limit(1)
        .get();

    let docRef;
    if (!existing.empty) {
        docRef = existing.docs[0].ref;
        const data = existing.docs[0].data();
        console.log(`   Found existing doc: ${docRef.id}`);
        console.log(`   Current role: ${data.role}`);
        await docRef.update({ role: 'admin', isActive: true, updatedAt: FieldValue.serverTimestamp() });
        console.log(`   ✅ Updated role → 'admin'`);
    } else if (SUPERADMIN_UID && SUPERADMIN_UID !== 'REPLACE_WITH_ACTUAL_UID') {
        // Create with known UID as document ID (matches Firebase Auth UID pattern)
        docRef = db.collection('users').doc(SUPERADMIN_UID);
        await docRef.set({
            uid: SUPERADMIN_UID,
            email: SUPERADMIN_EMAIL,
            fullName: 'Super Admin',
            username: 'superadmin',
            role: 'admin',
            plan: 'Unlimited',
            businessName: 'InventaAPI',
            isActive: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`   ✅ Created Firestore doc with UID: ${SUPERADMIN_UID}`);
    } else {
        // Create with auto-generated ID (temporary until you get the real UID)
        docRef = await db.collection('users').add({
            email: SUPERADMIN_EMAIL,
            fullName: 'Super Admin',
            username: 'superadmin',
            role: 'admin',
            plan: 'Unlimited',
            businessName: 'InventaAPI',
            isActive: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        console.log(`   ⚠️  Created with auto-ID: ${docRef.id}`);
        console.log(`   ACTION NEEDED: Once you know the real UID from Firebase Auth → inventaapi,`);
        console.log(`   delete this doc and re-run with SUPERADMIN_UID filled in.`);
    }

    // STEP 3: Final state
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('📋 Final Firestore users collection:\n');
    const finalSnap = await db.collection('users').get();
    finalSnap.forEach(doc => {
        const d = doc.data();
        console.log(`   Doc ID: ${doc.id}`);
        console.log(`     email : ${d.email}`);
        console.log(`     role  : ${d.role}`);
        console.log('');
    });

    console.log('✅ DONE!\n');
    console.log('⚠️  IMPORTANT: Firebase Auth users (balquinkevinconeal27@gmail.com, admin@inventaapi.com)');
    console.log('   must be deleted manually from Firebase Console → Project: inventaapi → Authentication');
    console.log('   OR generate a service account for the *inventaapi* project and re-run.\n');

    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Script failed:', err.message);
    process.exit(1);
});
