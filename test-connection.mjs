import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

console.log("=== FIREBASE ADMIN SDK TEST ===");

let serviceAccount;
try {
    serviceAccount = require(path.resolve(__dirname, './service-account.json'));
    console.log(`[1] File loaded: service-account.json`);
    console.log(`[2] PROJECT ID FOUND IN FILE: ${serviceAccount.project_id}`);
} catch (err) {
    console.error('❌ service-account.json not found at project root.');
    process.exit(1);
}

if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
}

// Use explicit databaseId to avoid NOT_FOUND issues
const db = getFirestore(getApp(), '(default)');

try {
    const snap = await db.collection('users').get();
    console.log(`[3] Firestore Connection: SUCCESS`);
    console.log(`[4] Total users in 'users' collection: ${snap.size}`);
    console.log("\nUsers found:");
    snap.forEach(doc => {
        console.log(` - Doc ID: ${doc.id}, Email: ${doc.data().email || 'N/A'}, Role: ${doc.data().role || 'N/A'}`);
    });
} catch (err) {
    console.error('❌ Firestore connection failed:', err.message);
    process.exit(1);
}

if (serviceAccount.project_id !== 'inventaapi-db') {
    console.log(`\n❌ ERROR: MALI ANG PROJECT (${serviceAccount.project_id})!`);
    console.log(`Expected: inventaapi-db`);
    process.exit(1);
} else {
    console.log(`\n✅ SUCCESS: Konektado na sa tamang production project (inventaapi-db)!`);
    process.exit(0);
}
