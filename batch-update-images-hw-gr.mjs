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

// ─────────── HARDWARE IMAGES ───────────
const hardwareImages = {
  "Adjustable Wrench":       "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Adjustable_wrench.jpg/800px-Adjustable_wrench.jpg",
  "Allen Wrench Set":        "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Hex_key_set.jpg/800px-Hex_key_set.jpg",
  "Angle Grinder":           "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Angle_grinder_2.jpg/800px-Angle_grinder_2.jpg",
  "Bolts":                   "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Bolts.jpg/800px-Bolts.jpg",
  "Cable Tie":               "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Cable_ties.jpg/800px-Cable_ties.jpg",
  "Cement":                  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Portland_Cement_Bags.jpg/800px-Portland_Cement_Bags.jpg",
  "Chains":                  "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Chain_links.jpg/800px-Chain_links.jpg",
  "Circular Saw":            "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Circular_saw.jpg/800px-Circular_saw.jpg",
  "Claw Hammer":             "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Claw_hammer.jpg/800px-Claw_hammer.jpg",
  "Combination Wrench":      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Open_end_wrenches.jpg/800px-Open_end_wrenches.jpg",
  "Concrete Nails":          "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Cut_nails.jpg/800px-Cut_nails.jpg",
  "Circuit Breaker":         "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Circuit_breaker.jpg/800px-Circuit_breaker.jpg",
  "Door Knob":               "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Doorknob_silver.jpg/800px-Doorknob_silver.jpg",
  "Electrical Outlet":       "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Electrical_outlet.jpg/800px-Electrical_outlet.jpg",
  "Electrical Switch":       "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Light_switch.jpg/800px-Light_switch.jpg",
  "Electrical Wire":         "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Electric_cable.jpg/800px-Electric_cable.jpg",
  "Extension Cord":          "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Extension_cord.jpg/800px-Extension_cord.jpg",
  "Flat Screwdriver":        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Flat_blade_screwdriver.jpg/800px-Flat_blade_screwdriver.jpg",
  "GI Pipe":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Galvanized_steel_pipes.jpg/800px-Galvanized_steel_pipes.jpg",
  "Gravel":                  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Gravel.jpg/800px-Gravel.jpg",
  "Hammer":                  "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Hammer_icon.jpg/800px-Hammer_icon.jpg",
  "Impact Drill":            "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Electric_drill.jpg/800px-Electric_drill.jpg",
  "Jigsaw":                  "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Jigsaw_saw.jpg/800px-Jigsaw_saw.jpg",
  "LED Bulb":                "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Led_bulb.jpg/800px-Led_bulb.jpg",
  "Marine Plywood":          "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Plywood_sheets.jpg/800px-Plywood_sheets.jpg",
  "Measuring Tape":          "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Tape_measure_colored.jpg/800px-Tape_measure_colored.jpg",
  "Nuts":                    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Hex_nut.jpg/800px-Hex_nut.jpg",
  "Padlock":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Padlock.jpg/800px-Padlock.jpg",
  "Paint":                   "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Paint_can.jpg/800px-Paint_can.jpg",
  "Paint Brush":             "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Paintbrush.jpg/800px-Paintbrush.jpg",
  "Paint Roller":            "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Paint_roller.jpg/800px-Paint_roller.jpg",
  "Phillips Screwdriver":    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/PH1_screwdriver_-_Hero_shot.jpg/800px-PH1_screwdriver_-_Hero_shot.jpg",
  "Pipe Wrench":             "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Pipe_wrench.jpg/800px-Pipe_wrench.jpg",
  "Plywood":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Plywood_sheets.jpg/800px-Plywood_sheets.jpg",
  "Power Drill":             "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Electric_drill.jpg/800px-Electric_drill.jpg",
  "Precision Screwdriver Set":"https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Precision_screwdrivers.jpg/800px-Precision_screwdrivers.jpg",
  "PVC Pipe":                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/PVC_pipe_fittings.jpg/800px-PVC_pipe_fittings.jpg",
  "Sand":                    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Pile_of_sand.jpg/800px-Pile_of_sand.jpg",
  "Silicone Sealant":        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Sealant_tube.jpg/800px-Sealant_tube.jpg",
  "Sledge Hammer":           "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Sledgehammer.jpg/800px-Sledgehammer.jpg",
  "Socket Wrench Set":       "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Socket_wrench_set.jpg/800px-Socket_wrench_set.jpg",
  "Spirit Level":            "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Spirit_level.jpg/800px-Spirit_level.jpg",
  "Steel Bar":               "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Steel_rebar.jpg/800px-Steel_rebar.jpg",
  "Steel Nails":             "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Nails_assortment.jpg/800px-Nails_assortment.jpg",
  "Washers":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Washers.jpg/800px-Washers.jpg",
  "Wood Screws":             "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Wood_screw.jpg/800px-Wood_screw.jpg",
};

// ─────────── GROCERY IMAGES ───────────
const groceryImages = {
  "Bath Soap":           "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Soap_bar_2_it.jpg/800px-Soap_bar_2_it.jpg",
  "Biscuits":            "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Biscuit_cookies.jpg/800px-Biscuit_cookies.jpg",
  "Bread":               "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Fresh_made_bread_05.jpg/800px-Fresh_made_bread_05.jpg",
  "Butter":              "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Salted_butter_block.jpg/800px-Salted_butter_block.jpg",
  "Candy":               "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Caramel_wrapped_candy.jpg/800px-Caramel_wrapped_candy.jpg",
  "Canned Sardines":     "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Sardines-can.jpg/800px-Sardines-can.jpg",
  "Cheese":              "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Cheese_platter.jpg/800px-Cheese_platter.jpg",
  "Chocolate":           "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Chocolate_bar.jpg/800px-Chocolate_bar.jpg",
  "Coffee":              "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/A_small_cup_of_coffee.JPG/800px-A_small_cup_of_coffee.JPG",
  "Conditioner":         "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Hair_conditioner_bottle.jpg/800px-Hair_conditioner_bottle.jpg",
  "Cooking Oil":         "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Coconut_oil_jar.jpg/800px-Coconut_oil_jar.jpg",
  "Cookies":             "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Chocolate_chip_cookies.jpg/800px-Chocolate_chip_cookies.jpg",
  "Corned Beef":         "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Corned_beef_can.jpg/800px-Corned_beef_can.jpg",
  "Dishwashing Liquid":  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Dish_soap_bottle.jpg/800px-Dish_soap_bottle.jpg",
  "Eggs":                "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Eggs_-_9.jpg/800px-Eggs_-_9.jpg",
  "Energy Drink":        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Red_bull_energy_drink.jpg/800px-Red_bull_energy_drink.jpg",
  "Fabric Conditioner":  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Fabric_softener_bottle.jpg/800px-Fabric_softener_bottle.jpg",
  "Fish Sauce":          "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Fish_sauce_bottle.jpg/800px-Fish_sauce_bottle.jpg",
  "Garbage Bag":         "https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Garbage_bags.jpg/800px-Garbage_bags.jpg",
  "Ham":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Meat_ham_leg.jpg/800px-Meat_ham_leg.jpg",
  "Hotdog":              "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Hotdog_with_mustard.jpg/800px-Hotdog_with_mustard.jpg",
  "Instant Noodles":     "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Instant_noodles_in_bowl.jpg/800px-Instant_noodles_in_bowl.jpg",
  "Juice":               "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Orange_juice_glass.jpg/800px-Orange_juice_glass.jpg",
  "Laundry Detergent":   "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Laundry_detergent_box.jpg/800px-Laundry_detergent_box.jpg",
  "Milk":                "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Milk_glass.jpg/800px-Milk_glass.jpg",
  "Mineral Water":       "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Mineral_water_bottle.jpg/800px-Mineral_water_bottle.jpg",
  "Paper Towel":         "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Paper_towel_roll.jpg/800px-Paper_towel_roll.jpg",
  "Powdered Milk":       "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Powdered_milk.jpg/800px-Powdered_milk.jpg",
  "Rice":                "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/White_rice_bowl.jpg/800px-White_rice_bowl.jpg",
  "Salt":                "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Salt_shaker_on_white_background.jpg/800px-Salt_shaker_on_white_background.jpg",
  "Shampoo":             "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Shampoo_bottle.jpg/800px-Shampoo_bottle.jpg",
  "Soft Drinks":         "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Coca-Cola_can_and_glass.jpg/800px-Coca-Cola_can_and_glass.jpg",
  "Soy Sauce":           "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Soy_sauce.jpg/800px-Soy_sauce.jpg",
  "Sugar":               "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/White_sugar_in_a_bowl.jpg/800px-White_sugar_in_a_bowl.jpg",
  "Toilet Tissue":       "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Toilet_paper_roll.jpg/800px-Toilet_paper_roll.jpg",
  "Toothbrush":          "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Toothbrush.jpg/800px-Toothbrush.jpg",
  "Toothpaste":          "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Toothpaste_on_brush.jpg/800px-Toothpaste_on_brush.jpg",
  "Tuna":                "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Tuna_can.jpg/800px-Tuna_can.jpg",
  "Vinegar":             "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/White_vinegar.jpg/800px-White_vinegar.jpg",
};

const genericHardwareImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Tools_for_repair.jpg/800px-Tools_for_repair.jpg";
const genericGroceryImage  = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Grocery_cart.jpg/800px-Grocery_cart.jpg";

async function updateBatch(segment, imageMap, genericFallback) {
  console.log(`\n=== ${segment.toUpperCase()} IMAGE MIGRATION ===`);
  const snapshot = await db.collection('products').where('segment', '==', segment).get();

  let updatedCount = 0;
  const batch = db.batch();

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const newImage = imageMap[data.name] || genericFallback;
    if (data.image_url && data.image_url.includes('unsplash.com')) {
      batch.update(doc.ref, { image_url: newImage });
      updatedCount++;
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`✓ Committed: ${updatedCount} ${segment} products updated.`);
  } else {
    console.log(`No ${segment} products needed updating (already migrated or no Unsplash URLs).`);
  }
}

(async () => {
  await updateBatch('Hardware', hardwareImages, genericHardwareImage);
  await updateBatch('Grocery',  groceryImages,  genericGroceryImage);
  console.log('\n✅ All batches complete.');
})().catch(console.error);
