import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
dotenv.config();

console.log("Starting script...");
try {
    console.log("Private key starts with:", process.env.FIREBASE_PRIVATE_KEY?.substring(0, 30));
    console.log("Does it contain literal \\n? ", process.env.FIREBASE_PRIVATE_KEY?.includes('\\n'));
    console.log("Does it contain real \n? ", process.env.FIREBASE_PRIVATE_KEY?.includes('\n'));
    
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey?.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }

    if (!getApps().length) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            }),
        });
    }

    const adminDb = getFirestore();
    console.log("Firestore initialized. Testing write...");
    
    await adminDb.collection('test_ping').add({ ping: true });
    console.log("Write successful!");
} catch (err) {
    console.error("FATAL ERROR:", err);
}
