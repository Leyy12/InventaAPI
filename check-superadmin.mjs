import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sa = require('./service-account.json');

const app = initializeApp({ credential: cert(sa) });
const auth = getAuth(app);
const db = getFirestore(app);

async function check() {
    const email = 'superadmin@inventaapi.com';
    let authExists = false;
    let firestoreExists = false;
    let role = null;

    try {
        const user = await auth.getUserByEmail(email);
        console.log(`✅ [AUTH] Account exists in Firebase Auth! UID: ${user.uid}`);
        authExists = true;
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            console.log(`❌ [AUTH] Account DOES NOT exist in Firebase Auth.`);
        } else {
            console.log(`❌ [AUTH] Error: ${err.message}`);
        }
    }

    try {
        const snap = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!snap.empty) {
            const data = snap.docs[0].data();
            console.log(`✅ [FIRESTORE] Document exists! ID: ${snap.docs[0].id}`);
            console.log(`   - role: ${data.role}`);
            firestoreExists = true;
            role = data.role;
        } else {
            console.log(`❌ [FIRESTORE] Document DOES NOT exist.`);
        }
    } catch (err) {
        console.log(`❌ [FIRESTORE] Error: ${err.message}`);
    }
    
    process.exit(0);
}

check();
