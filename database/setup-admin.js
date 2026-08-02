import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

const auth = getAuth();
const db = getFirestore();

async function setupAdmin() {
    const email = 'balquinkevinconeal27@gmail.com';
    const password = 'adminPassword123!';
    
    let userRecord;
    try {
        userRecord = await auth.getUserByEmail(email);
        console.log(`User already exists in Firebase Auth with UID: ${userRecord.uid}`);
        // Optionally update password to ensure we know it
        await auth.updateUser(userRecord.uid, { password: password });
        console.log(`Password reset to: ${password}`);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            userRecord = await auth.createUser({
                email: email,
                password: password,
                displayName: 'Super Admin',
            });
            console.log(`Created new Firebase Auth user with UID: ${userRecord.uid}`);
        } else {
            console.error('Error fetching user:', error);
            process.exit(1);
        }
    }

    // Now insert into Firestore with the EXACT uid
    const docRef = db.collection('users').doc(userRecord.uid);
    await docRef.set({
        email: email,
        fullName: 'InventaAPI Super Admin',
        role: 'Admin', // Capitalized 'Admin' to match frontend checks
        businessName: 'InventaAPI Research Team',
        businessSegment: 'Admin',
        plan: 'Unlimited'
    }, { merge: true });

    console.log(`\n✅ Successfully configured Firestore Admin Document!`);
    console.log(`You can now log in at http://localhost:3000/ using:`);
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
}

setupAdmin().then(() => process.exit(0)).catch(console.error);
