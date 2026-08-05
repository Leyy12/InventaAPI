import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const db = getFirestore();

async function run() {
  console.log('Fetching all users from Firestore...');
  const snapshot = await db.collection('users').get();
  
  const allUsers = [];
  snapshot.forEach(doc => {
    allUsers.push({ id: doc.id, ...doc.data() });
  });
  
  // 1. Backup all users
  const backupFile = 'users-backup.json';
  fs.writeFileSync(backupFile, JSON.stringify(allUsers, null, 2));
  console.log(`✅ Backed up ${allUsers.length} users to ${backupFile}`);
  
  // 2. Identify test users
  const testNames = [
    "Clean Test User", "Debug Test", "Enterprise Test User", 
    "FINAL TEST", "Final Test User", "Flicker Test User", 
    "Rate Limit Test User", "Sequential Test", "Test Free User", 
    "Test Pro User", "Verify Test"
  ].map(n => n.toLowerCase());

  const toDelete = [];
  
  for (const user of allUsers) {
    const email = (user.email || '').toLowerCase();
    const name = (user.fullName || user.name || '').toLowerCase();
    
    let isTest = false;
    
    // Check email domain
    if (email.endsWith('@test.local') || email.endsWith('@example.com')) {
      isTest = true;
    }
    
    // Check name
    if (!isTest && name) {
      if (testNames.some(tn => name.includes(tn))) {
        isTest = true;
      }
    }
    
    // Do NOT delete delarosaleah38@gmail.com or other legit emails
    // Just to be safe, any gmail/yahoo/hotmail unless it matches the test names exactly?
    // The user said "HUWAG tanggalin ang mga totoong/legit na accounts... mukhang totoong Gmail address"
    // Since our criteria is strict (@test.local, @example.com, or specific test names), it should be safe.
    
    if (isTest) {
      toDelete.push(user);
    }
  }
  
  // 3. Display list to delete
  console.log(`\nFound ${toDelete.length} test accounts to delete:`);
  toDelete.forEach((u, i) => {
    console.log(`${i + 1}. [${u.id}] ${(u.fullName || u.name || 'No Name').padEnd(25)} | ${u.email}`);
  });
  
  if (toDelete.length > 0) {
    console.log('\n⚠️ PLEASE REVIEW THE LIST ABOVE.');
    console.log('To execute the deletion, you will need to run the execute script next.');
    
    // Save the list of IDs to delete for the next script
    fs.writeFileSync('users-to-delete.json', JSON.stringify(toDelete.map(u => u.id), null, 2));
  } else {
    console.log('\nNo test accounts found to delete.');
  }
}

run().catch(console.error);
