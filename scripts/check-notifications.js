import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function check() {
  const notifs = await db.collection('notifications').orderBy('createdAt', 'desc').limit(10).get();
  console.log('Recent notifications:');
  notifs.forEach(doc => {
    console.log(`- To: ${doc.data().userId}, Type: ${doc.data().type}, Title: "${doc.data().title}"`);
  });
  process.exit(0);
}

check();
