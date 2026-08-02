import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

if (!getApps().length) {
  const serviceAccount = require(path.resolve(__dirname, 'service-account.json'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

// High-quality, specific, royalty-free Wikipedia/Wikimedia Commons images mapping
const accurateImages = {
  "Vitamin C": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Vitamin_C_pill.jpg/800px-Vitamin_C_pill.jpg",
  "Glucometer": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Blood_glucose_meter.jpg/800px-Blood_glucose_meter.jpg",
  "Elastic Bandage": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Ace_bandage.jpg/800px-Ace_bandage.jpg",
  "Gauze Pad": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Gauze_swab.jpg/800px-Gauze_swab.jpg",
  "Loratadine": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Loratadine_10mg_tablets.jpg/800px-Loratadine_10mg_tablets.jpg",
  "Nebulizer": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Nebulizer_with_mask.jpg/800px-Nebulizer_with_mask.jpg",
  "Pregnancy Test Kit": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Pregnancy_test_result.jpg/800px-Pregnancy_test_result.jpg",
  "Antacid": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Tums_antacid_tablets.jpg/800px-Tums_antacid_tablets.jpg",
  "Cotton Buds": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Cotton_swabs.jpg/800px-Cotton_swabs.jpg",
  "Glucose Test Strips": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Blood_glucose_test_strip.jpg/800px-Blood_glucose_test_strip.jpg",
  "Medical Tape": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Surgical_tape.jpg/800px-Surgical_tape.jpg",
  "Digital Thermometer": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Medical_thermometer.jpg/800px-Medical_thermometer.jpg",
  "Paracetamol": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Paracetamol_tablets_500mg.jpg/800px-Paracetamol_tablets_500mg.jpg",
  "Loperamide": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Loperamide_2mg_capsules.jpg/800px-Loperamide_2mg_capsules.jpg",
  "Alcohol": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Rubbing_alcohol_bottle.jpg/800px-Rubbing_alcohol_bottle.jpg",
  "ORS": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Oral_rehydration_salts.jpg/800px-Oral_rehydration_salts.jpg",
  "Disposable Gloves": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Medical_gloves.jpg/800px-Medical_gloves.jpg",
  "Cotton Balls": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Cotton_balls.jpg/800px-Cotton_balls.jpg",
  "Insulin Syringe": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Insulin_syringe.jpg/800px-Insulin_syringe.jpg",
  "Disposable Syringe": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Syringe_with_needle.jpg/800px-Syringe_with_needle.jpg",
  "Cough Syrup": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Cough_syrup_bottle.jpg/800px-Cough_syrup_bottle.jpg",
  "Amoxicillin": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Amoxicillin_capsules.jpg/800px-Amoxicillin_capsules.jpg",
  "Betadine": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Povidone-iodine_solution.jpg/800px-Povidone-iodine_solution.jpg",
  "Face Mask": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Surgical_face_mask.jpg/800px-Surgical_face_mask.jpg",
  "Iron Supplements": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Iron_pills.jpg/800px-Iron_pills.jpg",
  "Blood Pressure Monitor": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Sphygmomanometer.jpg/800px-Sphygmomanometer.jpg",
  "Calcium Tablets": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Calcium_supplements.jpg/800px-Calcium_supplements.jpg",
  "Pulse Oximeter": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Pulse_oximeter.jpg/800px-Pulse_oximeter.jpg",
  "Multivitamins": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Multivitamin_pills.jpg/800px-Multivitamin_pills.jpg",
  "Azithromycin": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Azithromycin_tablets.jpg/800px-Azithromycin_tablets.jpg",
  "Hydrogen Peroxide": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Hydrogen_peroxide_bottle.jpg/800px-Hydrogen_peroxide_bottle.jpg",
  "Mefenamic Acid": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Mefenamic_acid_capsules.jpg/800px-Mefenamic_acid_capsules.jpg",
  "Cetirizine": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Cetirizine_10mg_tablets.jpg/800px-Cetirizine_10mg_tablets.jpg",
  "Ibuprofen": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Ibuprofen-200mg.jpg/800px-Ibuprofen-200mg.jpg"
};

const genericPharmacyImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Pills_and_prescription.jpg/800px-Pills_and_prescription.jpg";

async function updatePharmacyImages() {
  console.log("=== PHARMACY IMAGE MIGRATION ===");
  const snapshot = await db.collection('products').where('segment', '==', 'Pharmacy').get();
  
  let updatedCount = 0;
  const batch = db.batch();
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const newImage = accurateImages[data.name] || genericPharmacyImage;
    
    // Only update if it's currently using the generic unsplash placeholder
    if (data.image_url.includes('unsplash.com')) {
      batch.update(doc.ref, { image_url: newImage });
      updatedCount++;
    }
  });
  
  if (updatedCount > 0) {
    await batch.commit();
    console.log(`✓ Committed batch update. ${updatedCount} products updated with accurate images.`);
  } else {
    console.log("No products needed updating.");
  }
}

updatePharmacyImages().catch(console.error);
