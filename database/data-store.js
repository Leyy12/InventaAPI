// App data lives in Supabase Postgres (SUPABASE_DB_URL). The data layer keeps the
// document-style API (collection/doc/query/transaction) the routes and services use.
import { PostgresDataStore, FieldValue, FieldPath } from './postgres-data-store.js';

// Kept for older callers; data is always in Supabase now.
export const usesSupabase = true;

let postgresDb;
export function getDataStore() {
    if (!process.env.SUPABASE_DB_URL) throw new Error('[Database] SUPABASE_DB_URL is required.');
    // The data's identity label ("inventaapi-db" = production) decides which payment
    // mode is allowed (services/payment-isolation.js).
    postgresDb ||= new PostgresDataStore({ connectionString: process.env.SUPABASE_DB_URL,
        projectId: process.env.DATA_PROJECT_ID });
    return postgresDb;
}

export { FieldValue, FieldPath };
