/**
 * database/mongodb.js
 *
 * Mongoose connection to MongoDB Atlas.
 * Called once at server startup (server.js) before routes are active.
 *
 * Usage:
 *   import { connectMongo } from './database/mongodb.js';
 *   await connectMongo();
 */

import mongoose from 'mongoose';

let isConnected = false;

export async function connectMongo() {
  if (isConnected) {
    console.log('[MongoDB] Already connected — reusing existing connection.');
    return;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('<username>') || uri.includes('<password>')) {
    throw new Error(
      '[MongoDB] MONGODB_URI is not set or still contains placeholder credentials. ' +
      'Please update your .env file with real Atlas credentials.'
    );
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000, // fail fast if Atlas is unreachable
    });

    isConnected = true;

    const dbName = mongoose.connection.db.databaseName;
    console.log(`[MongoDB] ✅ Connected to Atlas — database: "${dbName}"`);
  } catch (err) {
    console.error('[MongoDB] ❌ Connection failed:', err.message);
    throw err;
  }
}

export default mongoose;
