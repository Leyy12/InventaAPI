-- =====================================================
-- Migration: Add Product Requests Feature
-- Date: 2026-07-14
-- Description: Creates tables for product request workflow
-- =====================================================

-- =====================================================
-- PRODUCT REQUESTS TABLE
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
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_requests_status ON product_requests(status);
CREATE INDEX IF NOT EXISTS idx_product_requests_requested_by ON product_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_product_requests_created_at ON product_requests(created_at DESC);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_product_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_requests_updated_at ON product_requests;
CREATE TRIGGER trigger_update_product_requests_updated_at
    BEFORE UPDATE ON product_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_product_requests_updated_at();

-- =====================================================
-- NOTIFICATIONS TABLE
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
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- =====================================================
-- Seed some test data (optional)
-- =====================================================
INSERT INTO product_requests (product_name, category, notes, requested_by, requested_by_name, status)
VALUES 
    ('Dove Shampoo 200ml', 'Personal Care', 'Please add barcode comparison', 'test@example.com', 'Test User', 'pending'),
    ('iPhone 15 Pro Max', 'Electronics', 'Need complete specs and pricing', 'admin@example.com', 'Admin User', 'under_review')
ON CONFLICT DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully! Product Requests tables created.';
END $$;
