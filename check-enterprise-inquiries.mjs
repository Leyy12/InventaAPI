import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 ENTERPRISE INQUIRIES IN FIRESTORE');
console.log('═══════════════════════════════════════════════════════════════\n');

try {
  const snapshot = await db.collection('enterprise_inquiries').orderBy('createdAt', 'desc').limit(10).get();

  if (snapshot.empty) {
    console.log('❌ No enterprise inquiries found yet.\n');
    console.log('This collection will be created automatically when the first inquiry is submitted.\n');
    process.exit(0);
  }

  console.log(`✅ Found ${snapshot.size} inquiry/inquiries:\n`);

  let index = 1;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`[${index}] Inquiry ID: ${doc.id}`);
    console.log(`    Full Name: ${data.fullName}`);
    console.log(`    Email: ${data.email}`);
    console.log(`    Company: ${data.company}`);
    console.log(`    Message: ${data.message}`);
    console.log(`    Status: ${data.status}`);
    console.log(`    Submitted: ${data.submittedAt || data.createdAt}`);
    console.log('');
    index++;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ All inquiries can also be viewed in Firebase Console:');
  console.log('   https://console.firebase.google.com/project/inventaapi-cf6bc/firestore');
  console.log('═══════════════════════════════════════════════════════════════');

} catch (err) {
  console.error('❌ Error fetching inquiries:', err.message);
  process.exit(1);
}

process.exit(0);
