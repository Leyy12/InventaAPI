import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 API KEYS IN FIRESTORE');
console.log('═══════════════════════════════════════════════════════════════\n');

const snapshot = await db.collection('api_keys').limit(10).get();

if (snapshot.empty) {
    console.log('❌ No API keys found in Firestore.\n');
    process.exit(0);
}

let index = 1;
for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`[${index}] API Key ID: ${doc.id}`);
    console.log(`    Key: ${data.key || 'N/A'}`);
    console.log(`    Name: ${data.name || 'N/A'}`);
    console.log(`    User ID: ${data.userId || 'N/A'}`);
    console.log(`    Status: ${data.status || 'N/A'}`);
    console.log(`    Requests Used: ${data.requestsUsed || 0}`);
    console.log(`    Created: ${data.createdAt || 'N/A'}`);
    console.log('');
    
    // Fetch user plan
    if (data.userId) {
        try {
            const userDoc = await db.collection('users').doc(data.userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                console.log(`    → User Plan: ${userData.plan || 'N/A'}`);
                console.log(`    → User Email: ${userData.email || 'N/A'}`);
                console.log(`    → API Request Limit: ${userData.apiRequestLimit || 'N/A'}`);
            } else {
                console.log(`    → User document not found`);
            }
        } catch (err) {
            console.log(`    → Error fetching user: ${err.message}`);
        }
    }
    console.log('');
    index++;
}

console.log('═══════════════════════════════════════════════════════════════');
process.exit(0);
