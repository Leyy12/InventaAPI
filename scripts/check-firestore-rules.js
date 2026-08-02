/**
 * Check Current Firestore Rules
 * 
 * This script attempts to show current Firestore rules configuration
 * Note: Rules can only be viewed/edited in Firebase Console
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
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

const db = getFirestore();

console.log('🔍 FIRESTORE RULES CHECK\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('📋 Project: ' + serviceAccount.project_id + '\n');
console.log('⚠️  NOTE: Firestore rules cannot be read via Admin SDK.\n');
console.log('   You must check the Firebase Console to see live rules:\n');
console.log('   1. Go to: https://console.firebase.google.com/\n');
console.log('   2. Select project: ' + serviceAccount.project_id + '\n');
console.log('   3. Navigate to: Firestore Database → Rules tab\n');
console.log('   4. Check if rules contain:\n');
console.log('      - request.auth.token.email == \'superadmin@inventaapi.com\'\n');
console.log('      - Any bootstrap/email-based admin creation logic\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('🔒 SECURITY RECOMMENDATION:\n');
console.log('   Since the super admin Auth account now exists, any bootstrap\n');
console.log('   branch that allows document creation via email matching should\n');
console.log('   be REMOVED from the rules to prevent unauthorized access.\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('✅ ACTION REQUIRED:\n');
console.log('   1. Verify current rules in Firebase Console\n');
console.log('   2. Remove any email-based bootstrap conditions\n');
console.log('   3. Publish updated rules\n');
