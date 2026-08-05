/**
 * Deploy Firebase Storage Rules via Admin SDK REST API
 * Alternative to firebase CLI when interactive login is not available
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { readFileSync } from 'fs';
import https from 'https';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
const rules = readFileSync('./storage.rules', 'utf8');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const PROJECT_ID = serviceAccount.project_id;

console.log('🔒 DEPLOYING FIREBASE STORAGE RULES VIA ADMIN SDK\n');
console.log(`   Project: ${PROJECT_ID}`);
console.log(`   Rules file: storage.rules\n`);

async function deployStorageRules() {
  try {
    // Get access token
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform']
    });
    
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }
    
    console.log('✓ Authenticated with Firebase\n');
    console.log('📤 Creating new ruleset...\n');
    
    // Create ruleset via Firebase Rules API
    const rulesPayload = JSON.stringify({
      source: {
        files: [{
          name: 'storage.rules',
          content: rules
        }]
      }
    });
    
    const createRulesetOptions = {
      hostname: 'firebaserules.googleapis.com',
      port: 443,
      path: `/v1/projects/${PROJECT_ID}/rulesets`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rulesPayload)
      }
    };
    
    const rulesetResponse = await new Promise((resolve, reject) => {
      const req = https.request(createRulesetOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(rulesPayload);
      req.end();
    });
    
    const rulesetName = rulesetResponse.name;
    console.log(`✓ Ruleset created: ${rulesetName}\n`);
    
    // Make the ruleset active by creating a release
    console.log('🔄 Publishing ruleset (making it active)...\n');
    
    // Get storage bucket name from service account
    const storageBucket = `${PROJECT_ID}.appspot.com`;
    const releaseName = `projects/${PROJECT_ID}/releases/firebase.storage/${storageBucket}`;
    
    const releasePayload = JSON.stringify({
      name: releaseName,
      rulesetName: rulesetName
    });
    
    const updateReleaseOptions = {
      hostname: 'firebaserules.googleapis.com',
      port: 443,
      path: `/v1/${releaseName}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(releasePayload)
      }
    };
    
    await new Promise((resolve, reject) => {
      const req = https.request(updateReleaseOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(releasePayload);
      req.end();
    });
    
    console.log('✅ STORAGE RULES DEPLOYED SUCCESSFULLY!\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🎯 KEY CHANGES:\n');
    console.log('   • Products: Public read, admin-only write');
    console.log('   • File limit: 2MB max size');
    console.log('   • File types: Images only\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ DEPLOYMENT FAILED:', error.message);
    
    if (error.message.includes('404')) {
      console.error('\n💡 This may indicate Storage has never been used in this project.');
      console.error('   Solution: Upload one test file via Firebase Console first to initialize Storage.\n');
    }
    
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

deployStorageRules()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
