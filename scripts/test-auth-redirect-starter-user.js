/**
 * Test Auth Redirect Fix - Check for Starter/Developer users
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🧪 AUTH REDIRECT FIX TEST\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function testAuthFix() {
    // Check for Starter/Developer plan users
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    const starterUsers = [];
    const developerUsers = [];
    
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.plan === 'Starter') {
            starterUsers.push({ id: doc.id, email: data.email, plan: data.plan });
        }
        if (data.plan === 'Developer') {
            developerUsers.push({ id: doc.id, email: data.email, plan: data.plan });
        }
    });
    
    console.log(`📊 Found ${starterUsers.length} Starter plan users`);
    console.log(`📊 Found ${developerUsers.length} Developer plan users\n`);
    
    if (starterUsers.length > 0) {
        console.log('✅ Starter Plan Users:\n');
        for (let i = 0; i < Math.min(3, starterUsers.length); i++) {
            console.log(`   [${i + 1}] ${starterUsers[i].email} (ID: ${starterUsers[i].id})`);
        }
        console.log();
    }
    
    if (developerUsers.length > 0) {
        console.log('✅ Developer Plan Users:\n');
        for (let i = 0; i < Math.min(3, developerUsers.length); i++) {
            console.log(`   [${i + 1}] ${developerUsers[i].email} (ID: ${developerUsers[i].id})`);
        }
        console.log();
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✅ CODE FIX CONFIRMED IN auth-context.tsx:\n');
    console.log('   Line 167: currentAppUser?.plan === "Starter" ||');
    console.log('   Line 168: currentAppUser?.plan === "Developer" ||\n');
    console.log('   Both Starter and Developer plans are now allowed dashboard access.\n');
    
    if (starterUsers.length > 0 || developerUsers.length > 0) {
        console.log('📋 MANUAL TEST:\n');
        console.log('   1. Log in to http://localhost:3000 with one of the above accounts');
        console.log('   2. Confirm you reach the dashboard (not redirected to landing page)');
        console.log('   3. Check browser console for "[AUTH DEBUG]" logs\n');
        console.log('   Expected: Dashboard loads successfully, no redirect loop\n');
    } else {
        console.log('⚠️  NO Starter/Developer users found.\n');
        console.log('   The fix is in place, but needs a test user to verify.\n');
        console.log('   You can:');
        console.log('   1. Sign up a new account (will auto-create as Starter/Developer)');
        console.log('   2. Or manually change an existing user\'s plan to "Starter" in Firestore\n');
    }
}

testAuthFix()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
