/**
 * scripts/migrateEverythingToMongo.js
 *
 * One-time migration script: Fetches all collections from Firestore
 * (users, api_keys, audit_logs, notifications, product_requests, api_telemetry)
 * and upserts them into MongoDB Atlas.
 */

import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import mongoose                from 'mongoose';
import { createRequire }       from 'module';

// Import our new Mongoose Models
import User from '../models/User.js';
import ApiKey from '../models/ApiKey.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import ProductRequest from '../models/ProductRequest.js';
import ApiTelemetry from '../models/ApiTelemetry.js';

const require = createRequire(import.meta.url);
const serviceAccount = require('../service-account.json');

// ─── 1. Init Firebase Admin ───────────────────────────────────────────────────
initializeApp({ credential: cert(serviceAccount) });
const firestoreDb = getFirestore();

// ─── 2. Helper: convert Firestore Timestamps ─────────────────────────────────
function convertTimestamp(val) {
  if (val && typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return val || new Date();
}

// ─── 3. Migration Logic per Collection ───────────────────────────────────────
async function migrateCollection(collectionName, Model, dataMapper) {
  console.log(`📦 Fetching [${collectionName}] from Firestore...`);
  const snapshot = await firestoreDb.collection(collectionName).get();
  const total = snapshot.docs.length;
  console.log(`   Found ${total} document(s).`);

  if (total === 0) return;

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < total; i++) {
    const doc = snapshot.docs[i];
    const data = doc.data();

    try {
      const mappedData = dataMapper(doc.id, data);
      await Model.findOneAndUpdate(
        { firestoreId: doc.id },
        { $set: mappedData },
        { upsert: true, new: true, runValidators: true }
      );
      successCount++;
    } catch (err) {
      console.error(`   ✘ FAILED migrating ${doc.id}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`   ✅ Success: ${successCount} | ⚠️ Errors: ${errorCount}\n`);
}

// ─── 4. Main ─────────────────────────────────────────────────────────────────
async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<username>')) {
    console.error('❌ MONGODB_URI is not configured properly.');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`✅ Connected — database: "${mongoose.connection.db.databaseName}"\n`);

  // Migrate Users
  await migrateCollection('users', User, (id, data) => ({
    firestoreId: id,
    email: data.email,
    businessName: data.businessName || null,
    plan: data.plan || 'free',
    role: data.role || 'consumer',
    selectedSegment: data.selectedSegment || null,
    createdAt: convertTimestamp(data.createdAt),
    updatedAt: convertTimestamp(data.updatedAt)
  }));

  // Migrate API Keys
  await migrateCollection('api_keys', ApiKey, (id, data) => ({
    firestoreId: id,
    userId: data.userId,
    userEmail: data.userEmail || null,
    key: data.key,
    name: data.name,
    status: data.status || 'active',
    plan: data.plan || 'free',
    linkedProductIds: Array.isArray(data.linkedProductIds) ? data.linkedProductIds : [],
    linkedVariantSelections: data.linkedVariantSelections || {},
    productAvailability: data.productAvailability || {},
    requestsUsed: data.requestsUsed || 0,
    lastUsed: data.lastUsed || null,
    createdAt: convertTimestamp(data.createdAt)
  }));

  // Migrate Audit Logs
  await migrateCollection('audit_logs', AuditLog, (id, data) => ({
    firestoreId: id,
    action: data.action,
    userId: data.userId || 'Unknown',
    email: data.email || null,
    endpoint: data.endpoint || null,
    status: data.status || null,
    timestamp: convertTimestamp(data.timestamp)
  }));

  // Migrate Notifications
  await migrateCollection('notifications', Notification, (id, data) => ({
    firestoreId: id,
    userId: data.userId,
    title: data.title,
    message: data.message,
    read: data.read || false,
    type: data.type || 'system',
    link: data.link || null,
    createdAt: convertTimestamp(data.createdAt || data.timestamp)
  }));

  // Migrate Product Requests
  await migrateCollection('product_requests', ProductRequest, (id, data) => ({
    firestoreId: id,
    userId: data.userId,
    userEmail: data.userEmail || null,
    businessName: data.businessName || null,
    productName: data.productName,
    brand: data.brand || null,
    category: data.category || null,
    description: data.description || null,
    reason: data.reason || null,
    status: data.status || 'pending',
    createdAt: convertTimestamp(data.createdAt)
  }));

  // Migrate API Telemetry
  await migrateCollection('api_telemetry', ApiTelemetry, (id, data) => ({
    firestoreId: id,
    apiKeyId: data.apiKeyId || 'unknown',
    userId: data.userId || 'unknown',
    keyName: data.keyName || null,
    endpoint: data.endpoint || 'unknown',
    method: data.method || 'GET',
    statusCode: data.statusCode || 200,
    success: typeof data.success === 'boolean' ? data.success : true,
    latencyMs: data.latencyMs || 0,
    timestamp: convertTimestamp(data.timestamp)
  }));

  console.log('🎉 All migrations completed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('\n❌ Migration crashed:', err.message);
  process.exit(1);
});
