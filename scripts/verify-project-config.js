/**
 * CRITICAL: Verify Project Configuration Consistency
 * 
 * Checks ALL config files to ensure same Firebase project
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔍 PROJECT CONFIGURATION AUDIT\n');
console.log('═══════════════════════════════════════════════════════════════\n');

// 1. Service Account JSON
console.log('📄 1. SERVICE ACCOUNT (service-account.json):\n');
try {
    const serviceAccount = JSON.parse(
        readFileSync(join(rootDir, 'service-account.json'), 'utf8')
    );
    console.log(`   Project ID:    ${serviceAccount.project_id}`);
    console.log(`   Client Email:  ${serviceAccount.client_email}`);
    console.log('');
} catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
}

// 2. Backend .env
console.log('📄 2. BACKEND (.env):\n');
try {
    const backendEnv = readFileSync(join(rootDir, '.env'), 'utf8');
    const projectIdMatch = backendEnv.match(/FIREBASE_PROJECT_ID=(.+)/);
    const apiKeyMatch = backendEnv.match(/FIREBASE_API_KEY=(.+)/);
    const authDomainMatch = backendEnv.match(/FIREBASE_AUTH_DOMAIN=(.+)/);
    
    console.log(`   FIREBASE_PROJECT_ID:  ${projectIdMatch ? projectIdMatch[1].trim() : 'NOT FOUND'}`);
    console.log(`   FIREBASE_API_KEY:     ${apiKeyMatch ? apiKeyMatch[1].substring(0, 20) + '...' : 'NOT FOUND'}`);
    console.log(`   FIREBASE_AUTH_DOMAIN: ${authDomainMatch ? authDomainMatch[1].trim() : 'NOT FOUND'}`);
    console.log('');
} catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
}

// 3. Dashboard .env.local
console.log('📄 3. DASHBOARD (dashboard/.env.local):\n');
try {
    const dashboardEnv = readFileSync(join(rootDir, 'dashboard', '.env.local'), 'utf8');
    const projectIdMatch = dashboardEnv.match(/NEXT_PUBLIC_FIREBASE_PROJECT_ID=["']?([^"'\n]+)["']?/);
    const apiKeyMatch = dashboardEnv.match(/NEXT_PUBLIC_FIREBASE_API_KEY=["']?([^"'\n]+)["']?/);
    const authDomainMatch = dashboardEnv.match(/NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=["']?([^"'\n]+)["']?/);
    
    console.log(`   PROJECT_ID:    ${projectIdMatch ? projectIdMatch[1].trim() : 'NOT FOUND'}`);
    console.log(`   API_KEY:       ${apiKeyMatch ? apiKeyMatch[1].substring(0, 20) + '...' : 'NOT FOUND'}`);
    console.log(`   AUTH_DOMAIN:   ${authDomainMatch ? authDomainMatch[1].trim() : 'NOT FOUND'}`);
    console.log('');
} catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
}

// 4. Admin Panel .env.local
console.log('📄 4. ADMIN PANEL (admin-panel/.env.local):\n');
try {
    const adminEnv = readFileSync(join(rootDir, 'admin-panel', '.env.local'), 'utf8');
    const projectIdMatch = adminEnv.match(/NEXT_PUBLIC_FIREBASE_PROJECT_ID=["']?([^"'\n]+)["']?/);
    const apiKeyMatch = adminEnv.match(/NEXT_PUBLIC_FIREBASE_API_KEY=["']?([^"'\n]+)["']?/);
    const authDomainMatch = adminEnv.match(/NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=["']?([^"'\n]+)["']?/);
    
    console.log(`   PROJECT_ID:    ${projectIdMatch ? projectIdMatch[1].trim() : 'NOT FOUND'}`);
    console.log(`   API_KEY:       ${apiKeyMatch ? apiKeyMatch[1].substring(0, 20) + '...' : 'NOT FOUND'}`);
    console.log(`   AUTH_DOMAIN:   ${authDomainMatch ? authDomainMatch[1].trim() : 'NOT FOUND'}`);
    console.log('');
} catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
}

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('✅ CONFIGURATION AUDIT COMPLETE\n');
