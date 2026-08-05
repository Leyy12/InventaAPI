/**
 * Import Grocery Batch - 43 variants total
 * - Merge 4 variants into existing GR-001, GR-003, GR-004
 * - Create 28 new products (GR-006 through GR-033) with 39 variants
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

console.log('🚀 GROCERY BATCH IMPORT STARTING\n');
console.log('═══════════════════════════════════════════════════════════════\n');

// ============================================================================
// PART 1: MERGE INTO EXISTING PRODUCTS
// ============================================================================

async function mergeIntoExisting() {
  console.log('📝 PART 1: MERGING INTO EXISTING PRODUCTS\n');
  
  // -------------------------------------------------------------------------
  // GR-001: Bear Brand - Add 33g variant
  // -------------------------------------------------------------------------
  console.log('1. GR-001: Bear Brand Powdered Milk Drink');
  const gr001 = await db.collection('products').where('sku', '==', 'GR-001').get();
  if (!gr001.empty) {
    const doc = gr001.docs[0];
    const data = doc.data();
    
    // Check if 33g already exists
    const has33g = data.variants?.some(v => v.value === '33g');
    if (!has33g) {
      await doc.ref.update({
        variants: FieldValue.arrayUnion({
          id: 'var_gr001_4',
          sku: 'GR-001-33G',
          variantName: 'Pack Size',
          value: '33g',
          price: 17.00,
          image_url: null
        }),
        updated_at: new Date().toISOString()
      });
      console.log('   ✅ Added 33g variant\n');
    } else {
      console.log('   ⚠️  33g already exists, skipped\n');
    }
  }
  
  // -------------------------------------------------------------------------
  // GR-003: Lucky Me Pancit Canton - Add Chilimansi variant
  // -------------------------------------------------------------------------
  console.log('2. GR-003: Lucky Me! Instant Pancit Canton');
  const gr003 = await db.collection('products').where('sku', '==', 'GR-003').get();
  if (!gr003.empty) {
    const doc = gr003.docs[0];
    const data = doc.data();
    
    // Check if Chilimansi already exists
    const hasChilimansi = data.variants?.some(v => v.value.toLowerCase() === 'chilimansi');
    if (!hasChilimansi) {
      await doc.ref.update({
        variants: FieldValue.arrayUnion({
          id: 'var_gr003_5',
          sku: 'GR-003-CHILIMANSI',
          variantName: 'Flavor',
          value: 'Chilimansi',
          price: 18.50,
          image_url: null
        }),
        updated_at: new Date().toISOString()
      });
      console.log('   ✅ Added Chilimansi variant\n');
    } else {
      console.log('   ⚠️  Chilimansi already exists, skipped\n');
    }
  }
  
  // -------------------------------------------------------------------------
  // GR-004: Century Tuna - Restructure + Add Hot & Spicy, Afritada
  // -------------------------------------------------------------------------
  console.log('3. GR-004: Century Tuna Flakes (RESTRUCTURE)');
  const gr004 = await db.collection('products').where('sku', '==', 'GR-004').get();
  if (!gr004.empty) {
    const doc = gr004.docs[0];
    const data = doc.data();
    
    // Restructure existing variants to Flavor format
    const restructuredVariants = [
      {
        id: 'var_gr004_1',
        sku: 'GR-004-OIL-180G',
        variantName: 'Flavor',
        value: 'Oil 180g',
        price: 48.00,
        image_url: null
      },
      {
        id: 'var_gr004_2',
        sku: 'GR-004-OIL-420G',
        variantName: 'Flavor',
        value: 'Oil 420g',
        price: 85.00,
        image_url: null
      },
      {
        id: 'var_gr004_3',
        sku: 'GR-004-HOTSPICY-180G',
        variantName: 'Flavor',
        value: 'Hot & Spicy 180g',
        price: 48.00,
        image_url: null
      },
      {
        id: 'var_gr004_4',
        sku: 'GR-004-AFRITADA-180G',
        variantName: 'Flavor',
        value: 'Afritada 180g',
        price: 50.00,
        image_url: null
      }
    ];
    
    await doc.ref.update({
      name: 'Century Tuna Flakes',  // Remove "in Oil"
      description: 'Premium tuna flakes in various flavors',  // Updated description
      price: 48.00,  // Lowest price
      variants: restructuredVariants,
      updated_at: new Date().toISOString()
    });
    console.log('   ✅ Restructured to Flavor variants');
    console.log('   ✅ Added Hot & Spicy 180g variant');
    console.log('   ✅ Added Afritada 180g variant\n');
  }
  
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// PART 2: CREATE NEW PRODUCTS
// ============================================================================

const newProducts = [
  // Noodles
  {
    sku: 'GR-006',
    name: 'Lucky Me Instant Mami',
    description: 'Classic Filipino instant noodle soup',
    category: 'Noodles',
    segment: 'Grocery',
    price: 16.50,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr006_1', sku: 'GR-006-BEEF', variantName: 'Flavor', value: 'Beef 55g', price: 16.50, image_url: null },
      { id: 'var_gr006_2', sku: 'GR-006-CHICKEN', variantName: 'Flavor', value: 'Chicken 55g', price: 16.50, image_url: null },
      { id: 'var_gr006_3', sku: 'GR-006-HOTBEEF', variantName: 'Flavor', value: 'Hot & Spicy Beef 55g', price: 17.00, image_url: null }
    ]
  },
  {
    sku: 'GR-007',
    name: 'Payless Xtra Big Pancit Canton',
    description: 'Larger pack instant stir-fried noodles',
    category: 'Noodles',
    segment: 'Grocery',
    price: 24.00,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr007_1', sku: 'GR-007-ORIG', variantName: 'Flavor', value: 'Original 130g', price: 24.00, image_url: null },
      { id: 'var_gr007_2', sku: 'GR-007-KALAMAN', variantName: 'Flavor', value: 'Kalamansi 130g', price: 24.00, image_url: null }
    ]
  },
  {
    sku: 'GR-008',
    name: 'Nissin Ramen',
    description: 'Japanese-style instant ramen noodles',
    category: 'Noodles',
    segment: 'Grocery',
    price: 19.00,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr008_1', sku: 'GR-008-SEAFOOD', variantName: 'Flavor', value: 'Seafood 65g', price: 19.00, image_url: null },
      { id: 'var_gr008_2', sku: 'GR-008-BEEF', variantName: 'Flavor', value: 'Beef 65g', price: 19.00, image_url: null }
    ]
  },
  {
    sku: 'GR-009',
    name: 'Nissin Cup Noodles',
    description: 'Instant noodles in a cup for convenience',
    category: 'Noodles',
    segment: 'Grocery',
    price: 32.00,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr009_1', sku: 'GR-009-SEAFOOD', variantName: 'Flavor', value: 'Seafood 60g', price: 32.00, image_url: null },
      { id: 'var_gr009_2', sku: 'GR-009-CHICKEN', variantName: 'Flavor', value: 'Chicken 60g', price: 32.00, image_url: null }
    ]
  },
  
  // Sardines
  {
    sku: 'GR-010',
    name: 'Mega Sardines',
    description: 'Affordable canned sardines in various flavors',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 28.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr010_1', sku: 'GR-010-TOMATO', variantName: 'Flavor', value: 'Tomato Sauce 155g', price: 28.00, image_url: null },
      { id: 'var_gr010_2', sku: 'GR-010-HOTSPICY', variantName: 'Flavor', value: 'Hot & Spicy 155g', price: 29.00, image_url: null },
      { id: 'var_gr010_3', sku: 'GR-010-SPANISH', variantName: 'Flavor', value: 'Spanish Style 155g', price: 38.00, image_url: null }
    ]
  },
  {
    sku: 'GR-011',
    name: '555 Sardines',
    description: 'Classic Filipino sardines in tomato sauce',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 30.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr011_1', sku: 'GR-011-TOMATO', variantName: 'Flavor', value: 'Tomato Sauce 155g', price: 30.00, image_url: null }
    ]
  },
  {
    sku: 'GR-012',
    name: "Young's Town Sardines",
    description: 'Budget-friendly sardines in tomato sauce',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 27.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr012_1', sku: 'GR-012-TOMATO', variantName: 'Flavor', value: 'Tomato Sauce 155g', price: 27.00, image_url: null }
    ]
  },
  {
    sku: 'GR-013',
    name: 'Ligo Sardines',
    description: 'Premium quality sardines in tomato sauce',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 32.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr013_1', sku: 'GR-013-TOMATO', variantName: 'Flavor', value: 'Tomato Sauce 155g', price: 32.00, image_url: null }
    ]
  },
  
  // Tuna
  {
    sku: 'GR-014',
    name: '555 Tuna Flakes',
    description: 'Flaked tuna in Filipino-style sauces',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 45.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr014_1', sku: 'GR-014-ADOBO', variantName: 'Flavor', value: 'Adobo 155g', price: 45.00, image_url: null },
      { id: 'var_gr014_2', sku: 'GR-014-CALDERETA', variantName: 'Flavor', value: 'Caldereta 155g', price: 45.00, image_url: null }
    ]
  },
  
  // Corned Beef
  {
    sku: 'GR-015',
    name: 'Argentina Corned Beef',
    description: 'Popular budget corned beef brand',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 37.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr015_1', sku: 'GR-015-REGULAR', variantName: 'Type', value: 'Regular 150g', price: 37.00, image_url: null },
      { id: 'var_gr015_2', sku: 'GR-015-CHUNKY', variantName: 'Type', value: 'Chunky 150g', price: 40.00, image_url: null }
    ]
  },
  {
    sku: 'GR-016',
    name: 'Purefoods Corned Beef',
    description: 'Premium quality corned beef',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 49.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr016_1', sku: 'GR-016-CLASSIC', variantName: 'Type', value: 'Classic 150g', price: 49.00, image_url: null }
    ]
  },
  {
    sku: 'GR-017',
    name: 'CDO Corned Beef',
    description: 'Trusted Filipino corned beef brand',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 42.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr017_1', sku: 'GR-017-REGULAR', variantName: 'Type', value: 'Regular 150g', price: 42.00, image_url: null }
    ]
  },
  {
    sku: 'GR-018',
    name: 'Highlands Corned Beef',
    description: 'Premium corned beef with quality cuts',
    category: 'Canned Goods',
    segment: 'Grocery',
    price: 59.00,
    expirationDate: '2029-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr018_1', sku: 'GR-018-PREMIUM', variantName: 'Type', value: 'Premium 150g', price: 59.00, image_url: null }
    ]
  },
  
  // Condiments
  {
    sku: 'GR-019',
    name: 'UFC Tomato Sauce',
    description: 'Classic tomato sauce for Filipino cooking',
    category: 'Condiments',
    segment: 'Grocery',
    price: 30.00,
    expirationDate: '2028-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr019_1', sku: 'GR-019-REGULAR', variantName: 'Size', value: 'Regular 250g', price: 30.00, image_url: null }
    ]
  },
  {
    sku: 'GR-020',
    name: 'Del Monte Spaghetti Sauce',
    description: 'Sweet-style spaghetti sauce Filipino favorite',
    category: 'Condiments',
    segment: 'Grocery',
    price: 78.00,
    expirationDate: '2028-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr020_1', sku: 'GR-020-SWEET', variantName: 'Style', value: 'Sweet Style 500g', price: 78.00, image_url: null }
    ]
  },
  {
    sku: 'GR-021',
    name: 'UFC Spaghetti Sauce',
    description: 'Filipino-style spaghetti sauce',
    category: 'Condiments',
    segment: 'Grocery',
    price: 76.00,
    expirationDate: '2028-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr021_1', sku: 'GR-021-FILIPINO', variantName: 'Style', value: 'Filipino Style 500g', price: 76.00, image_url: null }
    ]
  },
  {
    sku: 'GR-022',
    name: 'Del Monte Tomato Paste',
    description: 'Concentrated tomato paste for cooking',
    category: 'Condiments',
    segment: 'Grocery',
    price: 23.00,
    expirationDate: '2028-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr022_1', sku: 'GR-022-ORIG', variantName: 'Type', value: 'Original 90g', price: 23.00, image_url: null }
    ]
  },
  
  // Coffee
  {
    sku: 'GR-023',
    name: 'Nescafé Classic',
    description: 'Premium instant coffee',
    category: 'Beverages',
    segment: 'Grocery',
    price: 115.00,
    expirationDate: '2028-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr023_1', sku: 'GR-023-50G', variantName: 'Size', value: 'Original 50g', price: 115.00, image_url: null },
      { id: 'var_gr023_2', sku: 'GR-023-100G', variantName: 'Size', value: 'Original 100g', price: 220.00, image_url: null }
    ]
  },
  {
    sku: 'GR-024',
    name: 'Nescafé 3 in 1',
    description: 'Instant coffee with creamer and sugar',
    category: 'Beverages',
    segment: 'Grocery',
    price: 8.50,
    expirationDate: '2028-02-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr024_1', sku: 'GR-024-ORIG', variantName: 'Type', value: 'Original 27g', price: 8.50, image_url: null }
    ]
  },
  {
    sku: 'GR-025',
    name: 'Great Taste White Coffee',
    description: 'Popular Filipino white coffee mix',
    category: 'Beverages',
    segment: 'Grocery',
    price: 9.00,
    expirationDate: '2028-02-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr025_1', sku: 'GR-025-ORIG', variantName: 'Type', value: 'Original 30g', price: 9.00, image_url: null }
    ]
  },
  {
    sku: 'GR-026',
    name: 'Kopiko Brown Coffee',
    description: 'Strong brown coffee blend',
    category: 'Beverages',
    segment: 'Grocery',
    price: 9.50,
    expirationDate: '2028-02-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr026_1', sku: 'GR-026-ORIG', variantName: 'Type', value: 'Original 30g', price: 9.50, image_url: null }
    ]
  },
  {
    sku: 'GR-027',
    name: 'San Mig Coffee 3 in 1',
    description: 'Affordable 3-in-1 coffee mix',
    category: 'Beverages',
    segment: 'Grocery',
    price: 8.00,
    expirationDate: '2028-02-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr027_1', sku: 'GR-027-ORIG', variantName: 'Type', value: 'Original 20g', price: 8.00, image_url: null }
    ]
  },
  
  // Milk
  {
    sku: 'GR-028',
    name: 'Alaska Condensed Milk',
    description: 'Sweetened condensed milk for desserts and beverages',
    category: 'Beverages',
    segment: 'Grocery',
    price: 39.00,
    expirationDate: '2028-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr028_1', sku: 'GR-028-SWEET', variantName: 'Type', value: 'Sweetened 300ml', price: 39.00, image_url: null }
    ]
  },
  {
    sku: 'GR-029',
    name: 'Angel Condensed Milk',
    description: 'Budget-friendly sweetened condensed milk',
    category: 'Beverages',
    segment: 'Grocery',
    price: 36.00,
    expirationDate: '2028-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr029_1', sku: 'GR-029-ORIG', variantName: 'Type', value: 'Original 300ml', price: 36.00, image_url: null }
    ]
  },
  
  // Snacks
  {
    sku: 'GR-030',
    name: 'Oishi Pillows',
    description: 'Soft pillow-shaped snacks with creamy filling',
    category: 'Snacks',
    segment: 'Grocery',
    price: 18.00,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr030_1', sku: 'GR-030-CHOCO', variantName: 'Flavor', value: 'Chocolate 38g', price: 18.00, image_url: null },
      { id: 'var_gr030_2', sku: 'GR-030-UBE', variantName: 'Flavor', value: 'Ube 38g', price: 18.00, image_url: null }
    ]
  },
  {
    sku: 'GR-031',
    name: "Jack 'n Jill Piattos",
    description: 'Thin and crispy potato chips',
    category: 'Snacks',
    segment: 'Grocery',
    price: 42.00,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr031_1', sku: 'GR-031-CHEESE', variantName: 'Flavor', value: 'Cheese 85g', price: 42.00, image_url: null }
    ]
  },
  {
    sku: 'GR-032',
    name: "Jack 'n Jill Nova",
    description: 'Crunchy multi-grain snack chips',
    category: 'Snacks',
    segment: 'Grocery',
    price: 35.00,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr032_1', sku: 'GR-032-CHEDDAR', variantName: 'Flavor', value: 'Country Cheddar 78g', price: 35.00, image_url: null }
    ]
  },
  {
    sku: 'GR-033',
    name: "Jack 'n Jill Chippy",
    description: 'Barbecue-flavored corn chips',
    category: 'Snacks',
    segment: 'Grocery',
    price: 39.00,
    expirationDate: '2027-08-03T00:00:00.000Z',
    variants: [
      { id: 'var_gr033_1', sku: 'GR-033-BBQ', variantName: 'Flavor', value: 'Barbecue 110g', price: 39.00, image_url: null }
    ]
  }
];

async function createNewProducts() {
  console.log('📝 PART 2: CREATING NEW PRODUCTS\n');
  
  let successCount = 0;
  let failureCount = 0;
  
  for (const product of newProducts) {
    try {
      await db.collection('products').add({
        ...product,
        size: null,
        image_url: null,
        metadata: {},
        tags: [],
        is_active: true,
        is_featured: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
      console.log(`   ✅ ${product.sku}: ${product.name} (${product.variants.length} variants)`);
      successCount++;
    } catch (error) {
      console.error(`   ❌ ${product.sku}: ${product.name} - ${error.message}`);
      failureCount++;
    }
  }
  
  console.log(`\n   Total: ${successCount} created, ${failureCount} failed\n`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// ============================================================================
// EXECUTE IMPORT
// ============================================================================

async function executeImport() {
  try {
    await mergeIntoExisting();
    await createNewProducts();
    
    console.log('✅ IMPORT COMPLETE\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ IMPORT FAILED:', error);
    process.exit(1);
  }
}

executeImport()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
