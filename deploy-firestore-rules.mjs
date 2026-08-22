/**
 * Deploy Firestore Security Rules via Admin SDK
 * Alternative to `firebase deploy --only firestore:rules`
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { readFileSync } from 'fs';
import https from 'https';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
const rules = readFileSync('./firestore.rules', 'utf8');

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const PROJECT_ID = serviceAccount.project_id;

console.log('🔒 DEPLOYING FIRESTORE SECURITY RULES\n');
console.log(`   Project: ${PROJECT_ID}`);
console.log(`   Rules file: firestore.rules\n`);

async function deployRules() {
  try {
    // Get access token
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    
    if (!accessToken.token) {
      throw new Error('Failed to get access token');
    }
    
    console.log('✓ Authenticated with Firebase\n');
    console.log('📤 Uploading security rules...\n');
    
    // Deploy rules via REST API
    const rulesPayload = JSON.stringify({
      source: {
        files: [{
          name: 'firestore.rules',
          content: rules
        }]
      }
    });
    
    const options = {
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
    
    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
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
    
    const rulesetName = response.name;
    console.log(`✓ Ruleset created: ${rulesetName}\n`);
    
    // Make the new ruleset active
    console.log('🔄 Making ruleset active...\n');
    
    const releasePayload = JSON.stringify({
      release: {
        name: `projects/${PROJECT_ID}/releases/cloud.firestore`,
        rulesetName: rulesetName
      },
      updateMask: 'rulesetName'
    });
    
    const releaseOptions = {
      hostname: 'firebaserules.googleapis.com',
      port: 443,
      path: `/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(releasePayload)
      }
    };
    
    await new Promise((resolve, reject) => {
      const req = https.request(releaseOptions, (res) => {
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
    
    console.log('✅ FIRESTORE RULES DEPLOYED SUCCESSFULLY!\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🎯 KEY CHANGES:\n');
    console.log('   • Products collection: Now publicly readable');
    console.log('     (Changed from: authenticated users only)');
    console.log('   • Reason: DaaS API catalog should be public\n');
    console.log('   • Admin operations: Still restricted to admins only\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('⚡ Next steps:\n');
    console.log('   1. Refresh http://localhost:3000/dashboard/products');
    console.log('   2. Product cards should now load without errors\n');
    
  } catch (error) {
    console.error('❌ DEPLOYMENT FAILED:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

deployRules()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
