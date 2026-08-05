/**
 * Initialize Firebase Storage by uploading a test file,
 * then deploy security rules
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, writeFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.appspot.com`
  });
}

const storage = getStorage();
const bucket = storage.bucket();

console.log('🔧 INITIALIZING FIREBASE STORAGE\n');
console.log(`   Project: ${serviceAccount.project_id}`);
console.log(`   Bucket: ${bucket.name}\n`);

async function initializeStorage() {
  try {
    // Create a tiny test file
    const testContent = 'Firebase Storage initialized';
    writeFileSync('.storage-init-test.txt', testContent);
    
    console.log('📤 Uploading test file to initialize storage...\n');
    
    // Upload test file
    await bucket.upload('.storage-init-test.txt', {
      destination: '.system/init-test.txt',
      metadata: {
        contentType: 'text/plain'
      }
    });
    
    console.log('✅ Storage initialized successfully!\n');
    console.log('   Test file uploaded: .system/init-test.txt\n');
    
    // Now check if we can access bucket
    const [exists] = await bucket.exists();
    console.log(`   Bucket exists: ${exists}\n`);
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📋 NEXT STEP: Deploy Security Rules\n');
    console.log('   Use Firebase Console to deploy storage.rules:');
    console.log('   1. Go to: https://console.firebase.google.com/project/inventaapi-db/storage/rules');
    console.log('   2. Paste rules from storage.rules file');
    console.log('   3. Click Publish\n');
    console.log('   Or run: firebase deploy --only storage (if CLI is configured)\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ INITIALIZATION FAILED:', error.message);
    
    if (error.message.includes('does not have storage.objects.create')) {
      console.error('\n💡 The service account needs Storage Object Creator permission.');
      console.error('   Add this role in Firebase Console → Storage → Permissions\n');
    }
    
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

initializeStorage()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
