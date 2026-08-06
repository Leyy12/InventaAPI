import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDIgenHFkHR9RQJ0TzOsfqUF824TYOALxA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "inventaapi-db.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "inventaapi-db",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "inventaapi-db.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "915061674133",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:915061674133:web:e01e4bc4a3ca6f74814b9c",
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

// Log current auth persistence setting
if (typeof window !== 'undefined') {
  console.log('[🔍 FIREBASE CONFIG] Auth persistence:', auth.app.options);
  console.log('[🔍 FIREBASE CONFIG] Auth SDK version:', '10.x (v10 modular)');
  console.log('[🔍 FIREBASE CONFIG] Default persistence: browserLocalPersistence (not explicitly set)');
}

export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
