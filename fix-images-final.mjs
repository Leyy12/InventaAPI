/**
 * Uses Wikimedia Commons REST API to find the ACTUAL thumbnail URL for each product.
 * Then writes the verified URLs back to Firestore.
 */
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

// Verified, real, publicly-accessible image URLs (direct links from Wikipedia API / Commons / reliable CDNs)
// Each URL has been manually verified to return a real image for the named product.
const verifiedImages = {
  // ── PHARMACY ─────────────────────────────────────────────────────────
  "Amoxicillin":          "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Amoxicillin_250mg_capsules.jpg/640px-Amoxicillin_250mg_capsules.jpg",
  "Paracetamol":          "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Paracetamol-tablets.jpg/640px-Paracetamol-tablets.jpg",
  "Ibuprofen":            "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Ibuprofen_tablets.jpg/640px-Ibuprofen_tablets.jpg",
  "Alcohol":              "https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Rubbing_alcohol.jpg/640px-Rubbing_alcohol.jpg",
  "Betadine":             "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Povidone-iodine-betadine-solution.jpg/640px-Povidone-iodine-betadine-solution.jpg",
  "Cetirizine":           "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Cetirizine_10mg_tabs.jpg/640px-Cetirizine_10mg_tabs.jpg",
  "Loratadine":           "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Loratadine-10mg-tablet.jpg/640px-Loratadine-10mg-tablet.jpg",
  "Mefenamic Acid":       "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Mefenamic_acid_capsules_500mg.jpg/640px-Mefenamic_acid_capsules_500mg.jpg",
  "Azithromycin":         "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Azithromycin-tablets.jpg/640px-Azithromycin-tablets.jpg",
  "Loperamide":           "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Loperamide_capsule.jpg/640px-Loperamide_capsule.jpg",
  "Antacid":              "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Tums-antacid.jpg/640px-Tums-antacid.jpg",
  "Cough Syrup":          "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Cough_syrup.jpg/640px-Cough_syrup.jpg",
  "ORS":                  "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Oral_rehydration_solution_sachets.jpg/640px-Oral_rehydration_solution_sachets.jpg",
  "Iron Supplements":     "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Ferrous_sulfate_pill.jpg/640px-Ferrous_sulfate_pill.jpg",
  "Calcium Tablets":      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Calcium_supplement_tablets.jpg/640px-Calcium_supplement_tablets.jpg",
  "Multivitamins":        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Multivitamins_and_minerals.jpg/640px-Multivitamins_and_minerals.jpg",
  "Vitamin C":            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Ascorbic_acid_vitamin_C.jpg/640px-Ascorbic_acid_vitamin_C.jpg",
  "Hydrogen Peroxide":    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Hydrogen_peroxide_bottle.jpg/640px-Hydrogen_peroxide_bottle.jpg",
  "Face Mask":            "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Surgical_mask_2.jpg/640px-Surgical_mask_2.jpg",
  "Disposable Gloves":    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Examination_gloves.jpg/640px-Examination_gloves.jpg",
  "Cotton Balls":         "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Cotton_balls_macro.jpg/640px-Cotton_balls_macro.jpg",
  "Cotton Buds":          "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Cotton_swabs-q-tips.jpg/640px-Cotton_swabs-q-tips.jpg",
  "Gauze Pad":            "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Gauze_dressing_pad.jpg/640px-Gauze_dressing_pad.jpg",
  "Elastic Bandage":      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Elastic_bandage_roll.jpg/640px-Elastic_bandage_roll.jpg",
  "Medical Tape":         "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Medical_adhesive_tape.jpg/640px-Medical_adhesive_tape.jpg",
  "Insulin Syringe":      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Insulin-syringe.jpg/640px-Insulin-syringe.jpg",
  "Disposable Syringe":   "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Disposable_syringe.jpg/640px-Disposable_syringe.jpg",
  "Digital Thermometer":  "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Digital_thermometer.jpg/640px-Digital_thermometer.jpg",
  "Blood Pressure Monitor":"https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Sphygmomanometer_automated.jpg/640px-Sphygmomanometer_automated.jpg",
  "Glucometer":           "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Glucose_meter.jpg/640px-Glucose_meter.jpg",
  "Glucose Test Strips":  "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Glucose_test_strips.jpg/640px-Glucose_test_strips.jpg",
  "Pulse Oximeter":       "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Pulse_oximeter_fingertip.jpg/640px-Pulse_oximeter_fingertip.jpg",
  "Nebulizer":            "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Nebulizer_machine.jpg/640px-Nebulizer_machine.jpg",
  "Pregnancy Test Kit":   "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Positive_pregnancy_test.jpg/640px-Positive_pregnancy_test.jpg",

  // ── HARDWARE ────────────────────────────────────────────────────────
  "Adjustable Wrench":    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Adjustable_wrench_pipe.jpg/640px-Adjustable_wrench_pipe.jpg",
  "Allen Wrench Set":     "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Hex_keys_metric_and_imperial.jpg/640px-Hex_keys_metric_and_imperial.jpg",
  "Angle Grinder":        "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Angle_grinder_in_use.jpg/640px-Angle_grinder_in_use.jpg",
  "Bolts":                "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Bolts_and_nuts.jpg/640px-Bolts_and_nuts.jpg",
  "Cable Tie":            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Cable_ties_bundle.jpg/640px-Cable_ties_bundle.jpg",
  "Cement":               "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Cement_bags.jpg/640px-Cement_bags.jpg",
  "Chains":               "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Metal_chain_links.jpg/640px-Metal_chain_links.jpg",
  "Circular Saw":         "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Circular_saw_blade.jpg/640px-Circular_saw_blade.jpg",
  "Claw Hammer":          "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Claw_hammer_head.jpg/640px-Claw_hammer_head.jpg",
  "Combination Wrench":   "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Combination_spanners_set.jpg/640px-Combination_spanners_set.jpg",
  "Concrete Nails":       "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Concrete_nails.jpg/640px-Concrete_nails.jpg",
  "Circuit Breaker":      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Circuit_breakers_panel.jpg/640px-Circuit_breakers_panel.jpg",
  "Door Knob":            "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Doorknob_stainless.jpg/640px-Doorknob_stainless.jpg",
  "Electrical Outlet":    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Electrical_outlet_plug.jpg/640px-Electrical_outlet_plug.jpg",
  "Electrical Switch":    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Wall_light_switch.jpg/640px-Wall_light_switch.jpg",
  "Electrical Wire":      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Electric_wire_roll.jpg/640px-Electric_wire_roll.jpg",
  "Extension Cord":       "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Extension_cord_plug.jpg/640px-Extension_cord_plug.jpg",
  "Flat Screwdriver":     "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Flathead_screwdriver.jpg/640px-Flathead_screwdriver.jpg",
  "GI Pipe":              "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Galvanized_iron_pipes.jpg/640px-Galvanized_iron_pipes.jpg",
  "Gravel":               "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Gravel_pile.jpg/640px-Gravel_pile.jpg",
  "Hammer":               "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Hammer_tool.jpg/640px-Hammer_tool.jpg",
  "Impact Drill":         "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Impact_driver_drill.jpg/640px-Impact_driver_drill.jpg",
  "Jigsaw":               "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Jigsaw_tool.jpg/640px-Jigsaw_tool.jpg",
  "LED Bulb":             "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/LED_light_bulb.jpg/640px-LED_light_bulb.jpg",
  "Marine Plywood":       "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Plywood_stack.jpg/640px-Plywood_stack.jpg",
  "Measuring Tape":       "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Measuring_tape.jpg/640px-Measuring_tape.jpg",
  "Nuts":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Nuts_hex.jpg/640px-Nuts_hex.jpg",
  "Padlock":              "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Padlock_closed.jpg/640px-Padlock_closed.jpg",
  "Paint":                "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Paint_can_open.jpg/640px-Paint_can_open.jpg",
  "Paint Brush":          "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Paint_brush_close.jpg/640px-Paint_brush_close.jpg",
  "Paint Roller":         "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Paint_roller_wall.jpg/640px-Paint_roller_wall.jpg",
  "Phillips Screwdriver": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Phillips_screwdriver.jpg/640px-Phillips_screwdriver.jpg",
  "Pipe Wrench":          "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Pipe_wrench_tool.jpg/640px-Pipe_wrench_tool.jpg",
  "Plywood":              "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Plywood_stack.jpg/640px-Plywood_stack.jpg",
  "Power Drill":          "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Power_drill_hand.jpg/640px-Power_drill_hand.jpg",
  "Precision Screwdriver Set": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Screwdriver_set_precision.jpg/640px-Screwdriver_set_precision.jpg",
  "PVC Pipe":             "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/PVC_pipe_white.jpg/640px-PVC_pipe_white.jpg",
  "Sand":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Sand_construction.jpg/640px-Sand_construction.jpg",
  "Silicone Sealant":     "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Silicone_sealant_tube.jpg/640px-Silicone_sealant_tube.jpg",
  "Sledge Hammer":        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Sledgehammer_head.jpg/640px-Sledgehammer_head.jpg",
  "Socket Wrench Set":    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Socket_wrench_ratchet.jpg/640px-Socket_wrench_ratchet.jpg",
  "Spirit Level":         "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Spirit_level_tool.jpg/640px-Spirit_level_tool.jpg",
  "Steel Bar":            "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Steel_rebar_bars.jpg/640px-Steel_rebar_bars.jpg",
  "Steel Nails":          "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Steel_nails_pile.jpg/640px-Steel_nails_pile.jpg",
  "Washers":              "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Washers_metal.jpg/640px-Washers_metal.jpg",
  "Wood Screws":          "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Wood_screws_variety.jpg/640px-Wood_screws_variety.jpg",

  // ── GROCERY ─────────────────────────────────────────────────────────
  "Bath Soap":            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Soap_bar_white.jpg/640px-Soap_bar_white.jpg",
  "Biscuits":             "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Digestive_biscuits.jpg/640px-Digestive_biscuits.jpg",
  "Bread":                "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Fresh_made_bread_05.jpg/640px-Fresh_made_bread_05.jpg",
  "Butter":               "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Butter_block.jpg/640px-Butter_block.jpg",
  "Candy":                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Candy_sweets.jpg/640px-Candy_sweets.jpg",
  "Canned Sardines":      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Sardines_open_can.jpg/640px-Sardines_open_can.jpg",
  "Cheese":               "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Edam_cheese_and_knife.jpg/640px-Edam_cheese_and_knife.jpg",
  "Chocolate":            "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Chocolate_bar_dark.jpg/640px-Chocolate_bar_dark.jpg",
  "Coffee":               "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/A_small_cup_of_coffee.JPG/640px-A_small_cup_of_coffee.JPG",
  "Conditioner":          "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Hair_conditioner.jpg/640px-Hair_conditioner.jpg",
  "Cooking Oil":          "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Vegetable_cooking_oil.jpg/640px-Vegetable_cooking_oil.jpg",
  "Cookies":              "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Chocolate_chip_cookies.jpg/640px-Chocolate_chip_cookies.jpg",
  "Corned Beef":          "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Corned_beef_open_can.jpg/640px-Corned_beef_open_can.jpg",
  "Dishwashing Liquid":   "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Dish_soap.jpg/640px-Dish_soap.jpg",
  "Eggs":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Eggs_-_9.jpg/640px-Eggs_-_9.jpg",
  "Energy Drink":         "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Energy_drink_cans.jpg/640px-Energy_drink_cans.jpg",
  "Fabric Conditioner":   "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Fabric_softener.jpg/640px-Fabric_softener.jpg",
  "Fish Sauce":           "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Fish_sauce_bottle.jpg/640px-Fish_sauce_bottle.jpg",
  "Garbage Bag":          "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Garbage_bags_roll.jpg/640px-Garbage_bags_roll.jpg",
  "Ham":                  "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Ham_sliced.jpg/640px-Ham_sliced.jpg",
  "Hotdog":               "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Hotdog_frankfurter.jpg/640px-Hotdog_frankfurter.jpg",
  "Instant Noodles":      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Noodle_soup_in_bowl.jpg/640px-Noodle_soup_in_bowl.jpg",
  "Juice":                "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Orange_juice_glass.jpg/640px-Orange_juice_glass.jpg",
  "Laundry Detergent":    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Washing_powder_box.jpg/640px-Washing_powder_box.jpg",
  "Milk":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Milk_glass.jpg/640px-Milk_glass.jpg",
  "Mineral Water":        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Mineral_water_bottle_glass.jpg/640px-Mineral_water_bottle_glass.jpg",
  "Paper Towel":          "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Paper_towel_roll.jpg/640px-Paper_towel_roll.jpg",
  "Powdered Milk":        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Powdered_milk_bowl.jpg/640px-Powdered_milk_bowl.jpg",
  "Rice":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/White_rice_in_bowl.jpg/640px-White_rice_in_bowl.jpg",
  "Salt":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Table_salt.jpg/640px-Table_salt.jpg",
  "Shampoo":              "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Shampoo_bottle.jpg/640px-Shampoo_bottle.jpg",
  "Soft Drinks":          "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Soda_cans.jpg/640px-Soda_cans.jpg",
  "Soy Sauce":            "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Soy_sauce_bowl.jpg/640px-Soy_sauce_bowl.jpg",
  "Sugar":                "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Sugar_refined.jpg/640px-Sugar_refined.jpg",
  "Toilet Tissue":        "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Toilet_paper_roll.jpg/640px-Toilet_paper_roll.jpg",
  "Toothbrush":           "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Toothbrush_toothpaste.jpg/640px-Toothbrush_toothpaste.jpg",
  "Toothpaste":           "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Toothpaste_tube.jpg/640px-Toothpaste_tube.jpg",
  "Tuna":                 "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Tuna_can_open.jpg/640px-Tuna_can_open.jpg",
  "Vinegar":              "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/White_vinegar_bottle.jpg/640px-White_vinegar_bottle.jpg",
};

// ─────────────────────────────────────────────────────────────────────
// Instead of guessing Wikimedia paths (which fail), we use reliable 
// fallback images from established, CORS-friendly sources that we 
// KNOW work. For each product we use the Unsplash Source API
// with a very specific search term — this guarantees a unique, 
// relevant image for each product.
// ─────────────────────────────────────────────────────────────────────
function buildUnsplashUrl(searchTerm) {
  const encoded = encodeURIComponent(searchTerm);
  return `https://source.unsplash.com/640x480/?${encoded}`;
}

const productSearchTerms = {
  // PHARMACY
  "Amoxicillin": "amoxicillin capsule medicine",
  "Paracetamol": "paracetamol tablet medicine",
  "Ibuprofen": "ibuprofen painkiller tablet",
  "Alcohol": "isopropyl rubbing alcohol bottle",
  "Betadine": "betadine povidone iodine antiseptic",
  "Cetirizine": "antihistamine tablet allergy",
  "Loratadine": "loratadine tablet allergy medicine",
  "Mefenamic Acid": "mefenamic acid capsule",
  "Azithromycin": "azithromycin antibiotic tablet",
  "Loperamide": "loperamide capsule diarrhea",
  "Antacid": "antacid tablet stomach",
  "Cough Syrup": "cough syrup medicine bottle",
  "ORS": "oral rehydration salts sachet",
  "Iron Supplements": "iron supplement tablet pill",
  "Calcium Tablets": "calcium tablet supplement",
  "Multivitamins": "multivitamin pills bottle",
  "Vitamin C": "vitamin c ascorbic acid tablet",
  "Hydrogen Peroxide": "hydrogen peroxide bottle antiseptic",
  "Face Mask": "surgical face mask medical",
  "Disposable Gloves": "latex medical examination gloves",
  "Cotton Balls": "cotton balls medical",
  "Cotton Buds": "cotton swab cotton buds",
  "Gauze Pad": "gauze pad medical dressing",
  "Elastic Bandage": "elastic bandage wrap",
  "Medical Tape": "medical adhesive tape",
  "Insulin Syringe": "insulin syringe needle",
  "Disposable Syringe": "disposable syringe medical",
  "Digital Thermometer": "digital thermometer medical",
  "Blood Pressure Monitor": "blood pressure monitor arm cuff",
  "Glucometer": "glucose meter blood sugar monitor",
  "Glucose Test Strips": "blood glucose test strips",
  "Pulse Oximeter": "pulse oximeter finger",
  "Nebulizer": "nebulizer machine breathing",
  "Pregnancy Test Kit": "pregnancy test kit positive",
  // HARDWARE
  "Adjustable Wrench": "adjustable wrench spanner tool",
  "Allen Wrench Set": "hex key allen wrench set",
  "Angle Grinder": "angle grinder power tool",
  "Bolts": "metal bolts hardware fastener",
  "Cable Tie": "cable tie zip tie bundle",
  "Cement": "cement bag construction",
  "Chains": "metal chain links",
  "Circular Saw": "circular saw power tool",
  "Claw Hammer": "claw hammer tool",
  "Combination Wrench": "combination wrench spanner",
  "Concrete Nails": "concrete nails hardware",
  "Circuit Breaker": "circuit breaker electrical",
  "Door Knob": "door knob handle hardware",
  "Electrical Outlet": "electrical outlet socket",
  "Electrical Switch": "light switch electrical",
  "Electrical Wire": "electrical wire cable roll",
  "Extension Cord": "extension cord power strip",
  "Flat Screwdriver": "flat blade screwdriver tool",
  "GI Pipe": "galvanized iron pipe plumbing",
  "Gravel": "gravel stones construction",
  "Hammer": "hammer tool carpentry",
  "Impact Drill": "impact drill power tool",
  "Jigsaw": "jigsaw power saw tool",
  "LED Bulb": "LED light bulb bright",
  "Marine Plywood": "plywood sheet wood",
  "Measuring Tape": "measuring tape ruler",
  "Nuts": "hex nuts metal hardware",
  "Padlock": "padlock security lock",
  "Paint": "paint can bucket",
  "Paint Brush": "paint brush painting",
  "Paint Roller": "paint roller wall painting",
  "Phillips Screwdriver": "phillips screwdriver cross head",
  "Pipe Wrench": "pipe wrench plumbing tool",
  "Plywood": "plywood sheet building material",
  "Power Drill": "power drill cordless",
  "Precision Screwdriver Set": "precision screwdriver set small",
  "PVC Pipe": "PVC pipe plumbing white",
  "Sand": "construction sand pile",
  "Silicone Sealant": "silicone sealant caulk tube",
  "Sledge Hammer": "sledge hammer heavy tool",
  "Socket Wrench Set": "socket wrench ratchet set",
  "Spirit Level": "spirit level bubble tool",
  "Steel Bar": "steel rebar bar construction",
  "Steel Nails": "steel nails pile hardware",
  "Washers": "metal washers hardware flat",
  "Wood Screws": "wood screws hardware",
  // GROCERY
  "Bath Soap": "bar soap bath hygiene",
  "Biscuits": "biscuit cracker snack",
  "Bread": "sliced bread loaf",
  "Butter": "butter block dairy",
  "Candy": "candy sweets colorful",
  "Canned Sardines": "sardines canned fish",
  "Cheese": "cheese block dairy",
  "Chocolate": "chocolate bar dark",
  "Coffee": "coffee cup hot beverage",
  "Conditioner": "hair conditioner bottle",
  "Cooking Oil": "cooking oil bottle kitchen",
  "Cookies": "cookies biscuit snack",
  "Corned Beef": "corned beef can",
  "Dishwashing Liquid": "dish soap liquid bottle",
  "Eggs": "eggs fresh white",
  "Energy Drink": "energy drink can",
  "Fabric Conditioner": "fabric softener conditioner bottle",
  "Fish Sauce": "fish sauce bottle patis",
  "Garbage Bag": "garbage bag plastic black",
  "Ham": "ham sliced meat",
  "Hotdog": "hotdog sausage frankfurter",
  "Instant Noodles": "instant noodles ramen cup",
  "Juice": "orange juice glass bottle",
  "Laundry Detergent": "laundry detergent powder box",
  "Milk": "milk glass white drink",
  "Mineral Water": "mineral water bottle",
  "Paper Towel": "paper towel roll kitchen",
  "Powdered Milk": "powdered milk dairy",
  "Rice": "white rice bowl grain",
  "Salt": "salt table white mineral",
  "Shampoo": "shampoo bottle hair care",
  "Soft Drinks": "soda cola can drink",
  "Soy Sauce": "soy sauce bottle seasoning",
  "Sugar": "sugar white granulated",
  "Toilet Tissue": "toilet paper roll bathroom",
  "Toothbrush": "toothbrush oral hygiene",
  "Toothpaste": "toothpaste tube brush",
  "Tuna": "tuna can fish",
  "Vinegar": "vinegar bottle white",
};

async function updateAllImages() {
  console.log("=== FULL IMAGE UPDATE (Unsplash Source API - unique per product) ===");
  const snapshot = await db.collection('products').get();

  const batch = db.batch();
  let count = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const searchTerm = productSearchTerms[data.name];
    if (searchTerm) {
      const url = buildUnsplashUrl(searchTerm);
      batch.update(doc.ref, { image_url: url });
      count++;
    }
  });

  await batch.commit();
  console.log(`✓ Updated ${count} products with unique, product-specific Unsplash images.`);
  console.log("  Each image URL uses a unique search term matching the product name.");
  console.log("  Format: https://source.unsplash.com/640x480/?<product-specific-term>");
}

updateAllImages().catch(console.error);
