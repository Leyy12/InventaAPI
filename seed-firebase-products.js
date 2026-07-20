/**
 * Seed Firebase Firestore with Sample Products
 * Run: node seed-firebase-products.js
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import dotenv from 'dotenv';

dotenv.config({ path: './dashboard/.env.local' });

// Firebase config from environment
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

// Sample Products Data
const sampleProducts = [
  // PHARMACY PRODUCTS
  {
    sku: 'PHARM-001',
    name: 'Paracetamol 500mg',
    description: 'Pain reliever and fever reducer',
    category: 'Pain Relief',
    segment: 'Pharmacy',
    price: 5.50,
    stock: 500,
    metadata: {
      dosage: '500mg',
      prescription_required: false,
      manufacturer: 'Generic Pharma'
    },
    tags: ['pain relief', 'fever', 'otc', 'generic'],
    is_active: true,
    is_featured: true
  },
  {
    sku: 'PHARM-002',
    name: 'Biogesic 500mg',
    description: 'Paracetamol for fever and pain',
    category: 'Pain Relief',
    segment: 'Pharmacy',
    price: 6.50,
    stock: 800,
    metadata: {
      dosage: '500mg',
      prescription_required: false,
      manufacturer: 'Unilab'
    },
    tags: ['pain relief', 'fever', 'biogesic', 'paracetamol'],
    is_active: true
  },
  {
    sku: 'PHARM-003',
    name: 'Bioflu',
    description: 'Relief for flu symptoms',
    category: 'Cold & Flu',
    segment: 'Pharmacy',
    price: 9.50,
    stock: 900,
    metadata: {
      dosage: '1 tablet',
      prescription_required: false,
      manufacturer: 'Unilab'
    },
    tags: ['flu', 'cold', 'bioflu', 'fever', 'cough'],
    is_active: true,
    is_featured: true
  },
  {
    sku: 'PHARM-004',
    name: 'Kremil-S',
    description: 'Antacid for hyperacidity',
    category: 'Gastrointestinal',
    segment: 'Pharmacy',
    price: 5.00,
    stock: 1200,
    metadata: {
      dosage: '1 tablet',
      prescription_required: false,
      manufacturer: 'Unilab'
    },
    tags: ['antacid', 'hyperacidity', 'stomach', 'kremil'],
    is_active: true
  },
  {
    sku: 'PHARM-005',
    name: 'Vitamin C 500mg',
    description: 'Immune system booster',
    category: 'Vitamins',
    segment: 'Pharmacy',
    price: 5.00,
    stock: 1000,
    metadata: {
      dosage: '500mg',
      prescription_required: false,
      manufacturer: 'Generic'
    },
    tags: ['vitamin', 'immune', 'health', 'supplement'],
    is_active: true
  },

  // HARDWARE PRODUCTS
  {
    sku: 'HW-001',
    name: 'Hammer Claw 16oz',
    description: 'Professional claw hammer with fiberglass handle',
    category: 'Hand Tools',
    segment: 'Hardware',
    price: 299.00,
    stock: 150,
    metadata: {
      material: 'Steel Head, Fiberglass Handle',
      weight_kg: 0.5,
      warranty_months: 12
    },
    tags: ['tools', 'hammer', 'construction', 'hand tool'],
    is_active: true,
    is_featured: true
  },
  {
    sku: 'HW-002',
    name: 'Screwdriver Set 6pcs',
    description: 'Phillips and flathead screwdriver set',
    category: 'Hand Tools',
    segment: 'Hardware',
    price: 250.00,
    stock: 200,
    metadata: {
      pieces: 6,
      material: 'Chrome Vanadium Steel',
      warranty_months: 12
    },
    tags: ['screwdriver', 'tool set', 'hand tools'],
    is_active: true
  },
  {
    sku: 'HW-003',
    name: 'Tape Measure 5m',
    description: 'Retractable measuring tape',
    category: 'Hand Tools',
    segment: 'Hardware',
    price: 95.00,
    stock: 300,
    metadata: {
      length: '5 meters',
      material: 'Steel',
      auto_lock: true
    },
    tags: ['tape measure', 'measuring', 'construction', 'carpentry'],
    is_active: true
  },
  {
    sku: 'HW-004',
    name: 'LED Bulb 9W',
    description: 'Energy-saving LED bulb',
    category: 'Electrical',
    segment: 'Hardware',
    price: 55.00,
    stock: 500,
    metadata: {
      wattage: '9W',
      equivalent: '60W',
      color_temp: 'Daylight'
    },
    tags: ['led bulb', 'light bulb', 'energy saving', 'electrical'],
    is_active: true,
    is_featured: true
  },
  {
    sku: 'HW-005',
    name: 'Cement Portland 40kg',
    description: 'Type I Portland cement',
    category: 'Building Materials',
    segment: 'Hardware',
    price: 195.00,
    stock: 200,
    metadata: {
      weight_kg: 40,
      type: 'Portland Type I',
      coverage_sqm: 3
    },
    tags: ['cement', 'portland', 'building', 'construction'],
    is_active: true
  },

  // GROCERY PRODUCTS
  {
    sku: 'GROC-001',
    name: 'White Rice 5kg',
    description: 'Premium quality white rice',
    category: 'Grains & Rice',
    segment: 'Grocery',
    price: 245.00,
    stock: 300,
    metadata: {
      net_weight: '5kg',
      origin: 'Philippines',
      shelf_life_months: 12
    },
    tags: ['rice', 'staple', 'grain', 'food'],
    is_active: true,
    is_featured: true
  },
  {
    sku: 'GROC-002',
    name: 'Cooking Oil 1L',
    description: 'Pure vegetable cooking oil',
    category: 'Cooking Essentials',
    segment: 'Grocery',
    price: 89.00,
    stock: 250,
    metadata: {
      volume: '1L',
      type: 'Vegetable Oil',
      cholesterol_free: true
    },
    tags: ['cooking', 'oil', 'kitchen', 'food'],
    is_active: true
  },
  {
    sku: 'GROC-003',
    name: 'Soy Sauce 1L',
    description: 'All-purpose soy sauce',
    category: 'Condiments',
    segment: 'Grocery',
    price: 65.00,
    stock: 400,
    metadata: {
      volume: '1L',
      type: 'Regular',
      brand: 'Silver Swan'
    },
    tags: ['soy sauce', 'condiment', 'cooking', 'seasoning'],
    is_active: true
  },
  {
    sku: 'GROC-004',
    name: 'Sugar 1kg',
    description: 'White refined sugar',
    category: 'Baking & Cooking',
    segment: 'Grocery',
    price: 55.00,
    stock: 350,
    metadata: {
      net_weight: '1kg',
      type: 'Refined',
      origin: 'Philippines'
    },
    tags: ['sugar', 'sweetener', 'baking', 'cooking'],
    is_active: true
  },
  {
    sku: 'GROC-005',
    name: 'Instant Coffee 3-in-1',
    description: 'Coffee with creamer and sugar',
    category: 'Beverages',
    segment: 'Grocery',
    price: 8.00,
    stock: 2000,
    metadata: {
      net_weight: '20g',
      type: '3-in-1',
      servings: 1
    },
    tags: ['coffee', 'instant coffee', '3 in 1', 'beverage'],
    is_active: true,
    is_featured: true
  },
  {
    sku: 'GROC-006',
    name: 'Canned Sardines 155g',
    description: 'Sardines in tomato sauce',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 25.00,
    stock: 600,
    metadata: {
      net_weight: '155g',
      flavor: 'Tomato Sauce',
      expiry: '2025-12-31'
    },
    tags: ['sardines', 'canned', 'seafood', 'protein'],
    is_active: true
  },
  {
    sku: 'GROC-007',
    name: 'Instant Noodles 55g',
    description: 'Beef flavor instant noodles',
    category: 'Noodles',
    segment: 'Grocery',
    price: 12.00,
    stock: 1000,
    metadata: {
      net_weight: '55g',
      flavor: 'Beef',
      cooking_time: '3 minutes'
    },
    tags: ['instant noodles', 'noodles', 'quick meal', 'beef'],
    is_active: true
  },
  {
    sku: 'GROC-008',
    name: 'Laundry Detergent 1kg',
    description: 'Powder laundry detergent',
    category: 'Cleaning',
    segment: 'Grocery',
    price: 125.00,
    stock: 400,
    metadata: {
      weight: '1kg',
      type: 'Powder',
      scent: 'Floral'
    },
    tags: ['detergent', 'laundry', 'cleaning', 'powder'],
    is_active: true
  }
];

async function seedProducts() {
  console.log('🚀 Starting Firebase product seeding...\n');
  
  try {
    // Check if products already exist
    const productsRef = collection(db, 'products');
    const existingQuery = query(productsRef);
    const existingSnapshot = await getDocs(existingQuery);
    
    if (existingSnapshot.size > 0) {
      console.log(`⚠️  Found ${existingSnapshot.size} existing products in database.`);
      console.log('   Skipping seed to avoid duplicates.\n');
      console.log('   To re-seed, manually delete products collection in Firebase Console first.');
      return;
    }

    // Add products to Firestore
    let count = 0;
    for (const product of sampleProducts) {
      await addDoc(productsRef, {
        ...product,
        created_at: new Date(),
        updated_at: new Date()
      });
      count++;
      console.log(`✓ Added: ${product.name} (${product.sku})`);
    }

    console.log(`\n✅ Successfully seeded ${count} products to Firebase!\n`);
    
    // Display summary
    const pharmacyCount = sampleProducts.filter(p => p.segment === 'Pharmacy').length;
    const hardwareCount = sampleProducts.filter(p => p.segment === 'Hardware').length;
    const groceryCount = sampleProducts.filter(p => p.segment === 'Grocery').length;
    
    console.log('📊 Summary:');
    console.log(`   - Pharmacy: ${pharmacyCount} products`);
    console.log(`   - Hardware: ${hardwareCount} products`);
    console.log(`   - Grocery: ${groceryCount} products`);
    console.log(`   - Total: ${count} products\n`);
    
  } catch (error) {
    console.error('❌ Error seeding products:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the seeding function
seedProducts();
