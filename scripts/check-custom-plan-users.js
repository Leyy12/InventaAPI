/**
 * Check Firestore for users with plan="custom" (old Enterprise name)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

console.log('🔍 CHECKING FOR USERS WITH plan="custom"\n');
console.log('═══════════════════════════════════════════════════════════════\n');

async function checkCustomPlanUsers() {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    const customPlanUsers = [];
    const planCounts = {};
    
    snapshot.forEach(doc => {
        const data = doc.data();
        const plan = data.plan || 'No plan field';
        
        planCounts[plan] = (planCounts[plan] || 0) + 1;
        
        if (data.plan === 'custom' || data.plan === 'Custom') {
            customPlanUsers.push({
                id: doc.id,
                email: data.email,
                plan: data.plan,
                role: data.role
            });
        }
    });
    
    console.log(`📊 PLAN DISTRIBUTION (${snapshot.size} total users):\n`);
    for (const [plan, count] of Object.entries(planCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${plan}: ${count} user${count !== 1 ? 's' : ''}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════\n');
    
    if (customPlanUsers.length > 0) {
        console.log(`🚨 FOUND ${customPlanUsers.length} USER(S) WITH plan="custom":\n`);
        for (const user of customPlanUsers) {
            console.log(`   - ${user.email} (ID: ${user.id})`);
            console.log(`     Plan: ${user.plan}`);
            console.log(`     Role: ${user.role || 'Not set'}\n`);
        }
        console.log('   ⚠️  MUST add "custom" to legacy checks in auth-context.tsx\n');
    } else {
        console.log('✅ NO users with plan="custom" found\n');
        console.log('   Safe to proceed without adding "custom" to legacy checks\n');
    }
}

checkCustomPlanUsers()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('❌ ERROR:', error);
        process.exit(1);
    });
