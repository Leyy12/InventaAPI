/**
 * Firebase Product Seeder v2
 * - Removed: stock field
 * - Added: size field (nullable) and image_url (required)
 */

const admin = require('firebase-admin');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from dashboard/.env.local
dotenv.config({ path: path.join(__dirname, 'dashboard', '.env.local') });

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Product data with realistic images and sizes
const products = [
  // === PHARMACY PRODUCTS ===
  {
    sku: 'PH-MED-001',
    name: 'Amoxicillin 500mg',
    description: 'Antibiotic for bacterial infections',
    category: 'Antibiotics',
    segment: 'Pharmacy',
    price: 8.50,
    size: '500mg',
    image_url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800',
    metadata: {
      dosage_form: 'Capsule',
      manufacturer: 'PharmaCorp',
      requires_prescription: true
    },
    tags: ['antibiotic', 'prescription', 'capsule'],
    is_active: true,
    is_featured: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'PH-MED-002',
    name: 'Paracetamol 500mg',
    description: 'Pain reliever and fever reducer',
    category: 'Pain Relief',
    segment: 'Pharmacy',
    price: 3.25,
    size: '500mg',
    image_url: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800',
    metadata: {
      dosage_form: 'Tablet',
      manufacturer: 'MediCare',
      requires_prescription: false
    },
    tags: ['pain-relief', 'fever', 'tablet', 'otc'],
    is_active: true,
    is_featured: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'PH-VIT-003',
    name: 'Vitamin C 1000mg',
    description: 'Immune system support supplement',
    category: 'Vitamins',
    segment: 'Pharmacy',
    price: 12.00,
    size: '1000mg',
    image_url: 'https://images.unsplash.com/photo-1550572017-4691383d2c08?w=800',
    metadata: {
      dosage_form: 'Tablet',
      manufacturer: 'VitaHealth',
      requires_prescription: false
    },
    tags: ['vitamin', 'supplement', 'immunity'],
    is_active: true,
    is_featured: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'PH-MED-004',
    name: 'Ibuprofen 400mg',
    description: 'Anti-inflammatory and pain reliever',
    category: 'Pain Relief',
    segment: 'Pharmacy',
    price: 6.75,
    size: '400mg',
    image_url: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800',
    metadata: {
      dosage_form: 'Tablet',
      manufacturer: 'PharmaCorp',
      requires_prescription: false
    },
    tags: ['pain-relief', 'anti-inflammatory', 'otc'],
    is_active: true,
    is_featured: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },

  // === HARDWARE PRODUCTS ===
  {
    sku: 'HW-PLM-001',
    name: 'PVC Pipe',
    description: 'uPVC pressure pipe for plumbing',
    category: 'Plumbing',
    segment: 'Hardware',
    price: 125.00,
    size: '1/2 inch x 10ft',
    image_url: 'https://images.unsplash.com/photo-1607400201889-565b1ee75f8e?w=800',
    metadata: {
      material: 'uPVC',
      pressure_rating: '150 PSI',
      color: 'Gray'
    },
    tags: ['plumbing', 'pipe', 'pvc'],
    is_active: true,
    is_featured: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'HW-ELC-002',
    name: 'Electrical Wire',
    description: 'THHN/THWN stranded copper wire',
    category: 'Electrical',
    segment: 'Hardware',
    price: 89.50,
    size: '2.0mm x 100m',
    image_url: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=800',
    metadata: {
      conductor: 'Copper',
      insulation: 'PVC',
      voltage_rating: '600V'
    },
    tags: ['electrical', 'wire', 'copper'],
    is_active: true,
    is_featured: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'HW-TLS-003',
    name: 'Cordless Drill',
    description: '20V MAX lithium-ion cordless drill',
    category: 'Power Tools',
    segment: 'Hardware',
    price: 2850.00,
    size: null, // Some products don't need size
    image_url: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=800',
    metadata: {
      voltage: '20V',
      battery_type: 'Lithium-ion',
      max_torque: '300 in-lbs'
    },
    tags: ['power-tool', 'drill', 'cordless'],
    is_active: true,
    is_featured: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'HW-PLM-004',
    name: 'Brass Ball Valve',
    description: 'Full port brass ball valve',
    category: 'Plumbing',
    segment: 'Hardware',
    price: 345.00,
    size: '3/4 inch',
    image_url: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800',
    metadata: {
      material: 'Brass',
      type: 'Full Port',
      working_pressure: '600 PSI'
    },
    tags: ['plumbing', 'valve', 'brass'],
    is_active: true,
    is_featured: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },

  // === GROCERY PRODUCTS ===
  {
    sku: 'GR-DRY-001',
    name: 'Fresh Milk',
    description: 'Pasteurized fresh milk',
    category: 'Dairy',
    segment: 'Grocery',
    price: 85.00,
    size: '1 Liter',
    image_url: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=800',
    metadata: {
      brand: 'Alaska',
      storage: 'Refrigerated',
      shelf_life: '7 days'
    },
    tags: ['dairy', 'milk', 'refrigerated'],
    is_active: true,
    is_featured: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'GR-DRY-002',
    name: 'Premium Rice',
    description: 'Jasmine fragrant rice',
    category: 'Grains',
    segment: 'Grocery',
    price: 1250.00,
    size: '25kg',
    image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=800',
    metadata: {
      variety: 'Jasmine',
      origin: 'Thailand',
      grain_type: 'Long grain'
    },
    tags: ['rice', 'grains', 'staple'],
    is_active: true,
    is_featured: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'GR-SNK-003',
    name: 'Potato Chips',
    description: 'Crispy salted potato chips',
    category: 'Snacks',
    segment: 'Grocery',
    price: 45.00,
    size: '150g',
    image_url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=800',
    metadata: {
      brand: 'Chippy',
      flavor: 'Salted',
      packaging: 'Foil pack'
    },
    tags: ['snacks', 'chips', 'savory'],
    is_active: true,
    is_featured: false,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
  {
    sku: 'GR-BEV-004',
    name: 'Orange Juice',
    description: '100% pure orange juice',
    category: 'Beverages',
    segment: 'Grocery',
    price: 120.00,
    size: '1 Liter',
    image_url: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800',
    metadata: {
      brand: 'Tropicana',
      type: 'Not from concentrate',
      storage: 'Refrigerated'
    },
    tags: ['beverages', 'juice', 'orange'],
    is_active: true,
    is_featured: true,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  },
];

// Clear and seed
async function seedProducts() {
  try {
    console.log('🔥 Starting Firebase product seeding v2...\n');

    // Clear existing products
    console.log('🗑️  Clearing existing products...');
    const snapshot = await db.collection('products').get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`✅ Deleted ${snapshot.size} existing products\n`);

    // Add new products
    console.log('📦 Adding new products...\n');
    for (const product of products) {
      const docRef = await db.collection('products').add(product);
      console.log(`✅ ${product.segment.padEnd(10)} | ${product.sku.padEnd(12)} | ${product.name.padEnd(30)} | ${product.size || 'N/A'}`);
    }

    console.log(`\n🎉 Successfully seeded ${products.length} products!`);
    console.log('\n📊 Summary:');
    console.log(`   - Pharmacy: ${products.filter(p => p.segment === 'Pharmacy').length} products`);
    console.log(`   - Hardware: ${products.filter(p => p.segment === 'Hardware').length} products`);
    console.log(`   - Grocery: ${products.filter(p => p.segment === 'Grocery').length} products`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding products:', error);
    process.exit(1);
  }
}

seedProducts();
