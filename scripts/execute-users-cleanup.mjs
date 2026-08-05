import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const db = getFirestore();

async function run() {
  if (!fs.existsSync('users-to-delete.json')) {
    console.error('Error: users-to-delete.json not found. Run prepare script first.');
    process.exit(1);
  }
  
  const toDeleteIds = JSON.parse(fs.readFileSync('users-to-delete.json', 'utf8'));
  
  if (toDeleteIds.length === 0) {
    console.log('No users to delete.');
    return;
  }
  
  console.log(`Starting deletion of ${toDeleteIds.length} test users...`);
  
  const batch = db.batch();
  let count = 0;
  
  for (const id of toDeleteIds) {
    batch.delete(db.collection('users').doc(id));
    count++;
  }
  
  await batch.commit();
  console.log(`✅ Successfully deleted ${count} test users from Firestore.`);
  
  // Clean up the temp file
  fs.unlinkSync('users-to-delete.json');
}

run().catch(console.error);
