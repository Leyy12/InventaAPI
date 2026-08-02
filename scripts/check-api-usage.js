/**
 * Check API Usage for Suspicious Activity
 * 
 * NOTE: This checks Firestore only. Backend uses PostgreSQL for api_usage_logs.
 * If you need to check PostgreSQL logs, you'll need database access.
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

async function checkUsage() {
    console.log('📊 API USAGE / BILLING CHECK\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Check if api_keys collection exists
    const apiKeysSnapshot = await db.collection('api_keys').get();
    
    if (apiKeysSnapshot.empty) {
        console.log('   ℹ️  No API keys found in Firestore\n');
        console.log('   📝 NOTE: API usage tracking may be in backend PostgreSQL database\n');
        console.log('   To check PostgreSQL logs:\n');
        console.log('      1. Connect to your PostgreSQL database');
        console.log('      2. Query: SELECT * FROM api_usage_logs ORDER BY created_at DESC LIMIT 100;\n');
    } else {
        console.log(`   📊 Found ${apiKeysSnapshot.size} API key(s) in Firestore\n`);
        
        apiKeysSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`   API Key: ${doc.id}`);
            console.log(`      User:         ${data.userId || 'N/A'}`);
            console.log(`      Created:      ${data.createdAt || 'N/A'}`);
            console.log(`      Requests:     ${data.requestsUsed || 0}`);
            console.log(`      Limit:        ${data.requestLimit || 'N/A'}`);
            console.log('');
        });
    }
    
    // Check users for apiRequestsUsed
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📊 USER API USAGE (from users collection)\n');
    
    const usersSnapshot = await db.collection('users').get();
    
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.apiRequestsUsed && data.apiRequestsUsed > 0) {
            console.log(`   User: ${data.email}`);
            console.log(`      Requests Used: ${data.apiRequestsUsed}`);
            console.log(`      Limit:         ${data.apiRequestLimit || 50}`);
            console.log('');
        }
    });
    
    const usersWithUsage = usersSnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.apiRequestsUsed && data.apiRequestsUsed > 0;
    });
    
    if (usersWithUsage.length === 0) {
        console.log('   ✅ No users have made API requests yet\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✅ USAGE CHECK COMPLETE\n');
    console.log('📝 NOTES:\n');
    console.log('   - Firestore only tracks user-level apiRequestsUsed field');
    console.log('   - Detailed API logs are in PostgreSQL (api_usage_logs table)');
    console.log('   - No database billing/costs tracked in codebase');
    console.log('   - Check hosting provider dashboard for billing spikes\n');
}

checkUsage()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });
