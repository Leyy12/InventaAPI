/**
 * Verify ALL Users in Firestore
 * 
 * NO FILTERS - Shows every single document in users collection
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

async function verifyAllUsers() {
    console.log('🔍 COMPLETE USERS COLLECTION AUDIT\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('📊 NO FILTERS - Showing EVERY document in users collection\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Get ALL documents - no filters
    const snapshot = await db.collection('users').get();
    
    console.log(`TOTAL DOCUMENTS: ${snapshot.size}\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    if (snapshot.empty) {
        console.log('❌ CRITICAL: Users collection is EMPTY!\n');
        return;
    }
    
    snapshot.forEach((doc, index) => {
        const data = doc.data();
        
        console.log(`Document #${index + 1}:`);
        console.log(`   Document ID:      ${doc.id}`);
        console.log(`   Email:            ${data.email || 'N/A'}`);
        console.log(`   Full Name:        ${data.fullName || 'N/A'}`);
        console.log(`   Role:             ${data.role || 'N/A'}`);
        console.log(`   Plan:             ${data.plan || 'N/A'}`);
        console.log(`   Business Name:    ${data.businessName || 'N/A'}`);
        console.log(`   Business Segment: ${data.businessSegment || 'N/A'}`);
        console.log(`   API Limit:        ${data.apiRequestLimit || 'N/A'}`);
        console.log(`   API Used:         ${data.apiRequestsUsed || 0}`);
        console.log(`   Is Active:        ${data.isActive !== undefined ? data.isActive : 'N/A'}`);
        
        let createdAtStr = 'N/A';
        if (data.createdAt) {
            try {
                const timestamp = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
                createdAtStr = timestamp.toISOString();
            } catch (e) {
                createdAtStr = String(data.createdAt);
            }
        }
        console.log(`   Created At:       ${createdAtStr}`);
        
        console.log('');
    });
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Check for specific accounts
    console.log('🔍 CHECKING FOR SPECIFIC ACCOUNTS:\n');
    
    const expectedAccounts = [
        'superadmin@inventaapi.com',
        'delarosaleah38@gmail.com',
        'balquinkevinconeal27@gmail.com'
    ];
    
    expectedAccounts.forEach(email => {
        const found = snapshot.docs.find(doc => doc.data().email === email);
        if (found) {
            console.log(`   ✅ ${email} - EXISTS`);
        } else {
            console.log(`   ❌ ${email} - NOT FOUND`);
        }
    });
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('✅ VERIFICATION COMPLETE\n');
}

verifyAllUsers()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n❌ Error:', error);
        process.exit(1);
    });
