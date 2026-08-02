import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sa = require('./service-account.json'); // This is the inventaapi-db service account

const app = initializeApp({ credential: cert(sa) });
const auth = getAuth(app);

async function check() {
    try {
        const user = await auth.getUserByEmail('delarosaleah38@gmail.com');
        console.log(`✅ User found in Auth! UID: ${user.uid}`);
    } catch (err) {
        console.log(`❌ User NOT found in Auth: ${err.message}`);
    }
    process.exit(0);
}
check();
