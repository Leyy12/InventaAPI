import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId:   process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = getFirestore();

async function makeAdmin() {
    const email = 'balquinkevinconeal27@gmail.com';
    
    // Search the users collection for a document with this email
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();
    
    if (snapshot.empty) {
        console.log(`No user found in Firestore with email: ${email}`);
        console.log(`Please create an account first at http://localhost:3000/signup using this email.`);
        return;
    }
    
    const doc = snapshot.docs[0];
    await usersRef.doc(doc.id).update({
        role: 'Admin',
        businessSegment: 'Admin',
        plan: 'Unlimited'
    });
    
    console.log(`✅ Success! Updated user ${email} to Super Admin.`);
}

makeAdmin().then(() => process.exit(0)).catch(console.error);
