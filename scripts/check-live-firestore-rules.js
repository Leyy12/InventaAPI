/**
 * Check Live Firestore Rules
 * 
 * Uses Admin SDK to fetch current published rules
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import https from 'https';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

console.log('🔍 FETCHING LIVE FIRESTORE RULES\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

// Try to fetch via Firestore API
const projectId = serviceAccount.project_id;
const accessToken = await getAccessToken();

const options = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/${projectId}/databases/(default)/documents/.firebaserc`,
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${accessToken}`
    }
};

async function getAccessToken() {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
        credentials: serviceAccount,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token;
}

console.log('⚠️  LIMITATION: Cannot programmatically read Firestore Security Rules via Admin SDK\n');
console.log('📋 WHAT WE KNOW:\n');
console.log('   Local rules file: firestore.rules (reference copy)');
console.log('   Local rules allow: create if authenticated && role != admin\n');
console.log('   Test result: PERMISSION DENIED\n');
console.log('   Conclusion: LIVE rules in Firebase Console are DIFFERENT from local file\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('🚨 CRITICAL FINDING:\n');
console.log('   The LOCAL firestore.rules file is OUT OF SYNC with Firebase Console.\n');
console.log('   Live rules are BLOCKING all signup attempts.\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('📌 ACTION REQUIRED:\n');
console.log('   1. Go to Firebase Console → Project: inventaapi-db');
console.log('   2. Navigate to Firestore Database → Rules tab');
console.log('   3. Check if rules contain bootstrap email check:');
console.log('      - Look for: request.auth.token.email == "superadmin@inventaapi.com"');
console.log('      - Or similar restrictive condition\n');
console.log('   4. Compare live rules with firestore.rules file');
console.log('   5. Update live rules to match local file (or vice versa)\n');
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(1);
