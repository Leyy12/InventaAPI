-- =====================================================
-- DEMO DATA SEEDING SCRIPT
-- Quick setup for testing the API Playground
-- =====================================================

-- Step 1: Create a demo user
INSERT INTO users (firebase_uid, email, full_name, business_name, business_segment, plan)
VALUES (
    'demo_uid_12345',
    'demo@inventaapi.com',
    'Demo Developer',
    'Demo Hardware Store',
    'Hardware',
    'Professional'
) ON CONFLICT (firebase_uid) DO NOTHING;

-- Step 2: Generate demo API keys
INSERT INTO api_keys (user_id, api_key, key_name, rate_limit_per_day, status)
VALUES
    -- Full access key (all products)
    (
        (SELECT id FROM users WHERE email = 'demo@inventaapi.com'),
        'daas_demo_full_access_all_products_xyz',
        'Demo Full Access Key',
        10000,
        'active'
    ),
    -- Pharmacy only key
    (
        (SELECT id FROM users WHERE email = 'demo@inventaapi.com'),
        'daas_demo_pharmacy_only_abc123',
        'Demo Pharmacy Key',
        5000,
        'active'
    ),
    -- Hardware only key
    (
        (SELECT id FROM users WHERE email = 'demo@inventaapi.com'),
        'daas_demo_hardware_only_def456',
        'Demo Hardware Key',
        5000,
        'active'
    )
ON CONFLICT (api_key) DO NOTHING;

-- Step 3: Assign products to API keys

-- Full access key gets all products
INSERT INTO api_key_products (api_key_id, product_id)
SELECT 
    (SELECT id FROM api_keys WHERE api_key = 'daas_demo_full_access_all_products_xyz'),
    p.id
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM api_key_products akp 
    WHERE akp.api_key_id = (SELECT id FROM api_keys WHERE api_key = 'daas_demo_full_access_all_products_xyz')
    AND akp.product_id = p.id
);

-- Pharmacy key gets only pharmacy products
INSERT INTO api_key_products (api_key_id, product_id)
SELECT 
    (SELECT id FROM api_keys WHERE api_key = 'daas_demo_pharmacy_only_abc123'),
    p.id
FROM products p
WHERE p.segment = 'Pharmacy'
AND NOT EXISTS (
    SELECT 1 FROM api_key_products akp 
    WHERE akp.api_key_id = (SELECT id FROM api_keys WHERE api_key = 'daas_demo_pharmacy_only_abc123')
    AND akp.product_id = p.id
);

-- Hardware key gets only hardware products
INSERT INTO api_key_products (api_key_id, product_id)
SELECT 
    (SELECT id FROM api_keys WHERE api_key = 'daas_demo_hardware_only_def456'),
    p.id
FROM products p
WHERE p.segment = 'Hardware'
AND NOT EXISTS (
    SELECT 1 FROM api_key_products akp 
    WHERE akp.api_key_id = (SELECT id FROM api_keys WHERE api_key = 'daas_demo_hardware_only_def456')
    AND akp.product_id = p.id
);

-- Step 4: Add more sample products for testing
INSERT INTO products (sku, name, description, category, segment, price, stock, metadata, tags) VALUES

-- More Pharmacy Products
('PHARM-003', 'Biogesic 500mg', 'Paracetamol for fever and pain', 'Pain Relief', 'Pharmacy', 6.50, 800, 
    '{"dosage": "500mg", "prescription_required": false, "manufacturer": "Unilab"}',
    ARRAY['pain relief', 'fever', 'biogesic', 'paracetamol']),
('PHARM-004', 'Neozep Forte', 'Cold and flu medicine', 'Cold & Flu', 'Pharmacy', 8.00, 600,
    '{"dosage": "1 tablet", "prescription_required": false, "manufacturer": "Unilab"}',
    ARRAY['cold', 'flu', 'neozep', 'decongestant']),
('PHARM-005', 'Vitamin C 500mg', 'Immune system booster', 'Vitamins', 'Pharmacy', 5.00, 1000,
    '{"dosage": "500mg", "prescription_required": false, "manufacturer": "Generic"}',
    ARRAY['vitamin', 'immune', 'health', 'supplement']),

-- More Hardware Products
('HW-003', 'Screwdriver Set 6pcs', 'Phillips and flathead screwdriver set', 'Hand Tools', 'Hardware', 250.00, 200,
    '{"pieces": 6, "material": "Chrome Vanadium Steel", "warranty_months": 12}',
    ARRAY['screwdriver', 'tool set', 'hand tools']),
('HW-004', 'Paint Roller Kit', 'Complete paint roller with tray', 'Painting Supplies', 'Hardware', 180.00, 120,
    '{"roller_width": "9 inches", "includes": "Roller, Tray, Handle"}',
    ARRAY['paint', 'roller', 'painting', 'decoration']),
('HW-005', 'Electrical Tape Black', 'Insulating electrical tape', 'Electrical', 'Hardware', 35.00, 500,
    '{"length": "18m", "width": "19mm", "color": "Black"}',
    ARRAY['electrical', 'tape', 'wiring', 'insulation']),

-- More Grocery Products
('GROC-003', 'Soy Sauce 1L', 'All-purpose soy sauce', 'Condiments', 'Grocery', 65.00, 400,
    '{"volume": "1L", "type": "Regular", "brand": "Silver Swan"}',
    ARRAY['soy sauce', 'condiment', 'cooking', 'seasoning']),
('GROC-004', 'Sugar 1kg', 'White refined sugar', 'Baking & Cooking', 'Grocery', 55.00, 350,
    '{"net_weight": "1kg", "type": "Refined", "origin": "Philippines"}',
    ARRAY['sugar', 'sweetener', 'baking', 'cooking']),
('GROC-005', 'Canned Sardines 155g', 'Sardines in tomato sauce', 'Canned Goods', 'Grocery', 25.00, 600,
    '{"net_weight": "155g", "flavor": "Tomato Sauce", "expiry": "2025-12-31"}',
    ARRAY['sardines', 'canned', 'seafood', 'protein'])

ON CONFLICT (sku) DO NOTHING;

-- Display results
DO $$ 
BEGIN
    RAISE NOTICE 'Demo data seeded successfully!';
    RAISE NOTICE 'Demo user email: demo@inventaapi.com';
    RAISE NOTICE '';
    RAISE NOTICE 'Available API Keys:';
    RAISE NOTICE '1. Full Access: daas_demo_full_access_all_products_xyz';
    RAISE NOTICE '2. Pharmacy Only: daas_demo_pharmacy_only_abc123';
    RAISE NOTICE '3. Hardware Only: daas_demo_hardware_only_def456';
    RAISE NOTICE '';
    RAISE NOTICE 'Test with: curl -H "Authorization: Bearer daas_demo_full_access_all_products_xyz" http://localhost:5001/api/v1/products';
END $$;

-- Verification queries
SELECT 'Total Products:' as info, COUNT(*) as count FROM products;
SELECT 'Total API Keys:' as info, COUNT(*) as count FROM api_keys;
SELECT 'Total Product Assignments:' as info, COUNT(*) as count FROM api_key_products;

-- Show API key summary
SELECT 
    ak.key_name,
    ak.api_key,
    COUNT(akp.product_id) as products_count,
    ak.status
FROM api_keys ak
LEFT JOIN api_key_products akp ON ak.id = akp.api_key_id
WHERE ak.user_id = (SELECT id FROM users WHERE email = 'demo@inventaapi.com')
GROUP BY ak.id, ak.key_name, ak.api_key, ak.status;
