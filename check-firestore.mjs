import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Use inventaapi-cf6bc key — owner of Firebase Auth
const sa = require('C:/Users/ACER/Downloads/inventaapi-cf6bc-101620d75ba4.json');
const app = getApps().find(a => a.name === 'cf6bc') ?? initializeApp({ credential: cert(sa) }, 'cf6bc');
const auth = getAuth(app);
const db  = getFirestore(app, 'default');

console.log('=== FIREBASE AUTH CLEANUP + USER INVESTIGATION ===');
console.log('Project:', sa.project_id);
console.log('');

// ── PART 1: Delete old Auth accounts ────────────────────────────────────────
const TO_DELETE = ['balquinkevinconeal27@gmail.com', 'admin@inventaapi.com'];

console.log('━'.repeat(55));
console.log('📌 PART 1: Firebase Auth Cleanup');
console.log('━'.repeat(55));

for (const email of TO_DELETE) {
    process.stdout.write(`\n🗑️  ${email} → `);
    try {
        const user = await auth.getUserByEmail(email);
        await auth.deleteUser(user.uid);
        console.log(`✅ DELETED (UID: ${user.uid})`);
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            console.log('ℹ️  Not found in Auth (already gone)');
        } else {
            console.log(`❌ Error: ${e.message}`);
        }
    }
}

// ── PART 2: Investigate delarosaleah38@gmail.com ───────────────────────────
console.log('');
console.log('━'.repeat(55));
console.log('📌 PART 2: Investigate delarosaleah38@gmail.com');
console.log('━'.repeat(55));

const TARGET = 'delarosaleah38@gmail.com';

// 2a. Check Firebase Auth record
console.log('\n[2a] Firebase Auth record:');
let targetUID = null;
try {
    const authUser = await auth.getUserByEmail(TARGET);
    targetUID = authUser.uid;
    console.log(`   ✅ EXISTS in Auth`);
    console.log(`   UID          : ${authUser.uid}`);
    console.log(`   Display name : ${authUser.displayName || 'N/A'}`);
    console.log(`   Email verified: ${authUser.emailVerified}`);
    console.log(`   Provider     : ${authUser.providerData.map(p => p.providerId).join(', ')}`);
    console.log(`   Created at   : ${new Date(authUser.metadata.creationTime).toLocaleString()}`);
    console.log(`   Last sign-in : ${new Date(authUser.metadata.lastSignInTime).toLocaleString()}`);
} catch (e) {
    if (e.code === 'auth/user-not-found') {
        console.log(`   ❌ NOT found in Firebase Auth`);
    } else {
        console.log(`   ⚠️  Error: ${e.message}`);
    }
}

// 2b. Check Firestore users collection by email
console.log('\n[2b] Firestore users collection (email query):');
try {
    const snap = await db.collection('users')
        .where('email', '==', TARGET)
        .limit(1)
        .get();
    if (!snap.empty) {
        console.log(`   ✅ Firestore doc FOUND: ${snap.docs[0].id}`);
        console.log('   Data:', JSON.stringify(snap.docs[0].data(), null, 4));
    } else {
        console.log(`   ❌ NO Firestore document found by email`);
    }
} catch (e) {
    console.log(`   ❌ Query error: ${e.message}`);
}

// 2c. If we have UID, check Firestore by UID (doc ID)
if (targetUID) {
    console.log(`\n[2c] Firestore doc by UID (${targetUID}):`)
    try {
        const doc = await db.collection('users').doc(targetUID).get();
        if (doc.exists) {
            console.log(`   ✅ Firestore doc FOUND by UID`);
            console.log('   Data:', JSON.stringify(doc.data(), null, 4));
        } else {
            console.log(`   ❌ No Firestore doc at users/${targetUID}`);
            console.log(`\n   ⚠️  CONFIRMED: Auth exists but NO Firestore document.`);
            console.log(`   This is a signup flow bug — user was created in Auth`);
            console.log(`   but the corresponding Firestore doc was never written.`);
        }
    } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
    }
}

// 2d. Check ALL collections for any trace of this user
console.log('\n[2d] Scanning all root collections for email trace...');
try {
    const cols = await db.listCollections();
    for (const col of cols) {
        const snap = await col.where('email', '==', TARGET).limit(1).get();
        if (!snap.empty) {
            console.log(`   ✅ Found in collection: ${col.id} (doc: ${snap.docs[0].id})`);
        } else {
            console.log(`   ✗  Not in: ${col.id}`);
        }
    }
} catch (e) {
    console.log(`   ❌ Scan error: ${e.message}`);
}

console.log('\n✅ Done.');
