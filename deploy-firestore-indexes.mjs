import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { readFileSync } from 'fs';
import https from 'https';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const PROJECT_ID = serviceAccount.project_id;

console.log('🔒 DEPLOYING FIRESTORE INDEXES\n');

async function deployIndexes() {
  try {
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
    
    const indexPayload = JSON.stringify({
      fields: [
        { fieldPath: "userId", order: "ASCENDING" },
        { fieldPath: "createdAt", order: "DESCENDING" }
      ],
      queryScope: "COLLECTION"
    });
    
    const options = {
      hostname: 'firestore.googleapis.com',
      port: 443,
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/notifications/indexes`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(indexPayload)
      }
    };
    
    console.log('📤 Uploading index...');
    
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
      req.write(indexPayload);
      req.end();
    });
    
    console.log(`✅ Index created successfully: ${response.name}\n`);
    
  } catch (error) {
    console.error('❌ DEPLOYMENT FAILED:', error.message);
    process.exit(1);
  }
}

deployIndexes()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
