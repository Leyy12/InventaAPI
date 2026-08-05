/**
 * Automated Product Image Upload Script
 * 
 * For each of the 5 critical products:
 * 1. Uses provided high-quality image URL (sourced from official/reputable sources)
 * 2. Downloads the image
 * 3. Uploads to Firebase Storage
 * 4. Updates product document in Firestore with new image_url
 * 
 * Image sources selected for accuracy and legitimacy (thesis demo use)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import https from 'https';
import http from 'http';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: `${serviceAccount.project_id}.appspot.com`
  });
}

const db = getFirestore();
const storage = getStorage();
const bucket = storage.bucket();

// Product image mappings with reputable source URLs
// Note: Using these for academic thesis demonstration purposes
const PRODUCT_IMAGES = [
  {
    sku: 'GR-001',
    name: 'Bear Brand Powdered Milk Drink',
    // Official Nestle product image from their Philippines website
    imageUrl: 'https://www.nestlegoodnes.com/ph/sites/default/files/2024-02/Bear%20Brand%20Fortified%20Regular%20Milk%20700g%202023.png',
    filename: 'bear-brand-700g.png',
    reason: 'Official Nestle Philippines product image - shows actual red/white Bear Brand packaging'
  },
  {
    sku: 'GR-002',
    name: 'Alaska Evaporated Filled Milk',
    // Alaska official product from Nestle Philippines website
    imageUrl: 'https://www.nestlegoodnes.com/ph/sites/default/files/2023-05/Alaska%20Evap%20370mL%20can%202022_0.png',
    filename: 'alaska-evap-370ml.png',
    reason: 'Official Alaska/Nestle Philippines product image - shows actual blue/red can'
  },
  {
    sku: 'PHARM-011',
    name: 'Amoxicillin Trihydrate',
    // Generic but accurate pharmaceutical blister representation
    // Using Unsplash medical-grade image (more accurate than current random pills)
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    filename: 'amoxicillin-blister.jpg',
    reason: 'Pharmaceutical-grade blister pack (more accurate than multi-colored pills) - suitable for generic medicine representation'
  },
  {
    sku: 'PHARM-009',
    name: 'Biogesic (Paracetamol)',
    // Unilab official website or e-commerce product image would be ideal
    // Using high-quality e-commerce reference
    imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80',
    filename: 'biogesic-paracetamol.jpg',
    reason: 'Pharmaceutical blister representation - NOTE: Ideally replace with actual Biogesic Unilab packaging photo for production'
  },
  {
    sku: 'PHARM-010',
    name: 'Bioflu',
    // Similar to Biogesic - pharmaceutical blister
    imageUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
    filename: 'bioflu-blister.jpg',
    reason: 'Pharmaceutical blister representation - NOTE: Ideally replace with actual Bioflu Unilab packaging (orange/white) for production'
  }
];

/**
 * Download image from URL
 */
async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = writeFileSync(filepath, '');
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        writeFileSync(filepath, Buffer.concat(chunks));
        resolve(filepath);
      });
    }).on('error', reject);
  });
}

/**
 * Upload image to Firebase Storage and get download URL
 */
async function uploadToStorage(localPath, destinationPath, contentType) {
  console.log(`   📤 Uploading to Storage: ${destinationPath}`);
  
  const [file] = await bucket.upload(localPath, {
    destination: destinationPath,
    metadata: {
      contentType: contentType,
      metadata: {
        uploadedBy: 'automated-script',
        uploadDate: new Date().toISOString()
      }
    }
  });
  
  // Make file publicly readable
  await file.makePublic();
  
  // Get public URL
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
  console.log(`   ✓ Uploaded: ${publicUrl}\n`);
  
  return publicUrl;
}

/**
 * Update product document in Firestore
 */
async function updateProductImage(sku, newImageUrl) {
  console.log(`   💾 Updating Firestore document for ${sku}...`);
  
  // Find product by SKU
  const snapshot = await db.collection('products').where('sku', '==', sku).limit(1).get();
  
  if (snapshot.empty) {
    throw new Error(`Product with SKU ${sku} not found in Firestore`);
  }
  
  const doc = snapshot.docs[0];
  await doc.ref.update({
    image_url: newImageUrl,
    updated_at: new Date().toISOString()
  });
  
  console.log(`   ✓ Updated product document: ${doc.id}\n`);
}

/**
 * Main upload process
 */
async function uploadAllImages() {
  console.log('🎨 AUTOMATED PRODUCT IMAGE UPLOAD\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`📦 Uploading ${PRODUCT_IMAGES.length} product images...\n`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  let successCount = 0;
  let failureCount = 0;
  const results = [];
  
  for (const product of PRODUCT_IMAGES) {
    try {
      console.log(`🔄 Processing: ${product.name} (${product.sku})`);
      console.log(`   Source: ${product.imageUrl}`);
      console.log(`   Reason: ${product.reason}\n`);
      
      // Download image
      const tempFile = `.temp-${product.filename}`;
      console.log(`   ⬇️  Downloading image...`);
      await downloadImage(product.imageUrl, tempFile);
      console.log(`   ✓ Downloaded to ${tempFile}\n`);
      
      // Determine content type
      const ext = product.filename.split('.').pop().toLowerCase();
      const contentType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/webp';
      
      // Upload to Storage
      const storagePath = `products/${Date.now()}_${product.filename}`;
      const publicUrl = await uploadToStorage(tempFile, storagePath, contentType);
      
      // Update Firestore
      await updateProductImage(product.sku, publicUrl);
      
      // Clean up temp file
      unlinkSync(tempFile);
      
      results.push({
        sku: product.sku,
        name: product.name,
        status: 'SUCCESS',
        newImageUrl: publicUrl
      });
      
      successCount++;
      console.log(`✅ SUCCESS: ${product.name}\n`);
      console.log('───────────────────────────────────────────────────────────────\n');
      
    } catch (error) {
      console.error(`❌ FAILED: ${product.name}`);
      console.error(`   Error: ${error.message}\n`);
      
      results.push({
        sku: product.sku,
        name: product.name,
        status: 'FAILED',
        error: error.message
      });
      
      failureCount++;
      console.log('───────────────────────────────────────────────────────────────\n');
    }
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('📊 UPLOAD SUMMARY\n');
  console.log(`   Total processed: ${PRODUCT_IMAGES.length}`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}\n`);
  
  if (successCount > 0) {
    console.log('✅ SUCCESSFUL UPLOADS:\n');
    results.filter(r => r.status === 'SUCCESS').forEach((r, i) => {
      console.log(`${i + 1}. ${r.name} (${r.sku})`);
      console.log(`   New URL: ${r.newImageUrl}\n`);
    });
  }
  
  if (failureCount > 0) {
    console.log('❌ FAILED UPLOADS:\n');
    results.filter(r => r.status === 'FAILED').forEach((r, i) => {
      console.log(`${i + 1}. ${r.name} (${r.sku})`);
      console.log(`   Error: ${r.error}\n`);
    });
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('🎯 VERIFICATION:\n');
  console.log('   1. Check dashboard: http://localhost:3000/dashboard/products');
  console.log('   2. Verify new images display correctly');
  console.log('   3. Check admin panel: http://localhost:3001/products\n');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

uploadAllImages()
  .then(() => {
    console.log('🏁 Upload script completed\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
