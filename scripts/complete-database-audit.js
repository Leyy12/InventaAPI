/**
 * CRITICAL: Complete Database Audit
 * 
 * Lists ALL users from both Firestore and Firebase Auth
 * to determine actual database state
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
});

const db = getFirestore();
const auth = getAuth();

console.log('🔍 COMPLETE DATABASE AUDIT\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function auditDatabase() {
    // 1. FIRESTORE USERS COLLECTION (NO FILTER)
    console.log('📊 1. FIRESTORE USERS COLLECTION (ALL DOCUMENTS):\n');
    
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
        console.log('   ⚠️  NO DOCUMENTS FOUND\n');
    } else {
        console.log(`   Total Documents: ${usersSnapshot.size}\n`);
        
        usersSnapshot.forEach((doc, index) => {
            const data = doc.data();
            console.log(`   [${index + 1}] Document ID: ${doc.id}`);
            console.log(`       Email:        ${data.email || 'N/A'}`);
            console.log(`       Role:         ${data.role || 'N/A'}`);
            console.log(`       Plan:         ${data.plan || 'N/A'}`);
            console.log(`       Business:     ${data.businessName || 'N/A'}`);
            console.log(`       Active:       ${data.isActive !== undefined ? data.isActive : 'N/A'}`);
            
            // Handle createdAt safely
            let createdAtStr = 'N/A';
            if (data.createdAt) {
                try {
                    if (data.createdAt._seconds) {
                        createdAtStr = new Date(data.createdAt._seconds * 1000).toISOString();
                    } else if (data.createdAt.toDate) {
                        createdAtStr = data.createdAt.toDate().toISOString();
                    }
                } catch (e) {
                    createdAtStr = 'Invalid Date';
                }
            }
            console.log(`       Created:      ${createdAtStr}`);
            
            console.log(`       All Fields:   ${JSON.stringify(data, null, 2)}`);
            console.log('');
        });
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // 2. FIREBASE AUTH ACCOUNTS
    console.log('📊 2. FIREBASE AUTH ACCOUNTS (ALL USERS):\n');
    
    const listAllUsers = async (nextPageToken) => {
        const result = await auth.listUsers(1000, nextPageToken);
        return result;
    };
    
    let allAuthUsers = [];
    let nextPageToken;
    
    do {
        const listUsersResult = await listAllUsers(nextPageToken);
        allAuthUsers = allAuthUsers.concat(listUsersResult.users);
        nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);
    
    if (allAuthUsers.length === 0) {
        console.log('   ⚠️  NO AUTH USERS FOUND\n');
    } else {
        console.log(`   Total Auth Users: ${allAuthUsers.length}\n`);
        
        allAuthUsers.forEach((user, index) => {
            console.log(`   [${index + 1}] UID:           ${user.uid}`);
            console.log(`       Email:        ${user.email || 'N/A'}`);
            console.log(`       Email Verified: ${user.emailVerified}`);
            console.log(`       Disabled:     ${user.disabled}`);
            console.log(`       Created:      ${user.metadata.creationTime}`);
            console.log(`       Last Sign-In: ${user.metadata.lastSignInTime || 'Never'}`);
            console.log(`       Provider:     ${user.providerData.map(p => p.providerId).join(', ')}`);
            console.log('');
        });
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // 3. COMPARISON
    console.log('📊 3. FIRESTORE vs AUTH COMPARISON:\n');
    
    const firestoreEmails = new Set();
    usersSnapshot.forEach(doc => {
        const email = doc.data().email;
        if (email) firestoreEmails.add(email.toLowerCase());
    });
    
    const authEmails = new Set(allAuthUsers.map(u => u.email?.toLowerCase()).filter(Boolean));
    
    console.log(`   Firestore documents: ${usersSnapshot.size}`);
    console.log(`   Auth accounts:       ${allAuthUsers.length}\n`);
    
    // Users in Auth but not in Firestore
    const authOnly = [...authEmails].filter(email => !firestoreEmails.has(email));
    if (authOnly.length > 0) {
        console.log(`   ⚠️  In Auth but NOT in Firestore (${authOnly.length}):`);
        authOnly.forEach(email => console.log(`       - ${email}`));
        console.log('');
    }
    
    // Users in Firestore but not in Auth
    const firestoreOnly = [...firestoreEmails].filter(email => !authEmails.has(email));
    if (firestoreOnly.length > 0) {
        console.log(`   ⚠️  In Firestore but NOT in Auth (${firestoreOnly.length}):`);
        firestoreOnly.forEach(email => console.log(`       - ${email}`));
        console.log('');
    }
    
    if (authOnly.length === 0 && firestoreOnly.length === 0) {
        console.log('   ✅ AUTH AND FIRESTORE ARE IN SYNC\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
}

auditDatabase()
    .then(() => {
        console.log('✅ AUDIT COMPLETE\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
