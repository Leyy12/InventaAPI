import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

// Initialize Firebase
const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}
const db = getFirestore();

// Helper to normalize strings: lowercase, trim, remove duplicate spaces
const normalize = (str) => {
  if (!str) return '';
  return String(str).toLowerCase().trim().replace(/\s+/g, ' ');
};

// Raw data from user (Batch 3 - Drinks and Dairy)
const rawData = [
  { brand: "Coca-Cola", product: "Soft Drink", flavor: "Regular", size: "390 ml", price: 25.00, expirationDate: "2027-05-03" },
  { brand: "Coca-Cola", product: "Soft Drink", flavor: "Regular", size: "500 ml", price: 32.00, expirationDate: "2027-05-03" },
  { brand: "Coca-Cola", product: "Soft Drink", flavor: "Regular", size: "1.5 L", price: 78.00, expirationDate: "2027-05-03" },
  { brand: "Coca-Cola", product: "Soft Drink", flavor: "Zero Sugar", size: "500 ml", price: 34.00, expirationDate: "2027-05-03" },
  { brand: "Pepsi", product: "Soft Drink", flavor: "Regular", size: "390 ml", price: 25.00, expirationDate: "2027-05-03" },
  { brand: "Pepsi", product: "Soft Drink", flavor: "Regular", size: "1.5 L", price: 76.00, expirationDate: "2027-05-03" },
  { brand: "Pepsi", product: "Soft Drink", flavor: "Zero Sugar", size: "500 ml", price: 34.00, expirationDate: "2027-05-03" },
  { brand: "Sprite", product: "Soft Drink", flavor: "Lemon-Lime", size: "500 ml", price: 32.00, expirationDate: "2027-05-03" },
  { brand: "Sprite", product: "Soft Drink", flavor: "Lemon-Lime", size: "1.5 L", price: 78.00, expirationDate: "2027-05-03" },
  { brand: "Royal", product: "Soft Drink", flavor: "Tru Orange", size: "500 ml", price: 32.00, expirationDate: "2027-05-03" },
  { brand: "Royal", product: "Soft Drink", flavor: "Tru Orange", size: "1.5 L", price: 78.00, expirationDate: "2027-05-03" },
  { brand: "Mountain Dew", product: "Soft Drink", flavor: "Citrus", size: "500 ml", price: 32.00, expirationDate: "2027-05-03" },
  { brand: "7 Up", product: "Soft Drink", flavor: "Lemon-Lime", size: "500 ml", price: 31.00, expirationDate: "2027-05-03" },
  { brand: "Mirinda", product: "Soft Drink", flavor: "Orange", size: "500 ml", price: 31.00, expirationDate: "2027-05-03" },
  { brand: "Summit", product: "Purified Water", flavor: "Regular", size: "500 ml", price: 18.00, expirationDate: "2028-08-03" },
  { brand: "Summit", product: "Purified Water", flavor: "Regular", size: "1 L", price: 28.00, expirationDate: "2028-08-03" },
  { brand: "Wilkins", product: "Purified Water", flavor: "Regular", size: "500 ml", price: 20.00, expirationDate: "2028-08-03" },
  { brand: "Wilkins", product: "Purified Water", flavor: "Regular", size: "1 L", price: 30.00, expirationDate: "2028-08-03" },
  { brand: "Absolute", product: "Distilled Water", flavor: "Regular", size: "500 ml", price: 19.00, expirationDate: "2028-08-03" },
  { brand: "Nature's Spring", product: "Purified Water", flavor: "Regular", size: "500 ml", price: 18.00, expirationDate: "2028-08-03" },
  { brand: "Gatorade", product: "Sports Drink", flavor: "Blue Bolt", size: "500 ml", price: 42.00, expirationDate: "2027-08-03" },
  { brand: "Gatorade", product: "Sports Drink", flavor: "Lemon", size: "500 ml", price: 42.00, expirationDate: "2027-08-03" },
  { brand: "Sting", product: "Energy Drink", flavor: "Red", size: "330 ml", price: 24.00, expirationDate: "2027-08-03" },
  { brand: "Cobra", product: "Energy Drink", flavor: "Original", size: "350 ml", price: 25.00, expirationDate: "2027-08-03" },
  { brand: "Monster", product: "Energy Drink", flavor: "Original", size: "355 ml", price: 95.00, expirationDate: "2028-02-03" },
  { brand: "Red Bull", product: "Energy Drink", flavor: "Original", size: "250 ml", price: 70.00, expirationDate: "2028-02-03" },
  { brand: "Del Monte", product: "Pineapple Juice", flavor: "Original", size: "240 ml", price: 28.00, expirationDate: "2027-08-03" },
  { brand: "Del Monte", product: "Pineapple Juice", flavor: "Four Seasons", size: "240 ml", price: 28.00, expirationDate: "2027-08-03" },
  { brand: "Del Monte", product: "Pineapple Juice", flavor: "Orange", size: "240 ml", price: 28.00, expirationDate: "2027-08-03" },
  { brand: "Minute Maid", product: "Juice Drink", flavor: "Orange", size: "300 ml", price: 28.00, expirationDate: "2027-05-03" },
  { brand: "Minute Maid", product: "Juice Drink", flavor: "Apple", size: "300 ml", price: 28.00, expirationDate: "2027-05-03" },
  { brand: "Zest-O", product: "Juice Drink", flavor: "Orange", size: "250 ml", price: 15.00, expirationDate: "2027-05-03" },
  { brand: "Zest-O", product: "Juice Drink", flavor: "Apple", size: "250 ml", price: 15.00, expirationDate: "2027-05-03" },
  { brand: "Zest-O", product: "Juice Drink", flavor: "Grape", size: "250 ml", price: 15.00, expirationDate: "2027-05-03" },
  { brand: "Tang", product: "Powdered Juice", flavor: "Orange", size: "19 g", price: 12.00, expirationDate: "2028-02-03" },
  { brand: "Tang", product: "Powdered Juice", flavor: "Grape", size: "19 g", price: 12.00, expirationDate: "2028-02-03" },
  { brand: "Tang", product: "Powdered Juice", flavor: "Mango", size: "19 g", price: 12.00, expirationDate: "2028-02-03" },
  { brand: "Nestea", product: "Iced Tea Mix", flavor: "Lemon", size: "25 g", price: 14.00, expirationDate: "2028-02-03" },
  { brand: "Nestea", product: "Iced Tea Mix", flavor: "Apple", size: "25 g", price: 14.00, expirationDate: "2028-02-03" },
  { brand: "Oishi", product: "Smart C+", flavor: "Orange", size: "350 ml", price: 28.00, expirationDate: "2027-08-03" },
  { brand: "Oishi", product: "Smart C+", flavor: "Lemon", size: "350 ml", price: 28.00, expirationDate: "2027-08-03" },
  { brand: "Dutch Mill", product: "Yogurt Drink", flavor: "Mixed Fruits", size: "180 ml", price: 22.00, expirationDate: "2027-02-03" },
  { brand: "Dutch Mill", product: "Yogurt Drink", flavor: "Strawberry", size: "180 ml", price: 22.00, expirationDate: "2027-02-03" },
  { brand: "Yakult", product: "Probiotic Drink", flavor: "Original", size: "80 ml", price: 18.00, expirationDate: "2026-10-03" },
  { brand: "Vitamilk", product: "Soy Milk", flavor: "Original", size: "300 ml", price: 34.00, expirationDate: "2027-08-03" },
  { brand: "Vitamilk", product: "Soy Milk", flavor: "Chocolate", size: "300 ml", price: 34.00, expirationDate: "2027-08-03" },
  { brand: "Chuckie", product: "Chocolate Milk", flavor: "Original", size: "180 ml", price: 18.00, expirationDate: "2027-02-03" },
  { brand: "Magnolia", product: "Fresh Milk", flavor: "Full Cream", size: "1 L", price: 115.00, expirationDate: "2027-02-03" },
  { brand: "Nestlé", product: "All Purpose Cream", flavor: "Original", size: "250 ml", price: 58.00, expirationDate: "2027-08-03" },
  { brand: "Alaska", product: "Fresh Milk", flavor: "Low Fat", size: "1 L", price: 118.00, expirationDate: "2027-02-03" }
];

async function runOptimized() {
  let stats = {
    productsCreated: 0,
    productsUpdated: 0,
    variantsAdded: 0,
    variantsSkipped: 0,
    failed: 0
  };

  const productsRef = db.collection('products');

  try {
    // 1. Group data by brand and product
    const grouped = {};
    for (const item of rawData) {
      const key = `${normalize(item.brand)}|||${normalize(item.product)}`;
      if (!grouped[key]) {
        grouped[key] = {
          brand: item.brand,
          product: item.product,
          variants: []
        };
      }
      grouped[key].variants.push({
        flavor: item.flavor,
        size: item.size,
        price: item.price,
        expirationDate: item.expirationDate
      });
    }

    // 2. Fetch all products once to map existing
    const snapshot = await productsRef.get();
    const existingProductsMap = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      const key = `${normalize(data.brand)}|||${normalize(data.product)}`;
      existingProductsMap[key] = { id: doc.id, ref: doc.ref, data: data };
    });

    // 3. Process groups
    for (const [key, group] of Object.entries(grouped)) {
      try {
        if (existingProductsMap[key]) {
          // Exists -> Update
          const existing = existingProductsMap[key];
          const existingVariants = existing.data.variants || [];
          let updated = false;

          for (const newVar of group.variants) {
            const exists = existingVariants.some(v => 
              normalize(v.flavor) === normalize(newVar.flavor) && 
              normalize(v.size) === normalize(newVar.size)
            );

            if (exists) {
              stats.variantsSkipped++;
            } else {
              existingVariants.push(newVar);
              stats.variantsAdded++;
              updated = true;
            }
          }

          if (updated) {
            await existing.ref.update({
              variants: existingVariants,
              updatedAt: FieldValue.serverTimestamp()
            });
            stats.productsUpdated++;
          }
        } else {
          // Does not exist -> Create
          // Deduplicate variants within the group just in case
          const uniqueVariants = [];
          for (const newVar of group.variants) {
            const exists = uniqueVariants.some(v => 
              normalize(v.flavor) === normalize(newVar.flavor) && 
              normalize(v.size) === normalize(newVar.size)
            );
            if (exists) {
              stats.variantsSkipped++;
            } else {
              uniqueVariants.push(newVar);
              stats.variantsAdded++;
            }
          }

          await productsRef.add({
            sku: "Auto Generate",
            name: `${group.brand} ${group.product}`.trim(),
            brand: group.brand,
            product: group.product,
            category: "Grocery", 
            segment: "Grocery", // Correct segment for the UI
            is_active: true, // Ensured it will show in UI
            is_featured: false,
            description: "Imported Grocery Product",
            image_url: "",
            variants: uniqueVariants,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
          stats.productsCreated++;
        }
      } catch (e) {
         console.error(e);
         stats.failed++;
      }
    }

    console.log(`
Products Created:
${stats.productsCreated}

Products Updated:
${stats.productsUpdated}

Variants Added:
${stats.variantsAdded}

Variants Skipped:
${stats.variantsSkipped}

Failed:
${stats.failed}
    `);

  } catch (error) {
    console.error("Script error:", error);
    process.exit(1);
  }
}

runOptimized().then(() => process.exit(0));
