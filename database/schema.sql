-- =====================================================
-- InventaAPI Database Schema
-- PostgreSQL 14+ Compatible
-- Purpose: Product Information API Marketplace
-- =====================================================

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PRODUCTS TABLE
-- Stores all product information across segments
-- =====================================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    segment VARCHAR(50) NOT NULL CHECK (segment IN ('Pharmacy', 'Hardware', 'Grocery')),
    
    -- Pricing & Stock
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 0,
    
    -- Product Metadata (JSONB for flexible segment-specific data)
    metadata JSONB DEFAULT '{}',
    -- Example metadata structure:
    -- Pharmacy: {"dosage": "500mg", "prescription_required": true, "manufacturer": "XYZ Pharma"}
    -- Hardware: {"material": "Steel", "dimensions": "10x5x3cm", "weight_kg": 0.5}
    -- Grocery: {"net_weight": "250g", "expiry_date": "2025-12-31", "nutrition_facts": {...}}
    
    -- Image & Media
    image_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    
    -- SEO & Search
    tags TEXT[], -- Array of searchable tags
    search_vector TSVECTOR, -- Full-text search optimization
    
    -- Status & Availability
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_featured BOOLEAN NOT NULL DEFAULT false,
    
    -- Audit Fields
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    CONSTRAINT products_price_positive CHECK (price >= 0),
    CONSTRAINT products_stock_non_negative CHECK (stock >= 0)
);

-- Create indexes for fast querying
CREATE INDEX idx_products_segment ON products(segment);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_search_vector ON products USING gin(search_vector);
CREATE INDEX idx_products_tags ON products USING gin(tags);

-- Trigger to auto-update search_vector
CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_vector_trigger
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at_trigger
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. USERS TABLE (API Consumers)
-- Stores developer/merchant accounts
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL, -- Firebase Auth UID
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),
    business_segment VARCHAR(50),
    
    -- Account Status
    role VARCHAR(50) NOT NULL DEFAULT 'Developer' CHECK (role IN ('Developer', 'Admin')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Subscription & Billing
    plan VARCHAR(50) NOT NULL DEFAULT 'Starter' CHECK (plan IN ('Starter', 'Professional', 'Enterprise', 'Unlimited')),
    
    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

CREATE TRIGGER users_updated_at_trigger
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 3. API_KEYS TABLE
-- Stores generated API keys for custom product access
-- =====================================================
CREATE TABLE api_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- API Key Details
    api_key VARCHAR(64) UNIQUE NOT NULL, -- Format: daas_xxxxxxxxxxxxxxxxxxxxxxxx
    key_name VARCHAR(255) NOT NULL, -- User-friendly name: "My Pharmacy API", "Hardware Store Access"
    
    -- Rate Limiting & Quotas
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    rate_limit_per_day INTEGER NOT NULL DEFAULT 5000,
    requests_used_today INTEGER NOT NULL DEFAULT 0,
    last_request_at TIMESTAMP,
    
    -- Status & Lifecycle
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'revoked')),
    expires_at TIMESTAMP, -- NULL = never expires
    
    -- Metadata
    environment VARCHAR(50) NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),
    allowed_origins TEXT[], -- CORS whitelist
    webhook_url VARCHAR(500), -- Optional: webhook for usage alerts
    
    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_reason TEXT
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_api_key ON api_keys(api_key);
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE UNIQUE INDEX idx_api_keys_api_key_unique ON api_keys(api_key);

CREATE TRIGGER api_keys_updated_at_trigger
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. API_KEY_PRODUCTS (Junction Table)
-- Maps which products are accessible by which API keys
-- =====================================================
CREATE TABLE api_key_products (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Access Control
    can_read BOOLEAN NOT NULL DEFAULT true,
    can_update BOOLEAN NOT NULL DEFAULT false, -- Future: Allow merchants to update stock/price
    
    -- Audit
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique product per API key
    CONSTRAINT api_key_products_unique UNIQUE (api_key_id, product_id)
);

CREATE INDEX idx_api_key_products_api_key_id ON api_key_products(api_key_id);
CREATE INDEX idx_api_key_products_product_id ON api_key_products(product_id);

-- =====================================================
-- 5. API_USAGE_LOGS (Optional: Analytics & Billing)
-- Track every API request for analytics and billing
-- =====================================================
CREATE TABLE api_usage_logs (
    id BIGSERIAL PRIMARY KEY,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    
    -- Request Details
    endpoint VARCHAR(255) NOT NULL,
    http_method VARCHAR(10) NOT NULL,
    query_params JSONB,
    
    -- Response Details
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    products_returned INTEGER DEFAULT 0,
    
    -- Client Info
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Partition by month for performance (optional, for high-traffic systems)
CREATE INDEX idx_api_usage_logs_api_key_id ON api_usage_logs(api_key_id);
CREATE INDEX idx_api_usage_logs_requested_at ON api_usage_logs(requested_at);

-- =====================================================
-- SAMPLE DATA INSERTION
-- =====================================================

-- Insert sample products
INSERT INTO products (sku, name, description, category, segment, price, stock, metadata, tags) VALUES
-- Pharmacy Products
('PHARM-001', 'Paracetamol 500mg', 'Pain reliever and fever reducer', 'Pain Relief', 'Pharmacy', 5.50, 500, 
    '{"dosage": "500mg", "prescription_required": false, "manufacturer": "Generic Pharma"}',
    ARRAY['pain relief', 'fever', 'otc', 'generic']),
('PHARM-002', 'Amoxicillin 500mg', 'Antibiotic for bacterial infections', 'Antibiotics', 'Pharmacy', 12.00, 200,
    '{"dosage": "500mg", "prescription_required": true, "manufacturer": "MedCo"}',
    ARRAY['antibiotic', 'prescription', 'bacterial infection']),

-- Hardware Products
('HW-001', 'Hammer Claw 16oz', 'Professional claw hammer with fiberglass handle', 'Hand Tools', 'Hardware', 299.00, 150,
    '{"material": "Steel Head, Fiberglass Handle", "weight_kg": 0.5, "warranty_months": 12}',
    ARRAY['tools', 'hammer', 'construction', 'hand tool']),
('HW-002', 'Concrete Mix 40kg', 'High-strength concrete mix for construction', 'Building Materials', 'Hardware', 185.00, 80,
    '{"weight_kg": 40, "coverage_sqm": 2.5, "drying_time_hours": 24}',
    ARRAY['cement', 'concrete', 'building', 'construction']),

-- Grocery Products
('GROC-001', 'White Rice 5kg', 'Premium quality white rice', 'Grains & Rice', 'Grocery', 245.00, 300,
    '{"net_weight": "5kg", "origin": "Philippines", "shelf_life_months": 12}',
    ARRAY['rice', 'staple', 'grain', 'food']),
('GROC-002', 'Cooking Oil 1L', 'Pure vegetable cooking oil', 'Cooking Essentials', 'Grocery', 89.00, 250,
    '{"volume": "1L", "type": "Vegetable Oil", "expiry_date": "2025-12-31"}',
    ARRAY['cooking', 'oil', 'kitchen', 'food']);

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

-- View: Active API Keys with Product Count
CREATE VIEW v_api_keys_summary AS
SELECT 
    ak.id,
    ak.api_key,
    ak.key_name,
    u.email as user_email,
    u.business_name,
    ak.status,
    ak.rate_limit_per_day,
    ak.requests_used_today,
    COUNT(akp.product_id) as total_products,
    COUNT(CASE WHEN p.segment = 'Pharmacy' THEN 1 END) as pharmacy_products,
    COUNT(CASE WHEN p.segment = 'Hardware' THEN 1 END) as hardware_products,
    COUNT(CASE WHEN p.segment = 'Grocery' THEN 1 END) as grocery_products,
    ak.created_at,
    ak.last_used_at
FROM api_keys ak
JOIN users u ON ak.user_id = u.id
LEFT JOIN api_key_products akp ON ak.id = akp.api_key_id
LEFT JOIN products p ON akp.product_id = p.id
GROUP BY ak.id, u.email, u.business_name;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function: Generate API Key
CREATE OR REPLACE FUNCTION generate_api_key() RETURNS VARCHAR(64) AS $$
DECLARE
    new_key VARCHAR(64);
BEGIN
    new_key := 'daas_' || encode(gen_random_bytes(24), 'hex');
    RETURN new_key;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if API Key is valid and not rate-limited
CREATE OR REPLACE FUNCTION is_api_key_valid(key_to_check VARCHAR(64)) RETURNS BOOLEAN AS $$
DECLARE
    key_record RECORD;
BEGIN
    SELECT * INTO key_record FROM api_keys WHERE api_key = key_to_check;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    IF key_record.status != 'active' THEN
        RETURN false;
    END IF;
    
    IF key_record.expires_at IS NOT NULL AND key_record.expires_at < CURRENT_TIMESTAMP THEN
        RETURN false;
    END IF;
    
    IF key_record.requests_used_today >= key_record.rate_limit_per_day THEN
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- SECURITY: Row-Level Security (Optional)
-- =====================================================

-- Enable RLS on sensitive tables
-- ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY api_keys_user_policy ON api_keys FOR ALL USING (user_id = current_setting('app.current_user_id')::INTEGER);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_api_key_products_composite ON api_key_products(api_key_id, product_id) WHERE can_read = true;
CREATE INDEX idx_products_active_segment ON products(segment, is_active) WHERE is_active = true;

-- =====================================================
-- MAINTENANCE FUNCTIONS
-- =====================================================

-- Reset daily request counters (run via cron job daily at midnight)
CREATE OR REPLACE FUNCTION reset_daily_api_limits() RETURNS void AS $$
BEGIN
    UPDATE api_keys SET requests_used_today = 0;
END;
$$ LANGUAGE plpgsql;

-- Clean up old usage logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_usage_logs() RETURNS void AS $$
BEGIN
    DELETE FROM api_usage_logs WHERE requested_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE products IS 'Master product catalog for all business segments';
COMMENT ON TABLE users IS 'API consumer accounts (developers/merchants)';
COMMENT ON TABLE api_keys IS 'Generated API keys with rate limits and quotas';
COMMENT ON TABLE api_key_products IS 'Junction table mapping API keys to accessible products';
COMMENT ON TABLE api_usage_logs IS 'Request logging for analytics and billing';


-- =====================================================
-- PRODUCT REQUESTS TABLE
-- Stores user requests for products not in database
-- =====================================================
CREATE TABLE IF NOT EXISTS product_requests (
    id SERIAL PRIMARY KEY,
    
    -- Product Information
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    notes TEXT,
    
    -- Request Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
    
    -- User Information
    requested_by VARCHAR(255), -- Email or user ID
    requested_by_name VARCHAR(255),
    
    -- Admin Review
    reviewed_by VARCHAR(255), -- Admin email or ID
    review_notes TEXT,
    approved_at TIMESTAMP,
    rejected_at TIMESTAMP,
    
    -- Product Creation (if approved)
    created_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    
    -- Audit Fields
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_product_requests_status (status),
    INDEX idx_product_requests_requested_by (requested_by),
    INDEX idx_product_requests_created_at (created_at DESC)
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_product_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_product_requests_updated_at
    BEFORE UPDATE ON product_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_product_requests_updated_at();

-- =====================================================
-- NOTIFICATIONS TABLE (for user notifications)
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    
    -- User Information
    user_email VARCHAR(255) NOT NULL,
    
    -- Notification Content
    type VARCHAR(50) NOT NULL CHECK (type IN ('product_approved', 'product_rejected', 'request_received', 'general')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    
    -- Related Entity
    related_request_id INTEGER REFERENCES product_requests(id) ON DELETE CASCADE,
    related_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    
    -- Status
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMP,
    
    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_notifications_user_email (user_email),
    INDEX idx_notifications_is_read (is_read),
    INDEX idx_notifications_created_at (created_at DESC)
);
