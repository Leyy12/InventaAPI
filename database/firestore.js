// Picks where app data lives. DATA_BACKEND=supabase uses the Supabase Postgres
// database (SUPABASE_DB_URL); anything else keeps Firebase Firestore. Sign-in
// (Firebase Auth) and image storage stay on Firebase either way.
import {
    getFirestore as getFirebaseFirestore,
    FieldValue as FirebaseFieldValue,
    FieldPath as FirebaseFieldPath,
} from 'firebase-admin/firestore';
import {
    PostgresFirestore,
    FieldValue as PostgresFieldValue,
    FieldPath as PostgresFieldPath,
} from './postgres-firestore.js';

export const usesSupabase = process.env.DATA_BACKEND === 'supabase';

if (usesSupabase && !process.env.SUPABASE_DB_URL) {
    throw new Error('[Database] DATA_BACKEND=supabase requires SUPABASE_DB_URL.');
}

let postgresDb;
export function getFirestore() {
    if (!usesSupabase) return getFirebaseFirestore();
    postgresDb ||= new PostgresFirestore({
        connectionString: process.env.SUPABASE_DB_URL,
        projectId: process.env.FIREBASE_PROJECT_ID,
    });
    return postgresDb;
}

export const FieldValue = usesSupabase ? PostgresFieldValue : FirebaseFieldValue;
export const FieldPath = usesSupabase ? PostgresFieldPath : FirebaseFieldPath;
