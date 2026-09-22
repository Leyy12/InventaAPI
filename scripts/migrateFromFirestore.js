/**
 * scripts/migrateFromFirestore.js
 *
 * One-time migration script: Fetches ALL documents from the Firestore 'products'
 * collection and upserts them into MongoDB Atlas.
 *
 * Safe to re-run — uses firestoreId as the unique key (upsert, not insert).
 *
 * Usage:
 *   node scripts/migrateFromFirestore.js
 *
 * Requirements:
 *   - MONGODB_URI must be set in .env with real credentials.
 *   - service-account.json must exist in the project root.
 */

import 'dotenv/config';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import mongoose                from 'mongoose';
import { createRequire }       from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../service-account.json');

// ─── 1. Init Firebase Admin ───────────────────────────────────────────────────
initializeApp({ credential: cert(serviceAccount) });
const firestoreDb = getFirestore();

// ─── 2. Inline Product Schema (avoids circular import issues in scripts) ──────
const VariantSchema = new mongoose.Schema(
  {
    sku:            { type: String,                          default: null },
    flavor:         { type: String,                          default: null },
    size:           { type: String,                          default: null },
    price:          { type: mongoose.Schema.Types.Mixed,     default: null },
    stock:          { type: Number,                          default: 0    },
    expirationDate: { type: String,                          default: null },
    imageUrl:       { type: String,                          default: null },
    image_url:      { type: String,                          default: null },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    firestoreId: { type: String, required: true, unique: true, index: true },
    name:        { type: String, required: true, trim: true },
    brand:       { type: String, default: null },
    sku:         { type: String, default: null },
    description: { type: String, default: '' },
    category:    { type: String, default: null },
    segment:     { type: String, default: null },
    price:       { type: mongoose.Schema.Types.Mixed, default: null },
    stock:       { type: Number, default: 0 },
    image_url:   { type: String, default: null },
    imageUrl:    { type: String, default: null },
    variants:    { type: [VariantSchema], default: [] },
    tags:        { type: [String], default: [] },
    metadata:    { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'products' }
);

const Product = mongoose.model('Product', ProductSchema);

// ─── 3. Helper: convert Firestore Timestamps in variants ─────────────────────
function sanitizeValue(val) {
  if (val && typeof val.toDate === 'function') return val.toDate().toISOString();
  return val;
}

function sanitizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.map(v => {
    const clean = {};
    for (const [k, val] of Object.entries(v)) {
      clean[k] = sanitizeValue(val);
    }
    return clean;
  });
}

// ─── 4. Main migration ────────────────────────────────────────────────────────
async function migrate() {
  // Validate MONGODB_URI
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<username>') || uri.includes('<password>')) {
    console.error('❌ MONGODB_URI is not configured. Please update your .env file.');
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  InventaAPI — Firestore → MongoDB Atlas Migration');
  console.log('  Collection: products');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Connect to MongoDB
  console.log('🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`✅ Connected — database: "${mongoose.connection.db.databaseName}"\n`);

  // Fetch all products from Firestore
  console.log('📦 Fetching all products from Firestore...');
  const snapshot = await firestoreDb.collection('products').get();
  const total = snapshot.docs.length;
  console.log(`   Found ${total} product(s) in Firestore.\n`);

  if (total === 0) {
    console.log('⚠️  No products found in Firestore. Nothing to migrate.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Migrate each product
  let successCount = 0;
  let skipCount    = 0;
  let errorCount   = 0;

  for (let i = 0; i < snapshot.docs.length; i++) {
    const doc  = snapshot.docs[i];
    const data = doc.data();
    const num  = `[${i + 1}/${total}]`;

    console.log(`${num} Migrating: "${data.name || '(unnamed)'}"`);

    try {
      const productDoc = {
        firestoreId: doc.id,
        name:        data.name        || '(unnamed)',
        brand:       data.brand       || null,
        sku:         data.sku         || null,
        description: data.description || '',
        category:    data.category    || null,
        segment:     data.segment     || null,
        price:       data.price       ?? null,
        stock:       typeof data.stock === 'number' ? data.stock : 0,
        image_url:   data.image_url   || null,
        imageUrl:    data.imageUrl    || null,
        variants:    sanitizeVariants(data.variants),
        tags:        Array.isArray(data.tags) ? data.tags : [],
        metadata:    data.metadata    || {},
        isActive:    data.isActive    !== false, // default true
      };

      // Upsert — safe to re-run
      await Product.findOneAndUpdate(
        { firestoreId: doc.id },
        { $set: productDoc },
        { upsert: true, new: true, runValidators: true }
      );

      console.log(`   ✔ OK  (firestoreId: ${doc.id})`);
      successCount++;
    } catch (err) {
      console.error(`   ✘ FAILED: ${err.message}`);
      errorCount++;
    }
  }

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Migration Complete');
  console.log(`  ✅ Migrated : ${successCount}`);
  console.log(`  ⚠️  Errors  : ${errorCount}`);
  console.log(`  Total       : ${total}`);
  console.log('═══════════════════════════════════════════════════════════');

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB Atlas. Done!\n');
  process.exit(errorCount > 0 ? 1 : 0);
}

migrate().catch(err => {
  console.error('\n❌ Migration crashed:', err.message);
  process.exit(1);
});
