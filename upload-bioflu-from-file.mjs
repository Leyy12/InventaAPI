/**
 * upload-bioflu-from-file.mjs
 * Reads bioflu-image.jpg from the project root and uploads it to Firebase Storage,
 * then updates the Firestore product with the permanent Storage URL.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ─── Firebase Admin Init ───────────────────────────────────────
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  }),
  storageBucket: 'inventaapi.firebasestorage.app',
});

const bucket = getStorage(app).bucket();
const db = getFirestore(app);

const LOCAL_IMAGE_PATH = resolve('./bioflu-image.jpg');
const STORAGE_PATH = 'products/bioflu.jpg';
const BIOFLU_SKU = 'PHARM-003';

async function main() {
  // Check if file exists
  if (!existsSync(LOCAL_IMAGE_PATH)) {
    console.error('❌ Image file not found!');
    console.error(`   Expected at: ${LOCAL_IMAGE_PATH}`);
    console.error('\n📌 Steps to fix:');
    console.error('   1. Save your Bioflu image as "bioflu-image.jpg"');
    console.error('   2. Place it in: c:\\Users\\ACER\\Downloads\\APIinventaB2\\');
    console.error('   3. Run this script again: node upload-bioflu-from-file.mjs');
    process.exit(1);
  }

  const buffer = readFileSync(LOCAL_IMAGE_PATH);
  console.log(`✅ Image found: ${(buffer.length / 1024).toFixed(1)} KB`);

  // Upload to Firebase Storage
  console.log(`📤 Uploading to Firebase Storage → ${STORAGE_PATH}...`);
  const file = bucket.file(STORAGE_PATH);
  await file.save(buffer, {
    metadata: { contentType: 'image/jpeg' },
    public: true,
    resumable: false,
  });

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${STORAGE_PATH}`;
  console.log(`✅ Uploaded successfully!`);
  console.log(`   URL: ${publicUrl}`);

  // Update Firestore
  console.log(`\n🔄 Updating Firestore product (SKU: ${BIOFLU_SKU})...`);
  const snapshot = await db.collection('products').where('sku', '==', BIOFLU_SKU).get();

  let updated = false;
  if (!snapshot.empty) {
    for (const doc of snapshot.docs) {
      await doc.ref.update({ image_url: publicUrl });
      console.log(`✅ Updated Bioflu (${doc.id}) → image_url set to Firebase Storage URL`);
      updated = true;
    }
  }

  if (!updated) {
    // Fallback: search by name
    const snap2 = await db.collection('products').where('name', '==', 'Bioflu').get();
    for (const doc of snap2.docs) {
      await doc.ref.update({ image_url: publicUrl });
      console.log(`✅ Updated Bioflu (${doc.id}) → image_url set to Firebase Storage URL`);
      updated = true;
    }
  }

  if (!updated) {
    console.log('⚠️  Bioflu not found in Firestore. Image uploaded but Firestore not updated.');
  }

  console.log('\n🎉 Done! Refresh the products page to see the correct Bioflu image.');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
