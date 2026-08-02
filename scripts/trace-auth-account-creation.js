/**
 * Trace Auth Account Creation - EXACT TIMELINE
 * 
 * Lists ALL Firebase Auth accounts with EXACT creation timestamps
 * to determine when delarosaleah38@gmail.com was created
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const auth = getAuth();

console.log('🔍 FIREBASE AUTH ACCOUNT CREATION TIMELINE\n');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`📌 Project: ${serviceAccount.project_id}\n`);
console.log('═══════════════════════════════════════════════════════════════\n');

async function traceAccounts() {
    const listUsersResult = await auth.listUsers(1000);
    const users = listUsersResult.users;
    
    console.log(`Total Auth Accounts: ${users.length}\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Sort by creation time
    users.sort((a, b) => {
        const timeA = new Date(a.metadata.creationTime).getTime();
        const timeB = new Date(b.metadata.creationTime).getTime();
        return timeA - timeB;
    });
    
    users.forEach((user, index) => {
        console.log(`[${index + 1}] EMAIL: ${user.email}`);
        console.log(`    UID:              ${user.uid}`);
        console.log(`    CREATED:          ${user.metadata.creationTime}`);
        console.log(`    LAST SIGN-IN:     ${user.metadata.lastSignInTime || 'Never'}`);
        console.log(`    EMAIL VERIFIED:   ${user.emailVerified}`);
        console.log(`    DISABLED:         ${user.disabled}`);
        console.log(`    PROVIDER:         ${user.providerData.map(p => p.providerId).join(', ')}`);
        console.log('');
    });
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Calculate time difference
    if (users.length >= 2) {
        const sorted = [...users].sort((a, b) => 
            new Date(a.metadata.creationTime) - new Date(b.metadata.creationTime)
        );
        
        console.log('⏱️  TIME ANALYSIS:\n');
        
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            
            const prevTime = new Date(prev.metadata.creationTime);
            const currTime = new Date(curr.metadata.creationTime);
            const diffMs = currTime - prevTime;
            const diffMin = Math.floor(diffMs / 60000);
            const diffSec = Math.floor((diffMs % 60000) / 1000);
            
            console.log(`   ${prev.email}`);
            console.log(`   → ${curr.email}`);
            console.log(`   TIME DIFFERENCE: ${diffMin} minutes ${diffSec} seconds\n`);
        }
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Check for delarosaleah38@gmail.com specifically
    const testCustomer = users.find(u => u.email === 'delarosaleah38@gmail.com');
    
    if (testCustomer) {
        console.log('🎯 FOCUS: delarosaleah38@gmail.com\n');
        console.log(`   Creation Time (GMT): ${testCustomer.metadata.creationTime}`);
        console.log(`   Last Sign-In:        ${testCustomer.metadata.lastSignInTime || 'Never'}`);
        console.log(`   Sign-In Count:       ${testCustomer.metadata.lastSignInTime ? 'At least 1' : '0'}`);
        console.log('');
        console.log('   IMPLICATIONS:');
        
        if (testCustomer.metadata.lastSignInTime) {
            const creationTime = new Date(testCustomer.metadata.creationTime);
            const signInTime = new Date(testCustomer.metadata.lastSignInTime);
            
            if (creationTime.getTime() === signInTime.getTime()) {
                console.log('   ⚠️  Created and signed in at SAME TIME');
                console.log('   → Likely: User went through signup flow (not script)');
            } else {
                console.log('   ⚠️  Signed in AFTER creation');
                console.log('   → Could be: Script created, user signed in later');
            }
        } else {
            console.log('   ⚠️  NEVER signed in');
            console.log('   → Likely: Script created account, never used');
        }
        
        console.log('');
    } else {
        console.log('❌ delarosaleah38@gmail.com NOT FOUND in Auth\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✅ TIMELINE TRACE COMPLETE\n');
    
    process.exit(0);
}

traceAccounts().catch(error => {
    console.error('❌ ERROR:', error);
    process.exit(1);
});
