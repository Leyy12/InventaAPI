/**
 * Verify Environment Variables
 * 
 * Checks if required env variables are set correctly
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔍 ENVIRONMENT VARIABLE VERIFICATION\n');
console.log('═══════════════════════════════════════════════════════════════\n');

// Check dashboard .env.local
console.log('📄 1. DASHBOARD (.env.local):\n');
try {
    const dashboardEnvPath = join(rootDir, 'dashboard', '.env.local');
    const dashboardEnv = readFileSync(dashboardEnvPath, 'utf8');
    
    const match = dashboardEnv.match(/NEXT_PUBLIC_SUPERADMIN_UID\s*=\s*["']?([^"'\n]+)["']?/);
    
    if (match) {
        console.log(`   ✅ NEXT_PUBLIC_SUPERADMIN_UID is set`);
        console.log(`   Value: ${match[1]}`);
        console.log('');
    } else {
        console.log(`   ❌ NEXT_PUBLIC_SUPERADMIN_UID is NOT set`);
        console.log(`   Add this line to dashboard/.env.local:`);
        console.log(`   NEXT_PUBLIC_SUPERADMIN_UID="VpDeXopPT5cm7EtrgjfCrJ60Gjr2"`);
        console.log('');
    }
} catch (error) {
    console.log(`   ❌ Error reading dashboard/.env.local: ${error.message}\n`);
}

// Check admin-panel .env.local
console.log('📄 2. ADMIN PANEL (.env.local):\n');
try {
    const adminEnvPath = join(rootDir, 'admin-panel', '.env.local');
    const adminEnv = readFileSync(adminEnvPath, 'utf8');
    
    const match = adminEnv.match(/NEXT_PUBLIC_SUPERADMIN_UID\s*=\s*["']?([^"'\n]+)["']?/);
    
    if (match) {
        console.log(`   ✅ NEXT_PUBLIC_SUPERADMIN_UID is set`);
        console.log(`   Value: ${match[1]}`);
        console.log('');
    } else {
        console.log(`   ❌ NEXT_PUBLIC_SUPERADMIN_UID is NOT set`);
        console.log(`   Add this line to admin-panel/.env.local:`);
        console.log(`   NEXT_PUBLIC_SUPERADMIN_UID="VpDeXopPT5cm7EtrgjfCrJ60Gjr2"`);
        console.log('');
    }
} catch (error) {
    console.log(`   ❌ Error reading admin-panel/.env.local: ${error.message}\n`);
}

// Check if values match
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('📋 CONSISTENCY CHECK:\n');

try {
    const dashboardEnv = readFileSync(join(rootDir, 'dashboard', '.env.local'), 'utf8');
    const adminEnv = readFileSync(join(rootDir, 'admin-panel', '.env.local'), 'utf8');
    
    const dashboardMatch = dashboardEnv.match(/NEXT_PUBLIC_SUPERADMIN_UID\s*=\s*["']?([^"'\n]+)["']?/);
    const adminMatch = adminEnv.match(/NEXT_PUBLIC_SUPERADMIN_UID\s*=\s*["']?([^"'\n]+)["']?/);
    
    if (dashboardMatch && adminMatch) {
        if (dashboardMatch[1] === adminMatch[1]) {
            console.log(`   ✅ VALUES MATCH: ${dashboardMatch[1]}\n`);
        } else {
            console.log(`   ❌ VALUES DO NOT MATCH!`);
            console.log(`      Dashboard: ${dashboardMatch[1]}`);
            console.log(`      Admin Panel: ${adminMatch[1]}\n`);
        }
    } else {
        console.log(`   ⚠️  Cannot compare - one or both values are missing\n`);
    }
} catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
}

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('⚠️  NOTE: Changes to .env files require server restart!\n');
console.log('   Stop and restart: npm run dev\n');

process.exit(0);
