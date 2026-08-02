/**
 * Test Auth Redirect Fix - Verify Starter/Developer users can access dashboard
 * Check if code includes Starter/Developer in hasActiveSubscription check
 */

import { readFileSync } from 'fs';

console.log('🔍 AUTH REDIRECT FIX VERIFICATION\n');
console.log('═══════════════════════════════════════════════════════════════\n');

const authFile = 'dashboard/src/lib/firebase/auth-context.tsx';
const content = readFileSync(authFile, 'utf8');

// Find the hasActiveSubscription block
const lines = content.split('\n');
let foundBlock = false;
let blockLines = [];

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('hasActiveSubscription')) {
        foundBlock = true;
        blockLines.push(`Line ${i + 1}: ${lines[i].trim()}`);
        
        // Capture next 10 lines
        for (let j = 1; j <= 10 && (i + j) < lines.length; j++) {
            blockLines.push(`Line ${i + j + 1}: ${lines[i + j].trim()}`);
            if (lines[i + j].includes(';')) break;
        }
        break;
    }
}

if (foundBlock) {
    console.log('✅ Found hasActiveSubscription block:\n');
    for (const line of blockLines) {
        console.log(`   ${line}`);
    }
    console.log();
}

// Check for Starter and Developer plan inclusions
const hasStarter = content.includes('"Starter"') && 
                   content.match(/plan.*===.*["']Starter["']/);
const hasDeveloper = content.includes('"Developer"') && 
                     content.match(/plan.*===.*["']Developer["']/);

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('📋 CODE FIX VERIFICATION:\n');
console.log(`   Includes "Starter" plan check: ${hasStarter ? '✅ YES' : '❌ NO'}`);
console.log(`   Includes "Developer" plan check: ${hasDeveloper ? '✅ YES' : '❌ NO'}\n');

if (hasStarter && hasDeveloper) {
    console.log('✅ CODE FIX CONFIRMED: Starter and Developer plans are allowed\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('🧪 MANUAL TEST NEEDED:\n');
    console.log('   1. Create test user in Firestore with plan: "Starter"');
    console.log('   2. Log in at http://localhost:3000');
    console.log('   3. Confirm user reaches dashboard (not redirected to landing)\n');
    console.log('   OR check browser console for auth debug logs while logged in\n');
} else {
    console.log('❌ CODE FIX NOT FOUND: Starter/Developer plans may still be blocked\n');
}

process.exit(0);
