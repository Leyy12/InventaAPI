/**
 * delete-revoked-keys.js
 * 
 * One-time script: Permanently deletes ALL revoked API keys from Firestore.
 * Keeps all keys with status === 'active'.
 * 
 * Usage: node scripts/delete-revoked-keys.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function deleteRevokedKeys() {
  console.log('🔍 Fetching all API keys from Firestore...');

  const snapshot = await db.collection('api_keys').get();
  const allKeys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const activeKeys = allKeys.filter(k => k.status === 'active');
  const revokedKeys = allKeys.filter(k => k.status !== 'active');

  console.log(`\n📊 Summary:`);
  console.log(`   Total keys    : ${allKeys.length}`);
  console.log(`   Active (keep) : ${activeKeys.length}`);
  console.log(`   Revoked (del) : ${revokedKeys.length}`);

  if (revokedKeys.length === 0) {
    console.log('\n✅ No revoked keys to delete. Done!');
    process.exit(0);
  }

  console.log('\n🗑️  Deleting revoked keys:');
  revokedKeys.forEach(k => {
    console.log(`   - [${k.status}] "${k.name}" (id: ${k.id})`);
  });

  // Batch delete (Firestore batch limit = 500)
  const batch = db.batch();
  revokedKeys.forEach(k => {
    batch.delete(db.collection('api_keys').doc(k.id));
  });

  await batch.commit();

  console.log(`\n✅ Successfully deleted ${revokedKeys.length} revoked key(s).`);
  console.log(`   Remaining active keys: ${activeKeys.length}`);
  activeKeys.forEach(k => {
    console.log(`   ✔ "${k.name}" (plan: ${k.plan}, status: ${k.status})`);
  });

  process.exit(0);
}

deleteRevokedKeys().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
