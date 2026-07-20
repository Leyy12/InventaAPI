-- =====================================================
-- ADD MORE PRODUCTS TO INVENTAAPI
-- Comprehensive product catalog for Philippine SMEs
-- =====================================================

-- =====================================================
-- PHARMACY PRODUCTS
-- =====================================================
INSERT INTO products (sku, name, description, category, segment, price, stock, metadata, tags) VALUES

-- Pain Relief & Fever
('PHARM-006', 'Ibuprofen 400mg', 'Anti-inflammatory pain reliever', 'Pain Relief', 'Pharmacy', 8.50, 750,
    '{"dosage": "400mg", "prescription_required": false, "manufacturer": "Generic"}',
    ARRAY['pain relief', 'anti-inflammatory', 'ibuprofen', 'fever']),
('PHARM-007', 'Mefenamic Acid 500mg', 'Pain reliever for dysmenorrhea', 'Pain Relief', 'Pharmacy', 7.00, 600,
    '{"dosage": "500mg", "prescription_required": false, "manufacturer": "Generic"}',
    ARRAY['pain relief', 'menstrual', 'dysmenorrhea']),
('PHARM-008', 'Aspirin 80mg', 'Low-dose aspirin for heart health', 'Cardiovascular', 'Pharmacy', 3.50, 1000,
    '{"dosage": "80mg", "prescription_required": false, "manufacturer": "Generic"}',
    ARRAY['aspirin', 'heart', 'cardiovascular', 'blood thinner']),

-- Antibiotics
('PHARM-009', 'Ciprofloxacin 500mg', 'Antibiotic for bacterial infections', 'Antibiotics', 'Pharmacy', 15.00, 300,
    '{"dosage": "500mg", "prescription_required": true, "manufacturer": "MedCo"}',
    ARRAY['antibiotic', 'prescription', 'bacterial', 'infection']),
('PHARM-010', 'Azithromycin 500mg', 'Broad-spectrum antibiotic', 'Antibiotics', 'Pharmacy', 18.00, 250,
    '{"dosage": "500mg", "prescription_required": true, "manufacturer": "MedCo"}',
    ARRAY['antibiotic', 'azithromycin', 'z-pack', 'prescription']),

-- Vitamins & Supplements
('PHARM-011', 'Multivitamins + Minerals', 'Complete daily vitamin supplement', 'Vitamins', 'Pharmacy', 12.00, 800,
    '{"dosage": "1 capsule", "prescription_required": false, "manufacturer": "VitaHealth"}',
    ARRAY['multivitamin', 'supplement', 'health', 'minerals']),
('PHARM-012', 'Vitamin D3 1000IU', 'Bone health and immunity', 'Vitamins', 'Pharmacy', 10.00, 600,
    '{"dosage": "1000IU", "prescription_required": false, "manufacturer": "VitaHealth"}',
    ARRAY['vitamin d', 'bone health', 'immunity', 'supplement']),
('PHARM-013', 'Omega-3 Fish Oil', 'Heart and brain health supplement', 'Vitamins', 'Pharmacy', 25.00, 400,
    '{"dosage": "1000mg", "prescription_required": false, "manufacturer": "NutraPlus"}',
    ARRAY['omega 3', 'fish oil', 'heart health', 'brain health']),

-- Cold & Flu
('PHARM-014', 'Bioflu', 'Relief for flu symptoms', 'Cold & Flu', 'Pharmacy', 9.50, 900,
    '{"dosage": "1 tablet", "prescription_required": false, "manufacturer": "Unilab"}',
    ARRAY['flu', 'cold', 'bioflu', 'fever', 'cough']),
('PHARM-015', 'Solmux 500mg', 'Carbocisteine for cough with phlegm', 'Cold & Flu', 'Pharmacy', 11.00, 700,
    '{"dosage": "500mg", "prescription_required": false, "manufacturer": "Unilab"}',
    ARRAY['cough', 'phlegm', 'carbocisteine', 'solmux']),

-- Gastrointestinal
('PHARM-016', 'Kremil-S', 'Antacid for hyperacidity', 'Gastrointestinal', 'Pharmacy', 5.00, 1200,
    '{"dosage": "1 tablet", "prescription_required": false, "manufacturer": "Unilab"}',
    ARRAY['antacid', 'hyperacidity', 'stomach', 'kremil']),
('PHARM-017', 'Diatabs', 'Antidiarrheal medication', 'Gastrointestinal', 'Pharmacy', 6.50, 800,
    '{"dosage": "2 tablets", "prescription_required": false, "manufacturer": "Unilab"}',
    ARRAY['diarrhea', 'lbm', 'stomach', 'antidiarrheal']),
('PHARM-018', 'Loperamide 2mg', 'Treats diarrhea', 'Gastrointestinal', 'Pharmacy', 4.00, 600,
    '{"dosage": "2mg", "prescription_required": false, "manufacturer": "Generic"}',
    ARRAY['loperamide', 'diarrhea', 'antidiarrheal']),

-- First Aid
('PHARM-019', 'Betadine Solution 120ml', 'Antiseptic wound cleanser', 'First Aid', 'Pharmacy', 85.00, 400,
    '{"volume": "120ml", "prescription_required": false, "manufacturer": "Mundipharma"}',
    ARRAY['betadine', 'antiseptic', 'wound care', 'disinfectant']),
('PHARM-020', 'Alcohol 70% 500ml', 'Isopropyl alcohol disinfectant', 'First Aid', 'Pharmacy', 45.00, 800,
    '{"volume": "500ml", "prescription_required": false, "type": "Isopropyl"}',
    ARRAY['alcohol', 'disinfectant', 'sanitizer', '70%']),

-- =====================================================
-- HARDWARE PRODUCTS
-- =====================================================

-- Hand Tools
('HW-006', 'Pliers Set 3pcs', 'Long nose, slip joint, and cutting pliers', 'Hand Tools', 'Hardware', 380.00, 180,
    '{"pieces": 3, "material": "Chrome Vanadium", "warranty_months": 12}',
    ARRAY['pliers', 'tool set', 'hand tools', 'grip']),
('HW-007', 'Wrench Set 8pcs', 'Combination wrench set 8-19mm', 'Hand Tools', 'Hardware', 650.00, 120,
    '{"pieces": 8, "size_range": "8-19mm", "material": "Chrome Vanadium"}',
    ARRAY['wrench', 'tool set', 'mechanic', 'hand tools']),
('HW-008', 'Tape Measure 5m', 'Retractable measuring tape', 'Hand Tools', 'Hardware', 95.00, 300,
    '{"length": "5 meters", "material": "Steel", "auto_lock": true}',
    ARRAY['tape measure', 'measuring', 'construction', 'carpentry']),
('HW-009', 'Utility Knife', 'Retractable blade utility knife', 'Hand Tools', 'Hardware', 65.00, 400,
    '{"blade_width": "18mm", "material": "Steel", "retractable": true}',
    ARRAY['utility knife', 'cutter', 'blade', 'hand tool']),
('HW-010', 'Level Tool 24 inch', 'Spirit level for construction', 'Hand Tools', 'Hardware', 280.00, 150,
    '{"length": "24 inches", "vials": 3, "material": "Aluminum"}',
    ARRAY['level', 'spirit level', 'construction', 'carpentry']),

-- Power Tools
('HW-011', 'Cordless Drill 12V', 'Rechargeable cordless drill', 'Power Tools', 'Hardware', 2850.00, 80,
    '{"voltage": "12V", "battery_included": true, "warranty_months": 12}',
    ARRAY['drill', 'cordless', 'power tool', 'battery']),
('HW-012', 'Angle Grinder 4 inch', 'Electric angle grinder', 'Power Tools', 'Hardware', 1650.00, 90,
    '{"disc_size": "4 inches", "power": "750W", "warranty_months": 12}',
    ARRAY['grinder', 'angle grinder', 'power tool', 'electric']),

-- Building Materials
('HW-013', 'Cement Portland 40kg', 'Type I Portland cement', 'Building Materials', 'Hardware', 195.00, 200,
    '{"weight_kg": 40, "type": "Portland Type I", "coverage_sqm": 3}',
    ARRAY['cement', 'portland', 'building', 'construction']),
('HW-014', 'Sand Washed 40kg', 'Clean washed sand for construction', 'Building Materials', 'Hardware', 65.00, 300,
    '{"weight_kg": 40, "type": "Washed", "grain_size": "Fine to Medium"}',
    ARRAY['sand', 'washed sand', 'building', 'construction']),
('HW-015', 'Gravel 1/2 inch 40kg', 'Construction gravel', 'Building Materials', 'Hardware', 75.00, 250,
    '{"weight_kg": 40, "size": "1/2 inch", "type": "Crushed"}',
    ARRAY['gravel', 'aggregates', 'building', 'construction']),
('HW-016', 'Hollow Blocks 4 inch', 'Standard hollow concrete blocks', 'Building Materials', 'Hardware', 12.00, 1000,
    '{"size": "4 inches", "material": "Concrete", "weight_kg": 10}',
    ARRAY['hollow blocks', 'chb', 'concrete', 'building']),

-- Electrical Supplies
('HW-017', 'Extension Cord 5m', '3-outlet extension cord with safety breaker', 'Electrical', 'Hardware', 185.00, 200,
    '{"length": "5 meters", "outlets": 3, "safety_breaker": true}',
    ARRAY['extension cord', 'electrical', 'power', 'outlet']),
('HW-018', 'LED Bulb 9W', 'Energy-saving LED bulb', 'Electrical', 'Hardware', 55.00, 500,
    '{"wattage": "9W", "equivalent": "60W", "color_temp": "Daylight"}',
    ARRAY['led bulb', 'light bulb', 'energy saving', 'electrical']),
('HW-019', 'Light Switch 2-Gang', 'Flush type light switch', 'Electrical', 'Hardware', 28.00, 400,
    '{"type": "Flush", "gang": 2, "voltage": "250V"}',
    ARRAY['switch', 'light switch', 'electrical', '2-gang']),
('HW-020', 'Electrical Wire 2.0mm', 'THHN stranded wire per meter', 'Electrical', 'Hardware', 18.00, 1000,
    '{"size": "2.0mm", "type": "THHN", "stranded": true}',
    ARRAY['electrical wire', 'thhn', 'wiring', 'copper']),

-- Plumbing
('HW-021', 'PVC Pipe 1/2 inch 3m', 'Schedule 40 PVC pipe', 'Plumbing', 'Hardware', 125.00, 300,
    '{"diameter": "1/2 inch", "length": "3 meters", "schedule": 40}',
    ARRAY['pvc pipe', 'plumbing', 'pipe', 'water']),
('HW-022', 'Faucet Single Lever', 'Chrome-plated faucet', 'Plumbing', 'Hardware', 320.00, 150,
    '{"type": "Single Lever", "finish": "Chrome", "warranty_months": 6}',
    ARRAY['faucet', 'tap', 'plumbing', 'chrome']),
('HW-023', 'Plumbing Elbow 1/2 inch', 'PVC elbow 90 degrees', 'Plumbing', 'Hardware', 8.00, 800,
    '{"diameter": "1/2 inch", "angle": "90 degrees", "material": "PVC"}',
    ARRAY['elbow', 'pvc fitting', 'plumbing', 'connector']),

-- Paints & Coatings
('HW-024', 'White Latex Paint 4L', 'Interior flat latex paint', 'Paints', 'Hardware', 680.00, 100,
    '{"volume": "4 liters", "type": "Latex", "finish": "Flat", "coverage_sqm": 40}',
    ARRAY['paint', 'latex', 'white', 'interior']),
('HW-025', 'Paint Brush 3 inch', 'Professional paint brush', 'Paints', 'Hardware', 85.00, 200,
    '{"width": "3 inches", "bristle": "Synthetic", "handle": "Wooden"}',
    ARRAY['paint brush', 'brush', 'painting', 'decorator']),

-- =====================================================
-- GROCERY PRODUCTS
-- =====================================================

-- Rice & Grains
('GROC-006', 'Jasmine Rice 5kg', 'Premium jasmine rice', 'Grains & Rice', 'Grocery', 285.00, 400,
    '{"net_weight": "5kg", "origin": "Thailand", "type": "Jasmine", "shelf_life_months": 12}',
    ARRAY['rice', 'jasmine', 'grain', 'premium']),
('GROC-007', 'Brown Rice 2kg', 'Healthy brown rice', 'Grains & Rice', 'Grocery', 165.00, 250,
    '{"net_weight": "2kg", "origin": "Philippines", "type": "Brown", "shelf_life_months": 10}',
    ARRAY['rice', 'brown rice', 'healthy', 'grain']),

-- Cooking Oil
('GROC-008', 'Corn Oil 1L', 'Pure corn cooking oil', 'Cooking Essentials', 'Grocery', 95.00, 300,
    '{"volume": "1L", "type": "Corn Oil", "cholesterol_free": true}',
    ARRAY['cooking oil', 'corn oil', 'kitchen', 'oil']),
('GROC-009', 'Coconut Oil 500ml', 'Virgin coconut oil', 'Cooking Essentials', 'Grocery', 185.00, 200,
    '{"volume": "500ml", "type": "Virgin Coconut Oil", "organic": true}',
    ARRAY['coconut oil', 'vco', 'cooking', 'organic']),

-- Condiments & Sauces
('GROC-010', 'Vinegar 1L', 'White cane vinegar', 'Condiments', 'Grocery', 35.00, 500,
    '{"volume": "1L", "type": "Cane Vinegar", "acidity": "4%"}',
    ARRAY['vinegar', 'condiment', 'cooking', 'sour']),
('GROC-011', 'Fish Sauce 350ml', 'Patis fish sauce', 'Condiments', 'Grocery', 28.00, 600,
    '{"volume": "350ml", "type": "Fish Sauce", "protein_content": "8g"}',
    ARRAY['fish sauce', 'patis', 'condiment', 'seasoning']),
('GROC-012', 'Oyster Sauce 510g', 'Premium oyster sauce', 'Condiments', 'Grocery', 95.00, 350,
    '{"weight": "510g", "type": "Oyster Sauce", "brand": "Lee Kum Kee"}',
    ARRAY['oyster sauce', 'sauce', 'condiment', 'cooking']),
('GROC-013', 'Tomato Sauce 1kg', 'Filipino-style tomato sauce', 'Condiments', 'Grocery', 68.00, 400,
    '{"weight": "1kg", "type": "Tomato Sauce", "style": "Filipino"}',
    ARRAY['tomato sauce', 'sauce', 'condiment', 'cooking']),

-- Canned Goods
('GROC-014', 'Corned Beef 175g', 'Premium corned beef', 'Canned Goods', 'Grocery', 65.00, 500,
    '{"net_weight": "175g", "type": "Corned Beef", "expiry": "2025-12-31"}',
    ARRAY['corned beef', 'canned', 'meat', 'protein']),
('GROC-015', 'Tuna Flakes in Oil 180g', 'Tuna in vegetable oil', 'Canned Goods', 'Grocery', 38.00, 700,
    '{"net_weight": "180g", "type": "Tuna Flakes", "oil": "Vegetable"}',
    ARRAY['tuna', 'canned', 'seafood', 'protein']),
('GROC-016', 'Luncheon Meat 340g', 'Pork luncheon meat', 'Canned Goods', 'Grocery', 85.00, 400,
    '{"net_weight": "340g", "type": "Pork Luncheon Meat", "expiry": "2025-10-31"}',
    ARRAY['luncheon meat', 'spam', 'canned', 'pork']),

-- Noodles & Pasta
('GROC-017', 'Instant Noodles 55g', 'Beef flavor instant noodles', 'Noodles', 'Grocery', 12.00, 1000,
    '{"net_weight": "55g", "flavor": "Beef", "cooking_time": "3 minutes"}',
    ARRAY['instant noodles', 'noodles', 'quick meal', 'beef']),
('GROC-018', 'Spaghetti Pasta 900g', 'Durum wheat spaghetti', 'Noodles', 'Grocery', 75.00, 300,
    '{"net_weight": "900g", "type": "Spaghetti", "cooking_time": "10 minutes"}',
    ARRAY['spaghetti', 'pasta', 'noodles', 'italian']),
('GROC-019', 'Pancit Canton 227g', 'Instant stir-fry noodles', 'Noodles', 'Grocery', 28.00, 800,
    '{"net_weight": "227g", "flavor": "Original", "type": "Stir-fry"}',
    ARRAY['pancit canton', 'instant noodles', 'stir fry', 'noodles']),

-- Sugar & Sweeteners
('GROC-020', 'Brown Sugar 1kg', 'Natural brown sugar', 'Baking & Cooking', 'Grocery', 68.00, 400,
    '{"net_weight": "1kg", "type": "Brown Sugar", "origin": "Philippines"}',
    ARRAY['brown sugar', 'sugar', 'sweetener', 'baking']),

-- Flour & Baking
('GROC-021', 'All-Purpose Flour 1kg', 'Multipurpose wheat flour', 'Baking & Cooking', 'Grocery', 52.00, 500,
    '{"net_weight": "1kg", "type": "All-Purpose", "protein": "10-12%"}',
    ARRAY['flour', 'all purpose', 'baking', 'cooking']),
('GROC-022', 'Baking Powder 110g', 'Double-acting baking powder', 'Baking & Cooking', 'Grocery', 35.00, 300,
    '{"net_weight": "110g", "type": "Double Acting", "aluminum_free": true}',
    ARRAY['baking powder', 'leavening', 'baking', 'cooking']),

-- Snacks
('GROC-023', 'Potato Chips 100g', 'Crispy potato chips', 'Snacks', 'Grocery', 45.00, 600,
    '{"net_weight": "100g", "flavor": "Cheese", "expiry": "2025-09-30"}',
    ARRAY['chips', 'potato chips', 'snacks', 'cheese']),
('GROC-024', 'Biscuits 300g', 'Cream-filled biscuits', 'Snacks', 'Grocery', 58.00, 500,
    '{"net_weight": "300g", "type": "Cream Sandwich", "expiry": "2025-11-30"}',
    ARRAY['biscuits', 'cookies', 'snacks', 'cream']),

-- Beverages
('GROC-025', 'Instant Coffee 3-in-1', 'Coffee with creamer and sugar', 'Beverages', 'Grocery', 8.00, 2000,
    '{"net_weight": "20g", "type": "3-in-1", "servings": 1}',
    ARRAY['coffee', 'instant coffee', '3 in 1', 'beverage']),
('GROC-026', 'Powdered Juice Orange 500g', 'Orange-flavored powdered drink', 'Beverages', 'Grocery', 95.00, 300,
    '{"net_weight": "500g", "flavor": "Orange", "servings": 25}',
    ARRAY['powdered juice', 'juice', 'orange', 'beverage']),

-- Dairy
('GROC-027', 'Evaporated Milk 370ml', 'Full cream evaporated milk', 'Dairy', 'Grocery', 42.00, 700,
    '{"volume": "370ml", "type": "Evaporated", "fat_content": "Full Cream"}',
    ARRAY['evaporated milk', 'milk', 'dairy', 'cooking']),
('GROC-028', 'Condensed Milk 300ml', 'Sweetened condensed milk', 'Dairy', 'Grocery', 48.00, 650,
    '{"volume": "300ml", "type": "Condensed", "sweetened": true}',
    ARRAY['condensed milk', 'milk', 'sweetened', 'dairy']),

-- Cleaning Supplies
('GROC-029', 'Dishwashing Liquid 250ml', 'Antibacterial dish soap', 'Cleaning', 'Grocery', 32.00, 800,
    '{"volume": "250ml", "type": "Dishwashing", "antibacterial": true}',
    ARRAY['dishwashing', 'soap', 'cleaning', 'antibacterial']),
('GROC-030', 'Laundry Detergent 1kg', 'Powder laundry detergent', 'Cleaning', 'Grocery', 125.00, 400,
    '{"weight": "1kg", "type": "Powder", "scent": "Floral"}',
    ARRAY['detergent', 'laundry', 'cleaning', 'powder'])

ON CONFLICT (sku) DO NOTHING;

-- Display summary
DO $$ 
DECLARE
    total_count INTEGER;
    pharm_count INTEGER;
    hw_count INTEGER;
    groc_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM products;
    SELECT COUNT(*) INTO pharm_count FROM products WHERE segment = 'Pharmacy';
    SELECT COUNT(*) INTO hw_count FROM products WHERE segment = 'Hardware';
    SELECT COUNT(*) INTO groc_count FROM products WHERE segment = 'Grocery';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PRODUCTS ADDED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total Products: %', total_count;
    RAISE NOTICE 'Pharmacy Products: %', pharm_count;
    RAISE NOTICE 'Hardware Products: %', hw_count;
    RAISE NOTICE 'Grocery Products: %', groc_count;
    RAISE NOTICE '========================================';
END $$;
