/**
 * FORENSIC AUDIT - Users Collection
 * 
 * Checks for:
 * 1. All accounts with admin/Admin role
 * 2. Accounts with elevated API limits (999999)
 * 3. Suspicious patterns indicating backdoor exploitation
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

async function forensicAudit() {
    console.log('🔍 FORENSIC AUDIT - USERS COLLECTION\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🚨 SECURITY INCIDENT INVESTIGATION\n');
    console.log('   Vulnerabilities Found:');
    console.log('   - make-me-admin page (privilege escalation)');
    console.log('   - Signup backdoor (hardcoded email → auto-admin)\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Get ALL users
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`📊 Total users in database: ${usersSnapshot.size}\n`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // FINDING 1: Admin role accounts
    console.log('🔍 FINDING 1: Accounts with ADMIN role\n');
    
    const adminAccounts = [];
    const suspiciousAdmins = [];
    
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        const role = data.role;
        
        // Check for any admin-like role (case-insensitive)
        if (role && role.toLowerCase() === 'admin') {
            const account = {
                uid: doc.id,
                email: data.email,
                fullName: data.fullName,
                role: role,
                plan: data.plan,
                apiRequestLimit: data.apiRequestLimit,
                createdAt: data.createdAt,
                businessName: data.businessName,
                businessSegment: data.businessSegment
            };
            
            adminAccounts.push(account);
            
            // Flag suspicious accounts (not our known admin)
            if (data.email !== 'superadmin@inventaapi.com' && 
                data.email !== 'balquinkevinconeal27@gmail.com') {
                suspiciousAdmins.push(account);
            }
        }
    });
    
    console.log(`   Total admin accounts found: ${adminAccounts.length}\n`);
    
    if (adminAccounts.length === 0) {
        console.log('   ℹ️  No admin accounts found\n');
    } else {
        adminAccounts.forEach((account, index) => {
            console.log(`   Admin #${index + 1}:`);
            console.log(`      UID:              ${account.uid}`);
            console.log(`      Email:            ${account.email}`);
            console.log(`      Full Name:        ${account.fullName || 'N/A'}`);
            console.log(`      Role:             ${account.role}`);
            console.log(`      Plan:             ${account.plan || 'N/A'}`);
            console.log(`      API Limit:        ${account.apiRequestLimit || 'N/A'}`);
            console.log(`      Business Name:    ${account.businessName || 'N/A'}`);
            console.log(`      Business Segment: ${account.businessSegment || 'N/A'}`);
            
            let createdAtStr = 'N/A';
            if (account.createdAt) {
                try {
                    const timestamp = account.createdAt.toDate ? account.createdAt.toDate() : new Date(account.createdAt);
                    createdAtStr = timestamp.toISOString();
                } catch (e) {
                    createdAtStr = String(account.createdAt);
                }
            }
            console.log(`      Created At:       ${createdAtStr}`);
            
            // Flag if suspicious
            if (account.email !== 'superadmin@inventaapi.com' && 
                account.email !== 'balquinkevinconeal27@gmail.com') {
                console.log('      🚨 STATUS:        SUSPICIOUS (unknown admin account)');
            } else {
                console.log('      ✅ STATUS:        Known/Expected');
            }
            
            console.log('');
        });
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // FINDING 2: Elevated API limits
    console.log('🔍 FINDING 2: Accounts with ELEVATED API limits\n');
    console.log('   (Looking for apiRequestLimit > 50 or == 999999)\n');
    
    const elevatedLimitAccounts = [];
    
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        const limit = data.apiRequestLimit;
        
        if (limit && (limit > 50 || limit === 999999)) {
            elevatedLimitAccounts.push({
                uid: doc.id,
                email: data.email,
                fullName: data.fullName,
                role: data.role,
                apiRequestLimit: limit,
                plan: data.plan,
                createdAt: data.createdAt
            });
        }
    });
    
    console.log(`   Total accounts with elevated limits: ${elevatedLimitAccounts.length}\n`);
    
    if (elevatedLimitAccounts.length === 0) {
        console.log('   ℹ️  No accounts with elevated API limits found\n');
    } else {
        elevatedLimitAccounts.forEach((account, index) => {
            console.log(`   Account #${index + 1}:`);
            console.log(`      Email:         ${account.email}`);
            console.log(`      Role:          ${account.role || 'N/A'}`);
            console.log(`      API Limit:     ${account.apiRequestLimit}`);
            console.log(`      Plan:          ${account.plan || 'N/A'}`);
            
            // Check if this matches backdoor pattern (999999)
            if (account.apiRequestLimit === 999999) {
                console.log('      🚨 PATTERN:    Matches backdoor signature (999999)');
            } else {
                console.log('      ⚠️  PATTERN:    Elevated but not backdoor signature');
            }
            
            console.log('');
        });
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // SUMMARY
    console.log('📋 FORENSIC AUDIT SUMMARY\n');
    
    if (suspiciousAdmins.length > 0) {
        console.log(`   🚨 CRITICAL: ${suspiciousAdmins.length} SUSPICIOUS ADMIN ACCOUNT(S) FOUND\n`);
        console.log('      These accounts have admin role but are not expected:\n');
        suspiciousAdmins.forEach(acc => {
            console.log(`      - ${acc.email} (UID: ${acc.uid})`);
        });
        console.log('\n      ⚠️  RECOMMENDATION: Investigate and possibly revoke admin privileges\n');
    } else {
        console.log('   ✅ No suspicious admin accounts found\n');
    }
    
    const backdoorSignatureAccounts = elevatedLimitAccounts.filter(acc => acc.apiRequestLimit === 999999);
    if (backdoorSignatureAccounts.length > 0) {
        console.log(`   🚨 CRITICAL: ${backdoorSignatureAccounts.length} ACCOUNT(S) WITH BACKDOOR SIGNATURE (999999 limit)\n`);
        backdoorSignatureAccounts.forEach(acc => {
            console.log(`      - ${acc.email} (Role: ${acc.role || 'N/A'})`);
        });
        console.log('\n      ⚠️  These accounts likely exploited the signup backdoor\n');
    } else if (elevatedLimitAccounts.length > 0) {
        console.log(`   ⚠️  ${elevatedLimitAccounts.length} account(s) with elevated limits (but not 999999 signature)\n`);
    } else {
        console.log('   ✅ No accounts with backdoor signature found\n');
    }
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✅ FORENSIC AUDIT COMPLETE\n');
}

forensicAudit()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('\n❌ Audit error:', error);
        process.exit(1);
    });
