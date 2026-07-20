/**
 * Clear existing products and re-seed with fresh data
 * Run: node clear-and-seed-products.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config({ path: './dashboard/.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const sampleProducts = [
  // PHARMACY (8 products)
  {
    sku: 'PHARM-001', name: 'Paracetamol 500mg', description: 'Pain reliever and fever reducer',
    category: 'Pain Relief', segment: 'Pharmacy', price: 5.50, stock: 500,
    metadata: { dosage: '500mg', prescription_required: false, manufacturer: 'Generic Pharma' },
    tags: ['pain relief', 'fever', 'otc'], is_active: true, is_featured: true
  },
  {
    sku: 'PHARM-002', name: 'Biogesic 500mg', description: 'Paracetamol for fever and pain',
    category: 'Pain Relief', segment: 'Pharmacy', price: 6.50, stock: 800,
    metadata: { dosage: '500mg', prescription_required: false, manufacturer: 'Unilab' },
    tags: ['pain relief', 'fever', 'biogesic'], is_active: true
  },
  {
    sku: 'PHARM-003', name: 'Bioflu', description: 'Relief for flu symptoms',
    category: 'Cold & Flu', segment: 'Pharmacy', price: 9.50, stock: 900,
    metadata: { dosage: '1 tablet', prescription_required: false, manufacturer: 'Unilab' },
    tags: ['flu', 'cold', 'bioflu'], is_active: true, is_featured: true
  },
  {
    sku: 'PHARM-004', name: 'Kremil-S', description: 'Antacid for hyperacidity',
    category: 'Gastrointestinal', segment: 'Pharmacy', price: 5.00, stock: 1200,
    metadata: { dosage: '1 tablet', prescription_required: false, manufacturer: 'Unilab' },
    tags: ['antacid', 'stomach'], is_active: true
  },
  {
    sku: 'PHARM-005', name: 'Vitamin C 500mg', description: 'Immune system booster',
    category: 'Vitamins', segment: 'Pharmacy', price: 5.00, stock: 1000,
    metadata: { dosage: '500mg', prescription_required: false },
    tags: ['vitamin', 'immune'], is_active: true
  },
  {
    sku: 'PHARM-006', name: 'Solmux 500mg', description: 'Carbocisteine for cough with phlegm',
    category: 'Cold & Flu', segment: 'Pharmacy', price: 11.00, stock: 700,
    metadata: { dosage: '500mg', prescription_required: false, manufacturer: 'Unilab' },
    tags: ['cough', 'phlegm', 'solmux'], is_active: true
  },
  {
    sku: 'PHARM-007', name: 'Diatabs', description: 'Antidiarrheal medication',
    category: 'Gastrointestinal', segment: 'Pharmacy', price: 6.50, stock: 800,
    metadata: { dosage: '2 tablets', prescription_required: false, manufacturer: 'Unilab' },
    tags: ['diarrhea', 'lbm', 'stomach'], is_active: true
  },
  {
    sku: 'PHARM-008', name: 'Betadine Solution 120ml', description: 'Antiseptic wound cleanser',
    category: 'First Aid', segment: 'Pharmacy', price: 85.00, stock: 400,
    metadata: { volume: '120ml', prescription_required: false },
    tags: ['betadine', 'antiseptic', 'wound care'], is_active: true, is_featured: true
  },

  // HARDWARE (8 products)
  {
    sku: 'HW-001', name: 'Hammer Claw 16oz', description: 'Professional claw hammer',
    category: 'Hand Tools', segment: 'Hardware', price: 299.00, stock: 150,
    metadata: { material: 'Steel Head', weight_kg: 0.5, warranty_months: 12 },
    tags: ['tools', 'hammer', 'construction'], is_active: true, is_featured: true
  },
  {
    sku: 'HW-002', name: 'Screwdriver Set 6pcs', description: 'Phillips and flathead set',
    category: 'Hand Tools', segment: 'Hardware', price: 250.00, stock: 200,
    metadata: { pieces: 6, material: 'Chrome Vanadium' },
    tags: ['screwdriver', 'tool set'], is_active: true
  },
  {
    sku: 'HW-003', name: 'Tape Measure 5m', description: 'Retractable measuring tape',
    category: 'Hand Tools', segment: 'Hardware', price: 95.00, stock: 300,
    metadata: { length: '5 meters', auto_lock: true },
    tags: ['tape measure', 'measuring'], is_active: true
  },
  {
    sku: 'HW-004', name: 'LED Bulb 9W', description: 'Energy-saving LED bulb',
    category: 'Electrical', segment: 'Hardware', price: 55.00, stock: 500,
    metadata: { wattage: '9W', color_temp: 'Daylight' },
    tags: ['led bulb', 'energy saving'], is_active: true, is_featured: true
  },
  {
    sku: 'HW-005', name: 'Cement Portland 40kg', description: 'Type I Portland cement',
    category: 'Building Materials', segment: 'Hardware', price: 195.00, stock: 200,
    metadata: { weight_kg: 40, coverage_sqm: 3 },
    tags: ['cement', 'building'], is_active: true
  },
  {
    sku: 'HW-006', name: 'Extension Cord 5m', description: '3-outlet extension with breaker',
    category: 'Electrical', segment: 'Hardware', price: 185.00, stock: 200,
    metadata: { length: '5 meters', outlets: 3 },
    tags: ['extension cord', 'electrical'], is_active: true
  },
  {
    sku: 'HW-007', name: 'Paint Roller Kit', description: 'Complete paint roller with tray',
    category: 'Painting', segment: 'Hardware', price: 180.00, stock: 120,
    metadata: { roller_width: '9 inches' },
    tags: ['paint', 'roller'], is_active: true
  },
  {
    sku: 'HW-008', name: 'PVC Pipe 1/2 inch 3m', description: 'Schedule 40 PVC pipe',
    category: 'Plumbing', segment: 'Hardware', price: 125.00, stock: 300,
    metadata: { diameter: '1/2 inch', length: '3 meters' },
    tags: ['pvc pipe', 'plumbing'], is_active: true, is_featured: true
  },

  // GROCERY (12 products)
  {
    sku: 'GROC-001', name: 'White Rice 5kg', description: 'Premium quality white rice',
    category: 'Grains & Rice', segment: 'Grocery', price: 245.00, stock: 300,
    metadata: { net_weight: '5kg', origin: 'Philippines' },
    tags: ['rice', 'staple', 'grain'], is_active: true, is_featured: true
  },
  {
    sku: 'GROC-002', name: 'Cooking Oil 1L', description: 'Pure vegetable cooking oil',
    category: 'Cooking Essentials', segment: 'Grocery', price: 89.00, stock: 250,
    metadata: { volume: '1L', type: 'Vegetable Oil' },
    tags: ['cooking', 'oil'], is_active: true
  },
  {
    sku: 'GROC-003', name: 'Soy Sauce 1L', description: 'All-purpose soy sauce',
    category: 'Condiments', segment: 'Grocery', price: 65.00, stock: 400,
    metadata: { volume: '1L', brand: 'Silver Swan' },
    tags: ['soy sauce', 'condiment'], is_active: true
  },
  {
    sku: 'GROC-004', name: 'Sugar 1kg', description: 'White refined sugar',
    category: 'Baking', segment: 'Grocery', price: 55.00, stock: 350,
    metadata: { net_weight: '1kg', type: 'Refined' },
    tags: ['sugar', 'sweetener'], is_active: true
  },
  {
    sku: 'GROC-005', name: 'Instant Coffee 3-in-1', description: 'Coffee with creamer and sugar',
    category: 'Beverages', segment: 'Grocery', price: 8.00, stock: 2000,
    metadata: { net_weight: '20g', servings: 1 },
    tags: ['coffee', '3 in 1'], is_active: true, is_featured: true
  },
  {
    sku: 'GROC-006', name: 'Canned Sardines 155g', description: 'Sardines in tomato sauce',
    category: 'Canned Goods', segment: 'Grocery', price: 25.00, stock: 600,
    metadata: { net_weight: '155g', flavor: 'Tomato Sauce' },
    tags: ['sardines', 'canned'], is_active: true
  },
  {
    sku: 'GROC-007', name: 'Instant Noodles 55g', description: 'Beef flavor instant noodles',
    category: 'Noodles', segment: 'Grocery', price: 12.00, stock: 1000,
    metadata: { net_weight: '55g', flavor: 'Beef' },
    tags: ['instant noodles', 'quick meal'], is_active: true
  },
  {
    sku: 'GROC-008', name: 'Laundry Detergent 1kg', description: 'Powder laundry detergent',
    category: 'Cleaning', segment: 'Grocery', price: 125.00, stock: 400,
    metadata: { weight: '1kg', type: 'Powder' },
    tags: ['detergent', 'laundry'], is_active: true
  },
  {
    sku: 'GROC-009', name: 'Evaporated Milk 370ml', description: 'Full cream evaporated milk',
    category: 'Dairy', segment: 'Grocery', price: 42.00, stock: 700,
    metadata: { volume: '370ml', type: 'Evaporated' },
    tags: ['milk', 'dairy'], is_active: true
  },
  {
    sku: 'GROC-010', name: 'Corned Beef 175g', description: 'Premium corned beef',
    category: 'Canned Goods', segment: 'Grocery', price: 65.00, stock: 500,
    metadata: { net_weight: '175g' },
    tags: ['corned beef', 'canned'], is_active: true, is_featured: true
  },
  {
    sku: 'GROC-011', name: 'Pancit Canton 227g', description: 'Instant stir-fry noodles',
    category: 'Noodles', segment: 'Grocery', price: 28.00, stock: 800,
    metadata: { net_weight: '227g', type: 'Stir-fry' },
    tags: ['pancit canton', 'stir fry'], is_active: true
  },
  {
    sku: 'GROC-012', name: 'Dishwashing Liquid 250ml', description: 'Antibacterial dish soap',
    category: 'Cleaning', segment: 'Grocery', price: 32.00, stock: 800,
    metadata: { volume: '250ml', antibacterial: true },
    tags: ['dishwashing', 'soap'], is_active: true
  }
];

async function clearAndSeed() {
  console.log('🚀 Starting Firebase product management...\n');
  
  try {
    const productsRef = collection(db, 'products');
    
    // Step 1: Clear existing products
    console.log('🗑️  Clearing existing products...');
    const existingSnapshot = await getDocs(productsRef);
    
    if (existingSnapshot.size > 0) {
      console.log(`   Found ${existingSnapshot.size} existing products. Deleting...`);
      
      for (const document of existingSnapshot.docs) {
        await deleteDoc(doc(db, 'products', document.id));
      }
      console.log('   ✓ All existing products deleted.\n');
    } else {
      console.log('   No existing products found.\n');
    }

    // Step 2: Add new products
    console.log('📦 Adding new products...\n');
    let count = 0;
    
    for (const product of sampleProducts) {
      await addDoc(productsRef, {
        ...product,
        created_at: new Date(),
        updated_at: new Date()
      });
      count++;
      console.log(`   ✓ ${count}. ${product.name} (${product.sku}) - ₱${product.price}`);
    }

    console.log(`\n✅ Successfully seeded ${count} products!\n`);
    
    // Summary
    const pharmacyCount = sampleProducts.filter(p => p.segment === 'Pharmacy').length;
    const hardwareCount = sampleProducts.filter(p => p.segment === 'Hardware').length;
    const groceryCount = sampleProducts.filter(p => p.segment === 'Grocery').length;
    
    console.log('📊 Summary:');
    console.log(`   🏥 Pharmacy: ${pharmacyCount} products`);
    console.log(`   🔧 Hardware: ${hardwareCount} products`);
    console.log(`   🛒 Grocery: ${groceryCount} products`);
    console.log(`   📦 Total: ${count} products\n`);
    console.log('🎉 Database is ready! Refresh your Product Catalog page.\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

clearAndSeed();
