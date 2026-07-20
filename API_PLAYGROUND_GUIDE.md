# 🎮 InventaAPI Playground - Complete Implementation Guide

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Database Setup](#database-setup)
3. [Backend Configuration](#backend-configuration)
4. [API Testing Flow](#api-testing-flow)
5. [Frontend Integration](#frontend-integration)
6. [Security Considerations](#security-considerations)

---

## 🏗️ System Overview

### Architecture Flow
```
User Selects Products → Generates API Key → Tests in Playground → Gets Filtered Products
```

### Key Components

1. **Product Catalog** (`/dashboard/products`)
   - Browse all available products
   - Select products using checkboxes
   - View cart summary with segment breakdown
   - Generate custom API key

2. **API Playground** (`/dashboard/api-playground`)
   - Interactive API testing interface
   - Live request/response viewer
   - Code examples in multiple languages
   - Response time monitoring

3. **Backend API** (`/api/v1/products`)
   - API key authentication
   - Product filtering by authorized IDs
   - Rate limiting & usage tracking
   - Detailed response with pagination

---

## 🗄️ Database Setup

### Step 1: Install PostgreSQL

```bash
# For Windows (using Chocolatey)
choco install postgresql

# For macOS
brew install postgresql

# For Linux (Ubuntu/Debian)
sudo apt-get install postgresql postgresql-contrib
```

### Step 2: Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE inventaapi;

# Connect to the new database
\c inventaapi
```

### Step 3: Run Schema

```bash
# Execute the schema file
psql -U postgres -d inventaapi -f database/schema.sql
```

### Step 4: Verify Installation

```sql
-- Check tables
\dt

-- Should see:
--  products
--  users
--  api_keys
--  api_key_products
--  api_usage_logs

-- Verify sample data
SELECT COUNT(*) FROM products;
-- Should return 6 (sample products)
```

---

## ⚙️ Backend Configuration

### Step 1: Install Dependencies

```bash
# Add PostgreSQL driver
npm install pg

# Ensure other dependencies are installed
npm install
```

### Step 2: Update Environment Variables

Copy `.env.example` to `.env` and update:

```env
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventaapi
DB_USER=postgres
DB_PASSWORD=your_password

# API Server
API_PORT=5001
```

### Step 3: Update server.js

Add the new filtered products route:

```javascript
// server.js
import filteredProductsRouter from './routes/filtered-products.js';

// Add this route BEFORE existing routes
app.use('/api/v1', filteredProductsRouter);
```

### Step 4: Start Backend Server

```bash
npm run dev
```

You should see:
```
✓ PostgreSQL database connected successfully
SUCCESS: DaaS sales & inventory service running on http://localhost:5001
```

---

## 🧪 API Testing Flow

### Complete Workflow

#### 1. **Create a Test User & API Key**

```sql
-- Insert test user
INSERT INTO users (firebase_uid, email, full_name, business_name, business_segment, plan)
VALUES ('test_uid_123', 'developer@test.com', 'Test Developer', 'Test Business', 'Hardware', 'Professional');

-- Generate API key for the user
INSERT INTO api_keys (user_id, api_key, key_name, rate_limit_per_day)
VALUES (
    (SELECT id FROM users WHERE email = 'developer@test.com'),
    'daas_test_abc123def456ghi789',
    'My Test API Key',
    5000
);

-- Assign products to the API key (select products 1, 2, 3)
INSERT INTO api_key_products (api_key_id, product_id)
SELECT 
    (SELECT id FROM api_keys WHERE api_key = 'daas_test_abc123def456ghi789'),
    unnest(ARRAY[1, 2, 3]);
```

#### 2. **Test with cURL**

```bash
# Test the API
curl -X GET 'http://localhost:5001/api/v1/products' \
  -H 'Authorization: Bearer daas_test_abc123def456ghi789'
```

**Expected Response:**

```json
{
  "success": true,
  "api_key_info": {
    "business_name": "Test Business",
    "email": "developer@test.com",
    "plan": "Professional",
    "authorized_products": 3
  },
  "pagination": {
    "total": 3,
    "limit": 100,
    "offset": 0,
    "returned": 3
  },
  "products": [
    {
      "id": 1,
      "sku": "PHARM-001",
      "name": "Paracetamol 500mg",
      "segment": "Pharmacy",
      ...
    },
    ...
  ]
}
```

#### 3. **Test Product Not Authorized**

```bash
# Try to access product ID 4 (not authorized)
curl -X GET 'http://localhost:5001/api/v1/products/4' \
  -H 'Authorization: Bearer daas_test_abc123def456ghi789'
```

**Expected Response:**

```json
{
  "error": "Forbidden",
  "message": "You do not have access to this product. Please check your API key configuration."
}
```

#### 4. **Test Rate Limiting**

```sql
-- Simulate rate limit exceeded
UPDATE api_keys 
SET requests_used_today = 5000 
WHERE api_key = 'daas_test_abc123def456ghi789';
```

```bash
# This should now return 429
curl -X GET 'http://localhost:5001/api/v1/products' \
  -H 'Authorization: Bearer daas_test_abc123def456ghi789'
```

---

## 🎨 Frontend Integration

### Using the API Playground

#### Step 1: Access the Playground

Navigate to: `http://localhost:3000/dashboard/api-playground`

#### Step 2: Configure Request

1. **Enter API Key:** `daas_test_abc123def456ghi789`
2. **Select Endpoint:** `/api/v1/products`
3. **Optional - Add Filters:**
   - Segment: `Pharmacy`
   - Limit: `10`

#### Step 3: Execute & Verify

1. Click **"Execute Request"**
2. View Response:
   - ✅ Success banner
   - API key info (business name, plan, authorized products)
   - Pagination details
   - Product list (expandable)
   - Raw JSON response

#### Step 4: Copy Code Examples

Switch between tabs:
- JavaScript (Fetch API)
- Python (Requests)
- cURL
- PHP

Click copy button to get implementation code.

### Pre-selecting Products from Catalog

When user clicks "Test in Playground" from Product Catalog:

```typescript
// Redirect with selected product IDs
router.push(`/dashboard/api-playground?products=${Array.from(selectedProducts).join(',')}`);
```

The playground will:
1. Auto-generate a demo API key
2. Pre-fill the configuration
3. Show banner: "Products Pre-selected"

---

## 🔐 Security Considerations

### 1. API Key Format

```
daas_[random_48_chars]
```

- Prefix `daas_` for identification
- 48 random hex characters for security
- Stored hashed in production (optional enhancement)

### 2. Rate Limiting

**Default Limits:**
- 60 requests per minute (per IP)
- 5,000 requests per day (per API key)

**Implementation:**
```javascript
if (keyData.requests_used_today >= keyData.rate_limit_per_day) {
    return res.status(429).json({
        error: "Rate Limit Exceeded",
        message: "Daily limit exceeded. Resets at midnight UTC."
    });
}
```

### 3. Authorization Matrix

| Scenario | Status Code | Message |
|----------|-------------|---------|
| No API key | 401 | "API key is required" |
| Invalid API key | 401 | "Invalid API key" |
| Suspended key | 403 | "API key suspended" |
| Expired key | 403 | "API key expired" |
| Rate limit exceeded | 429 | "Rate limit exceeded" |
| Product not authorized | 403 | "No access to this product" |

### 4. Usage Logging

Every request is logged:
```sql
INSERT INTO api_usage_logs 
(api_key_id, endpoint, http_method, query_params, ip_address, user_agent, status_code, response_time_ms)
```

Use for:
- Billing & analytics
- Abuse detection
- Performance monitoring

---

## 📊 Testing Checklist

### Backend Tests

- [ ] Database connection successful
- [ ] Products table populated
- [ ] API key validation works
- [ ] Rate limiting enforced
- [ ] Product filtering by API key
- [ ] Unauthorized product access blocked
- [ ] Usage logging functional

### Frontend Tests

- [ ] Product catalog loads
- [ ] Product selection works
- [ ] Cart summary updates
- [ ] API Playground loads
- [ ] Request configuration works
- [ ] API execution successful
- [ ] Response display correct
- [ ] Code examples generate
- [ ] Copy to clipboard works
- [ ] Download JSON works

### Integration Tests

- [ ] Select products → Generate key → Test → Verify
- [ ] Filter by segment
- [ ] Filter by category
- [ ] Search functionality
- [ ] Pagination works
- [ ] Error handling displays
- [ ] Rate limit warning shows

---

## 🚀 Production Deployment

### Environment Setup

```env
# Production Environment
NODE_ENV=production
API_PORT=5001

# PostgreSQL (Use managed service)
DB_HOST=your-db-host.aws.com
DB_PORT=5432
DB_NAME=inventaapi_prod
DB_USER=prod_user
DB_PASSWORD=secure_password

# CORS (Lock down to your domain)
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting (Adjust based on plan)
RATE_LIMIT_MAX_REQUESTS=100
```

### Database Optimizations

```sql
-- Create indexes for production
CREATE INDEX CONCURRENTLY idx_api_usage_logs_api_key_requested 
ON api_usage_logs(api_key_id, requested_at);

-- Analyze tables for query optimization
ANALYZE products;
ANALYZE api_keys;
ANALYZE api_key_products;
```

### Security Hardening

1. **Hash API Keys** (Optional enhancement)
2. **Enable HTTPS only**
3. **Add CORS whitelist**
4. **Implement API key rotation**
5. **Set up monitoring alerts**

---

## 🎯 Success Metrics

Your system is working correctly when:

1. ✅ User can browse and select products
2. ✅ Cart summary shows accurate counts by segment
3. ✅ API key generation includes selected products
4. ✅ Playground executes requests successfully
5. ✅ Response shows ONLY authorized products
6. ✅ Unauthorized products return 403
7. ✅ Rate limits are enforced
8. ✅ Code examples are copyable
9. ✅ Response time is displayed
10. ✅ JSON is downloadable

---

## 💡 Next Steps

### Phase 2 Enhancements

1. **API Key Management Dashboard**
   - List all keys
   - View usage analytics
   - Revoke/regenerate keys

2. **Product Management**
   - Add/edit/delete products
   - Bulk import CSV
   - Product variants

3. **Analytics Dashboard**
   - Request heatmaps
   - Popular products
   - Revenue by segment

4. **Webhooks**
   - Usage alerts
   - Quota warnings
   - Error notifications

5. **API Documentation**
   - Interactive Swagger/OpenAPI docs
   - Postman collection
   - SDK generation

---

## 📞 Support

For issues or questions:
- Check logs: `tail -f logs/api.log`
- Database queries: `psql -U postgres -d inventaapi`
- API testing: Use Postman or Insomnia

**Common Issues:**

| Issue | Solution |
|-------|----------|
| Database connection refused | Check PostgreSQL is running |
| API key not found | Verify key in database |
| No products returned | Check api_key_products table |
| Rate limit too low | Update api_keys.rate_limit_per_day |

---

**Built with ❤️ for Philippine SMEs**
