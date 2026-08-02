import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

if (!getApps().length) {
  const serviceAccount = require(path.resolve(__dirname, '../service-account.json'));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

const batch2Products = [
  // ==========================================
  // PHARMACY (33 Items)
  // Source: Internal knowledge based on Southstar/Rose Pharmacy non-promotional standard retail
  // ==========================================
  { sku: "PHA-034", name: "Kremil-S Advance Tablet", category: "OTC Medicine", segment: "Pharmacy", price: 17, size: "1 Tablet", description: "Antacid + Famotidine for hyperacidity.", image_url: "" },
  { sku: "PHA-035", name: "Decolgen Forte Tablet", category: "OTC Medicine", segment: "Pharmacy", price: 7, size: "1 Tablet", description: "For relief of colds and nasal congestion.", image_url: "" },
  { sku: "PHA-036", name: "Tuseran Forte Capsule", category: "OTC Medicine", segment: "Pharmacy", price: 12, size: "1 Capsule", description: "Multisymptom cough and cold relief.", image_url: "" },
  { sku: "PHA-037", name: "Diatabs 2mg Capsule", category: "OTC Medicine", segment: "Pharmacy", price: 10, size: "1 Capsule", description: "Loperamide for diarrhea relief.", image_url: "" },
  { sku: "PHA-038", name: "Buscopan Venus Tablet", category: "OTC Medicine", segment: "Pharmacy", price: 28, size: "1 Tablet", description: "For relief of menstrual cramps.", image_url: "" },
  { sku: "PHA-039", name: "Ponstan 500mg Tablet", category: "OTC Medicine", segment: "Pharmacy", price: 42, size: "1 Tablet", description: "Mefenamic acid for pain relief.", image_url: "" },
  { sku: "PHA-040", name: "Advil 200mg Softgel Capsule", category: "OTC Medicine", segment: "Pharmacy", price: 11, size: "1 Capsule", description: "Ibuprofen for fast pain relief.", image_url: "" },
  { sku: "PHA-041", name: "Ascorbic Acid Poten-Cee 500mg Tablet", category: "Vitamins", segment: "Pharmacy", price: 7, size: "1 Tablet", description: "Vitamin C supplement.", image_url: "" },
  { sku: "PHA-042", name: "Enervon-C Tablet", category: "Vitamins", segment: "Pharmacy", price: 8, size: "1 Tablet", description: "Multivitamins + Vitamin C.", image_url: "" },
  { sku: "PHA-043", name: "Stresstabs Multivitamins + Iron Tablet", category: "Vitamins", segment: "Pharmacy", price: 25, size: "1 Tablet", description: "Multivitamins to replenish energy.", image_url: "" },
  { sku: "PHA-044", name: "Ceelin Plus Syrup 120ml", category: "Vitamins", segment: "Pharmacy", price: 205, size: "120ml", description: "Vitamin C + Zinc for kids.", image_url: "" },
  { sku: "PHA-045", name: "Erceflora Oral Suspension", category: "OTC Medicine", segment: "Pharmacy", price: 48, size: "1 Vial", description: "Probiotic for gut health.", image_url: "" },
  { sku: "PHA-046", name: "Rhea Isopropyl Alcohol 70% 500ml", category: "First Aid", segment: "Pharmacy", price: 89, size: "500ml", description: "Disinfectant and antiseptic.", image_url: "" },
  { sku: "PHA-047", name: "Betadine Povidone Iodine 10% 15ml", category: "First Aid", segment: "Pharmacy", price: 95, size: "15ml", description: "Antiseptic solution for wounds.", image_url: "" },
  { sku: "PHA-048", name: "Agua Oxinada (Hydrogen Peroxide) 120ml", category: "First Aid", segment: "Pharmacy", price: 30, size: "120ml", description: "Wound cleanser.", image_url: "" },
  { sku: "PHA-049", name: "Vicks VapoRub 10g", category: "OTC Medicine", segment: "Pharmacy", price: 38, size: "10g", description: "Topical cough and cold relief.", image_url: "" },
  { sku: "PHA-050", name: "Katinko Ointment 10g", category: "First Aid", segment: "Pharmacy", price: 45, size: "10g", description: "Pain reliever ointment.", image_url: "" },
  { sku: "PHA-051", name: "White Flower Embrocation 2.5ml", category: "First Aid", segment: "Pharmacy", price: 55, size: "2.5ml", description: "Relief for dizziness and headaches.", image_url: "" },
  { sku: "PHA-052", name: "Omega Pain Killer Liniment 60ml", category: "First Aid", segment: "Pharmacy", price: 78, size: "60ml", description: "For muscle and joint pains.", image_url: "" },
  { sku: "PHA-053", name: "Salpasaran 500mg Tablet", category: "OTC Medicine", segment: "Pharmacy", price: 15, size: "1 Tablet", description: "Paracetamol generic.", image_url: "" },
  { sku: "PHA-054", name: "Sinutab Extra Strength Tablet", category: "OTC Medicine", segment: "Pharmacy", price: 15, size: "1 Tablet", description: "For sinus pain and congestion.", image_url: "" },
  { sku: "PHA-055", name: "Clusivol Plus Tablet", category: "Vitamins", segment: "Pharmacy", price: 18, size: "1 Tablet", description: "Multivitamins with Zinc.", image_url: "" },
  { sku: "PHA-056", name: "Centrum Advance Tablet", category: "Vitamins", segment: "Pharmacy", price: 16, size: "1 Tablet", description: "Complete multivitamins from A to Zinc.", image_url: "" },
  { sku: "PHA-057", name: "Myra E 400 IU Capsule", category: "Vitamins", segment: "Pharmacy", price: 14, size: "1 Capsule", description: "Vitamin E supplement for skin.", image_url: "" },
  { sku: "PHA-058", name: "Conzace Softgel Capsule", category: "Vitamins", segment: "Pharmacy", price: 16, size: "1 Capsule", description: "Multivitamins (A, C, E, Zinc).", image_url: "" },
  { sku: "PHA-059", name: "Kamilosan M Throat Spray 15ml", category: "OTC Medicine", segment: "Pharmacy", price: 450, size: "15ml", description: "For sore throat relief.", image_url: "" },
  { sku: "PHA-060", name: "Difflam Forte Throat Spray 15ml", category: "OTC Medicine", segment: "Pharmacy", price: 520, size: "15ml", description: "Anti-inflammatory throat spray.", image_url: "" },
  { sku: "PHA-061", name: "Tempra Drops (Paracetamol) 15ml", category: "OTC Medicine", segment: "Pharmacy", price: 110, size: "15ml", description: "Fever relief for infants.", image_url: "" },
  { sku: "PHA-062", name: "Calmoseptine Ointment Sachet 3.5g", category: "First Aid", segment: "Pharmacy", price: 42, size: "3.5g", description: "For diaper rash and skin irritations.", image_url: "" },
  { sku: "PHA-063", name: "Pocari Sweat Ion Supply Drink 500ml", category: "Vitamins", segment: "Pharmacy", price: 45, size: "500ml", description: "Hydration drink for recovery.", image_url: "" },
  { sku: "PHA-064", name: "Oral Rehydration Salts (Glucolyte) Sachet", category: "OTC Medicine", segment: "Pharmacy", price: 25, size: "1 Sachet", description: "To replace lost fluids.", image_url: "" },
  { sku: "PHA-065", name: "Gynepro Feminine Wash 150ml", category: "Personal Care", segment: "Pharmacy", price: 165, size: "150ml", description: "Antiseptic feminine wash.", image_url: "" },
  { sku: "PHA-066", name: "Visine Eye Drops 8ml", category: "OTC Medicine", segment: "Pharmacy", price: 125, size: "8ml", description: "For red and irritated eyes.", image_url: "" },

  // ==========================================
  // GROCERY (34 Items)
  // Source: Internal knowledge based on Waltermart non-promotional standard retail
  // ==========================================
  { sku: "GRO-035", name: "Purefoods Corned Beef 150g", category: "Canned Goods", segment: "Grocery", price: 82, size: "150g", description: "Premium chunky corned beef.", image_url: "" },
  { sku: "GRO-036", name: "San Marino Corned Tuna 180g", category: "Canned Goods", segment: "Grocery", price: 42, size: "180g", description: "Corned tuna for sandwiches and rice.", image_url: "" },
  { sku: "GRO-037", name: "555 Sardines in Tomato Sauce 155g", category: "Canned Goods", segment: "Grocery", price: 21, size: "155g", description: "Classic sardines.", image_url: "" },
  { sku: "GRO-038", name: "Lucky Me! Pancit Canton Kalamansi 80g", category: "Noodles", segment: "Grocery", price: 15, size: "80g", description: "Instant pancit canton kalamansi flavor.", image_url: "" },
  { sku: "GRO-039", name: "Lucky Me! Beef Mami 55g", category: "Noodles", segment: "Grocery", price: 11, size: "55g", description: "Instant beef noodle soup.", image_url: "" },
  { sku: "GRO-040", name: "Nissin Cup Noodles Seafood 60g", category: "Noodles", segment: "Grocery", price: 25, size: "60g", description: "Seafood flavored cup noodles.", image_url: "" },
  { sku: "GRO-041", name: "Milo Chocolate Malt Powder 300g", category: "Beverages", segment: "Grocery", price: 95, size: "300g", description: "Energy powder drink.", image_url: "" },
  { sku: "GRO-042", name: "Bear Brand Fortified Powdered Milk 320g", category: "Beverages", segment: "Grocery", price: 112, size: "320g", description: "Powdered milk drink.", image_url: "" },
  { sku: "GRO-043", name: "Nido 3+ Growing Up Milk 1.2kg", category: "Beverages", segment: "Grocery", price: 650, size: "1.2kg", description: "Milk supplement for toddlers.", image_url: "" },
  { sku: "GRO-044", name: "Nescafe Classic Coffee 50g", category: "Beverages", segment: "Grocery", price: 58, size: "50g", description: "Instant coffee powder.", image_url: "" },
  { sku: "GRO-045", name: "Kopiko Brown Coffee Twin Pack (10s)", category: "Beverages", segment: "Grocery", price: 130, size: "10 sachets", description: "Brown coffee mix.", image_url: "" },
  { sku: "GRO-046", name: "Great Taste White Twin Pack (10s)", category: "Beverages", segment: "Grocery", price: 125, size: "10 sachets", description: "White coffee mix.", image_url: "" },
  { sku: "GRO-047", name: "Coca-Cola Original Taste 1.5L", category: "Beverages", segment: "Grocery", price: 75, size: "1.5L", description: "Cola soda drink.", image_url: "" },
  { sku: "GRO-048", name: "Sprite 1.5L", category: "Beverages", segment: "Grocery", price: 75, size: "1.5L", description: "Lemon-lime soda.", image_url: "" },
  { sku: "GRO-049", name: "C2 Apple Green Tea 500ml", category: "Beverages", segment: "Grocery", price: 30, size: "500ml", description: "Ready to drink green tea.", image_url: "" },
  { sku: "GRO-050", name: "Datu Puti Vinegar 1L", category: "Condiments", segment: "Grocery", price: 50, size: "1L", description: "White vinegar.", image_url: "" },
  { sku: "GRO-051", name: "Silver Swan Soy Sauce 1L", category: "Condiments", segment: "Grocery", price: 52, size: "1L", description: "Soy sauce.", image_url: "" },
  { sku: "GRO-052", name: "Mang Tomas All-Around Sarsa 330g", category: "Condiments", segment: "Grocery", price: 38, size: "330g", description: "Lechon sauce.", image_url: "" },
  { sku: "GRO-053", name: "UFC Banana Catsup 320g", category: "Condiments", segment: "Grocery", price: 35, size: "320g", description: "Banana ketchup.", image_url: "" },
  { sku: "GRO-054", name: "Knorr Pork Cubes (6s)", category: "Condiments", segment: "Grocery", price: 30, size: "6 pieces", description: "Pork bouillon cubes.", image_url: "" },
  { sku: "GRO-055", name: "Magic Sarap All-in-One Seasoning 8g (12s)", category: "Condiments", segment: "Grocery", price: 55, size: "12 sachets", description: "Seasoning granules.", image_url: "" },
  { sku: "GRO-056", name: "Gardenia Classic White Bread 600g", category: "Snacks", segment: "Grocery", price: 78, size: "600g", description: "Sliced white bread.", image_url: "" },
  { sku: "GRO-057", name: "Lady's Choice Real Mayonnaise 470ml", category: "Condiments", segment: "Grocery", price: 160, size: "470ml", description: "Real mayonnaise.", image_url: "" },
  { sku: "GRO-058", name: "Eden Cheese Original 165g", category: "Snacks", segment: "Grocery", price: 55, size: "165g", description: "Processed filled cheese block.", image_url: "" },
  { sku: "GRO-059", name: "Fita Crackers 30g (10s)", category: "Snacks", segment: "Grocery", price: 65, size: "10 sachets", description: "Classic crackers.", image_url: "" },
  { sku: "GRO-060", name: "SkyFlakes Crackers 25g (10s)", category: "Snacks", segment: "Grocery", price: 60, size: "10 sachets", description: "Saltine crackers.", image_url: "" },
  { sku: "GRO-061", name: "Piattos Cheese 85g", category: "Snacks", segment: "Grocery", price: 35, size: "85g", description: "Cheese flavored potato crisps.", image_url: "" },
  { sku: "GRO-062", name: "Chippy BBQ 110g", category: "Snacks", segment: "Grocery", price: 32, size: "110g", description: "BBQ flavored corn chips.", image_url: "" },
  { sku: "GRO-063", name: "Boy Bawang Garlic 100g", category: "Snacks", segment: "Grocery", price: 20, size: "100g", description: "Garlic flavored cornick.", image_url: "" },
  { sku: "GRO-064", name: "Joy Dishwashing Liquid Lemon 500ml", category: "Household", segment: "Grocery", price: 110, size: "500ml", description: "Dishwashing liquid.", image_url: "" },
  { sku: "GRO-065", name: "Surf Powder Detergent Cherry Blossom 1.1kg", category: "Household", segment: "Grocery", price: 125, size: "1.1kg", description: "Laundry detergent powder.", image_url: "" },
  { sku: "GRO-066", name: "Downy Mystique Fabric Conditioner 800ml", category: "Household", segment: "Grocery", price: 180, size: "800ml", description: "Premium fabric conditioner.", image_url: "" },
  { sku: "GRO-067", name: "Sanicare Bathroom Tissue 2-Ply (4 Rolls)", category: "Household", segment: "Grocery", price: 85, size: "4 Rolls", description: "Soft bathroom tissue.", image_url: "" },
  { sku: "GRO-068", name: "Safeguard Pure White Soap 130g", category: "Personal Care", segment: "Grocery", price: 45, size: "130g", description: "Antibacterial bar soap.", image_url: "" },

  // ==========================================
  // HARDWARE (33 Items)
  // Source: Internal knowledge based on LazMall Official Hardware / Wilcon standard retail
  // ==========================================
  { sku: "HDW-034", name: "Makita Angle Grinder 4\" 720W", category: "Power Tools", segment: "Hardware", price: 2950, size: "4 inch", description: "Professional angle grinder M0910M.", image_url: "" },
  { sku: "HDW-035", name: "Bosch GSB 550 Impact Drill", category: "Power Tools", segment: "Hardware", price: 2450, size: "550W", description: "13mm impact drill.", image_url: "" },
  { sku: "HDW-036", name: "Lotus Welding Machine Inverter 200A", category: "Power Tools", segment: "Hardware", price: 4200, size: "200A", description: "Portable inverter welding machine.", image_url: "" },
  { sku: "HDW-037", name: "Pioneer Epoxy All-Purpose 1/2 Pint", category: "Adhesives", segment: "Hardware", price: 220, size: "1/2 Pint", description: "Two-component structural adhesive.", image_url: "" },
  { sku: "HDW-038", name: "Bostik Vulcaseal 250ml", category: "Adhesives", segment: "Hardware", price: 165, size: "250ml", description: "Elastomeric roof sealant.", image_url: "" },
  { sku: "HDW-039", name: "Omni Extension Cord 3-Gang 3 Meters", category: "Electrical", segment: "Hardware", price: 350, size: "3m", description: "Heavy duty extension cord.", image_url: "" },
  { sku: "HDW-040", name: "Royu Outlet Universal 2-Gang", category: "Electrical", segment: "Hardware", price: 120, size: "1 unit", description: "Flush type wall outlet.", image_url: "" },
  { sku: "HDW-041", name: "Phelps Dodge THHN Wire #12 AWG (150m)", category: "Electrical", segment: "Hardware", price: 4800, size: "150m Box", description: "Building wire stranded.", image_url: "" },
  { sku: "HDW-042", name: "Firefly LED Bulb 9W Daylight", category: "Lighting", segment: "Hardware", price: 110, size: "9W", description: "Energy saving LED bulb.", image_url: "" },
  { sku: "HDW-043", name: "Philips LED Tube 16W Daylight", category: "Lighting", segment: "Hardware", price: 280, size: "16W", description: "T8 LED tube.", image_url: "" },
  { sku: "HDW-044", name: "Boysen Latex Colors Lampblack 1/4L", category: "Paints", segment: "Hardware", price: 75, size: "1/4 Liter", description: "Tinting color for latex paints.", image_url: "" },
  { sku: "HDW-045", name: "Boysen Clear Gloss Acrylic Emulsion 4L", category: "Paints", segment: "Hardware", price: 650, size: "1 Gallon", description: "Gloss finish for masonry.", image_url: "" },
  { sku: "HDW-046", name: "Neltex PVC Pipe Blue 1/2\" x 10ft", category: "Plumbing", segment: "Hardware", price: 95, size: "1/2 inch", description: "Potable water PVC pipe.", image_url: "" },
  { sku: "HDW-047", name: "Moldex PVC Elbow 1/2\"", category: "Plumbing", segment: "Hardware", price: 12, size: "1/2 inch", description: "PVC plain elbow fitting.", image_url: "" },
  { sku: "HDW-048", name: "Teflon Tape 1/2\" x 10m", category: "Plumbing", segment: "Hardware", price: 15, size: "10m", description: "Thread seal tape.", image_url: "" },
  { sku: "HDW-049", name: "Onduline Bitumen Corrugated Roofing Sheet", category: "Building Materials", segment: "Hardware", price: 580, size: "2000x950mm", description: "Eco-friendly roofing sheet.", image_url: "" },
  { sku: "HDW-050", name: "Portland Cement (Republic) 40kg", category: "Building Materials", segment: "Hardware", price: 245, size: "40kg Sack", description: "Type 1 Portland Cement.", image_url: "" },
  { sku: "HDW-051", name: "Sahara Cement Waterproofing Compound 908g", category: "Building Materials", segment: "Hardware", price: 45, size: "908g", description: "Integral waterproofing for cement.", image_url: "" },
  { sku: "HDW-052", name: "Tricel Fiber Cement Board 4.5mm", category: "Building Materials", segment: "Hardware", price: 420, size: "4ft x 8ft", description: "Ceiling and partition board.", image_url: "" },
  { sku: "HDW-053", name: "Yale Brass Padlock 40mm", category: "Security", segment: "Hardware", price: 380, size: "40mm", description: "Solid brass padlock.", image_url: "" },
  { sku: "HDW-054", name: "Stanley Measuring Tape 5m/16ft", category: "Hand Tools", segment: "Hardware", price: 220, size: "5m", description: "Global tape rule.", image_url: "" },
  { sku: "HDW-055", name: "Crescent Adjustable Wrench 10\"", category: "Hand Tools", segment: "Hardware", price: 650, size: "10 inch", description: "Chrome finish adjustable wrench.", image_url: "" },
  { sku: "HDW-056", name: "Irwin Vise-Grip Locking Pliers 10\"", category: "Hand Tools", segment: "Hardware", price: 850, size: "10 inch", description: "Curved jaw locking pliers.", image_url: "" },
  { sku: "HDW-057", name: "Topex Claw Hammer 16oz with Wood Handle", category: "Hand Tools", segment: "Hardware", price: 180, size: "16oz", description: "General purpose claw hammer.", image_url: "" },
  { sku: "HDW-058", name: "Lotus Screwdriver Set 6pcs", category: "Hand Tools", segment: "Hardware", price: 350, size: "6 pieces", description: "Magnetic tip screwdriver set.", image_url: "" },
  { sku: "HDW-059", name: "WD-40 Multi-Use Product 382ml", category: "Hardware", segment: "Hardware", price: 320, size: "382ml", description: "Lubricant and rust remover.", image_url: "" },
  { sku: "HDW-060", name: "3M Scotch Super 33+ Electrical Tape", category: "Electrical", segment: "Hardware", price: 150, size: "19mm x 20m", description: "Premium vinyl electrical tape.", image_url: "" },
  { sku: "HDW-061", name: "Duct Tape Heavy Duty Silver 2\"", category: "Hardware", segment: "Hardware", price: 185, size: "2 inch", description: "Multi-purpose cloth duct tape.", image_url: "" },
  { sku: "HDW-062", name: "Sandpaper Waterproof #120", category: "Hardware", segment: "Hardware", price: 15, size: "1 sheet", description: "Abrasive paper for wet/dry sanding.", image_url: "" },
  { sku: "HDW-063", name: "CW Nails (Common Wire) #2", category: "Hardware", segment: "Hardware", price: 65, size: "1 kg", description: "Common wire nails 2 inches.", image_url: "" },
  { sku: "HDW-064", name: "Concrete Nails #3", category: "Hardware", segment: "Hardware", price: 85, size: "1 kg", description: "Hardened concrete nails 3 inches.", image_url: "" },
  { sku: "HDW-065", name: "Tie Wire #16", category: "Hardware", segment: "Hardware", price: 70, size: "1 kg", description: "Galvanized iron tie wire.", image_url: "" },
  { sku: "HDW-066", name: "SikaTop Seal 107 (Part A+B)", category: "Building Materials", segment: "Hardware", price: 1100, size: "25kg set", description: "Cementitious waterproofing slurry.", image_url: "" }
];

async function seedBatch2() {
  try {
    console.log(`[Batch 2] Initiating seed of ${batch2Products.length} real products...`);
    
    // 1. Fetch all existing products for duplicate check
    console.log("[Batch 2] Fetching existing products to prevent duplicates...");
    const productsRef = db.collection('products');
    const existingSnapshot = await productsRef.get();
    
    const existingNames = new Set(existingSnapshot.docs.map(doc => doc.data().name.toLowerCase()));
    console.log(`[Batch 2] Found ${existingNames.size} existing products in DB.`);

    let inserted = 0;
    let skipped = 0;

    // 2. Iterate and Insert
    for (const prod of batch2Products) {
      if (existingNames.has(prod.name.toLowerCase())) {
        console.log(`[Batch 2] SKIPPED (Duplicate): ${prod.name}`);
        skipped++;
        continue;
      }

      await productsRef.add({
        ...prod,
        is_active: true,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
      });
      
      console.log(`[Batch 2] INSERTED: ${prod.name}`);
      inserted++;
    }

    console.log('\n=========================================');
    console.log(`[Batch 2] SEEDING COMPLETE`);
    console.log(`[Batch 2] Total Processed: ${batch2Products.length}`);
    console.log(`[Batch 2] Successfully Inserted: ${inserted}`);
    console.log(`[Batch 2] Skipped (Duplicates): ${skipped}`);
    console.log('=========================================\n');
    
  } catch (error) {
    console.error('[Batch 2] Seeding error:', error);
  }
}

// Execute
seedBatch2().then(() => {
  console.log("Done. Exiting.");
  process.exit(0);
});
