import { getAuth } from 'firebase-admin/auth';
import { db } from './database/firebase.js';

async function createTestUser() {
  const email = 'test@example.com';
  const password = 'password123';
  try {
    const userRecord = await getAuth().createUser({
      email: email,
      password: password,
      displayName: 'Test Admin',
    });
    console.log('Successfully created Firebase Auth user:', userRecord.uid);

    // Add to Firestore so that dashboard data fetches might work properly
    await db.usersCol.doc(userRecord.uid).set({
      email: email,
      fullName: 'Test Admin',
      role: 'admin',
      username: 'testadmin'
    });
    console.log('User data successfully added to Firestore database.');
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log('Test user already exists. The password is password123');
      process.exit(0);
    }
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();
