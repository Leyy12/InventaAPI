// Sign-in is Supabase Auth (see ../supabase-auth.ts); data goes through the API
// (see ../data/data-client.ts). This file keeps the import path the app uses.
import { auth } from "../supabase-auth";

// Data calls take a database handle only for the document-style signature; it is unused.
const db = {} as const;

export { auth, db };
