/**
 * Verify Document State - Concrete Proof
 * 
 * This script provides concrete evidence:
 * 1. Attempts to get orphaned document kQrMnFHE8DNrYujYwzmX (should not exist)
 * 2. Gets valid document VpDeXopPT5cm7EtrgjfCrJ60Gjr2 (should exist with full data)
 * 3. Shows actual Firestore document contents
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

async function verifyDocuments() {
    console.log('🔍 CONCRETE DOCUMENT VERIFICATION\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Test 1: Try to get orphaned document
    console.log('📌 TEST 1: Attempting to get ORPHANED document\n');
    console.log('   Document ID: kQrMnFHE8DNrYujYwzmX\n');
    
    try {
        const orphanedDoc = await db.collection('users').doc('kQrMnFHE8DNrYujYwzmX').get();
        
        if (orphanedDoc.exists) {
            console.log('   ❌ FAILED: Document still exists!');
            console.log('   Data:', JSON.stringify(orphanedDoc.data(), null, 2));
        } else {
            console.log('   ✅ VERIFIED: Document does NOT exist (successfully deleted)');
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // Test 2: Get valid document
    console.log('📌 TEST 2: Getting VALID super admin document\n');
    console.log('   Document ID: VpDeXopPT5cm7EtrgjfCrJ60Gjr2\n');
    
    try {
        const validDoc = await db.collection('users').doc('VpDeXopPT5cm7EtrgjfCrJ60Gjr2').get();
        
        if (validDoc.exists) {
            const data = validDoc.data();
            console.log('   ✅ VERIFIED: Document exists\n');
            console.log('   📄 ACTUAL FIRESTORE DOCUMENT CONTENTS:\n');
            console.log('   {');
            console.log(`     "uid": "${data.uid}",`);
            console.log(`     "email": "${data.email}",`);
            console.log(`     "fullName": "${data.fullName}",`);
            console.log(`     "role": "${data.role}",`);
            console.log(`     "plan": "${data.plan}",`);
            console.log(`     "businessName": "${data.businessName}",`);
            console.log(`     "createdAt": "${data.createdAt}",`);
            console.log(`     "isActive": ${data.isActive}`);
            console.log('   }\n');
            
            // Verify critical fields
            console.log('   🔍 FIELD VERIFICATION:\n');
            console.log(`      ✓ uid matches document ID: ${data.uid === 'VpDeXopPT5cm7EtrgjfCrJ60Gjr2'}`);
            console.log(`      ✓ email is superadmin: ${data.email === 'superadmin@inventaapi.com'}`);
            console.log(`      ✓ role is lowercase "admin": ${data.role === 'admin'}`);
            console.log(`      ✓ isActive is true: ${data.isActive === true}`);
        } else {
            console.log('   ❌ FAILED: Document does NOT exist!');
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    // Test 3: Count all superadmin documents
    console.log('📌 TEST 3: Counting ALL documents with superadmin email\n');
    
    try {
        const snapshot = await db.collection('users').where('email', '==', 'superadmin@inventaapi.com').get();
        console.log(`   Total documents found: ${snapshot.size}\n`);
        
        if (snapshot.size === 1) {
            console.log('   ✅ VERIFIED: Exactly ONE super admin document exists');
        } else if (snapshot.size === 0) {
            console.log('   ❌ FAILED: NO super admin documents found!');
        } else {
            console.log('   ❌ FAILED: MULTIPLE super admin documents found!');
            snapshot.forEach(doc => {
                console.log(`      - ${doc.id}`);
            });
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    console.log('✅ VERIFICATION COMPLETE\n');
}

verifyDocuments()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n❌ Script error:', error);
        process.exit(1);
    });
