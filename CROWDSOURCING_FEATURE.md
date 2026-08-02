# Product Request Crowdsourcing Feature

## Overview

The InventaAPI platform includes a **crowdsourcing mechanism** that turns "No Product Found" scenarios into data collection opportunities. When developers or businesses search for products that don't exist in the catalog, they can submit requests that are reviewed by admins and added to the master database.

---

## How It Works

### 1. **Customer Journey**

#### Trigger: Empty Search Results
When a user searches for a product in the catalog (frontend dashboard or via API) and gets **0 results**, they see:

- **Empty State Message**: "No Products Found"
- **API Capabilities Section**: Explains what the API can do
- **Product Request Form**: Interactive form to submit missing products

#### Product Request Form Fields
- **Product Name** *(Required)* - Auto-filled with search query if available
- **Category** *(Required)* - Dropdown: Pharmacy, Hardware, Grocery, Electronics
- **SKU/Barcode** *(Optional)* - Text input for product identifier
- **Brand/Specifications** *(Optional)* - Textarea for additional details
- **Product Image** *(Optional)* - File upload (PNG, JPG, WebP, max 5MB)

#### Submission Flow
1. User fills out the form
2. Image is uploaded to Firebase Storage (if provided)
3. Request is saved to `product_requests` Firestore collection with status `pending`
4. User sees success message: *"Thank you! Your product request has been submitted for review. Once approved by our team, it will be added to the InventaAPI Master Catalog."*

---

### 2. **Backend API Endpoints**

#### Submit Product Request
**Endpoint:** `POST /api/v1/product-requests`

**Request Body:**
```json
{
  "requested_by_user_id": "usr_12345",
  "requested_by_email": "user@example.com",
  "product_name": "Dyson Hair Dryer Pink",
  "category": "Electronics",
  "barcode": "123456789",
  "brand": "Dyson",
  "specifications": "1600W, Ionic Technology, Pink Color",
  "image_url": "https://storage.firebase.com/...",
  "search_query": "dyson hair dryer"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Product request submitted successfully",
  "data": {
    "request_id": "req_abc123",
    "status": "pending",
    "estimated_review_time": "24-48 hours"
  }
}
```

#### Get Product Requests (Admin Only)
**Endpoint:** `GET /api/v1/product-requests?status=pending`

**Response:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": "req_abc123",
      "productName": "Dyson Hair Dryer Pink",
      "category": "Electronics",
      "sku": "123456789",
      "details": "1600W, Ionic Technology",
      "imageUrl": "https://storage.firebase.com/...",
      "searchQuery": "dyson hair dryer",
      "requestedBy": {
        "uid": "usr_12345",
        "email": "user@example.com"
      },
      "status": "pending",
      "createdAt": "2026-07-14T10:30:00Z"
    }
  ]
}
```

#### Update Request Status (Admin Only)
**Endpoint:** `PATCH /api/v1/product-requests/:id`

**Request Body:**
```json
{
  "status": "approved",
  "notes": "Product added to catalog",
  "reviewed_by": "admin@inventaapi.com"
}
```

---

### 3. **DaaS API Response Enhancement**

When the DaaS API endpoint returns no products (either no linked products or search returns 0 results), it includes **actionable metadata**:

#### Example: Empty Catalog
**Request:**
```bash
curl -X GET "http://localhost:5000/daas/v1/catalog" \
  -H "x-api-key: inv_live_abc123..."
```

**Response:**
```json
{
  "status": "success",
  "message": "No products are linked to this API key. Please select products from the Product Catalog.",
  "meta": {
    "count": 0,
    "keyName": "My API Key",
    "plan": "Professional"
  },
  "products": [],
  "action_required": {
    "can_request_product": true,
    "request_url": "http://localhost:3000/dashboard/products",
    "message": "You can request new products to be added to the catalog through the dashboard."
  }
}
```

#### Example: Search Returns No Results
**Request:**
```bash
curl -X GET "http://localhost:5000/daas/v1/catalog?search=iPhone%2015" \
  -H "x-api-key: inv_live_abc123..."
```

**Response:**
```json
{
  "status": "error",
  "message": "No products found matching query: \"iPhone 15\"",
  "meta": {
    "count": 0,
    "keyName": "My API Key",
    "plan": "Professional",
    "searchQuery": "iPhone 15"
  },
  "products": [],
  "action_required": {
    "can_request_product": true,
    "request_url": "http://localhost:3000/dashboard/products?search=iPhone%2015",
    "message": "The product \"iPhone 15\" is not in your catalog. You can submit a request to add it to our master database.",
    "help_text": "Our crowdsourcing system allows customers to request missing products. Approved requests are added to the catalog within 24-48 hours."
  }
}
```

---

### 4. **Admin Review Workflow**

#### Admin Dashboard Page: `/admin/requests`

**Features:**
- **Filter Tabs**: Pending, Approved, Rejected, All
- **Request Cards** showing:
  - Product name, category, SKU
  - Requester email and submission date
  - Product image preview (if uploaded)
  - Additional details
  - Search query that triggered the request

**Admin Actions:**

##### Approve & Add to Catalog
1. Admin clicks "Approve & Add to Catalog"
2. System automatically:
   - Creates new document in `products` collection
   - Uses uploaded image or placeholder
   - Sets price to 0 (admin updates later)
   - Marks request as `approved`
   - Records reviewer info and timestamp

##### Reject Request
1. Admin clicks "Reject"
2. Prompted to enter rejection reason
3. Request marked as `rejected` with notes

---

## Firebase Collections

### `product_requests` Collection
```javascript
{
  productName: "iPhone 15 Pro Max 256GB",
  category: "Electronics",
  sku: "APPLE-IP15PM-256",
  details: "Blue color, latest model",
  searchQuery: "iphone 15",
  imageUrl: "https://storage.firebase.com/...",
  requestedBy: {
    uid: "usr_12345",
    email: "customer@example.com"
  },
  status: "pending", // pending | approved | rejected
  createdAt: "2026-07-14T10:30:00Z",
  reviewedAt: null,
  reviewedBy: null,
  notes: null
}
```

### After Approval → `products` Collection
```javascript
{
  name: "iPhone 15 Pro Max 256GB",
  category: "Electronics",
  segment: "Electronics",
  sku: "APPLE-IP15PM-256",
  price: 0, // Admin updates this
  size: null,
  image_url: "https://storage.firebase.com/...",
  description: "Blue color, latest model",
  createdAt: "2026-07-14T11:00:00Z",
  addedVia: "crowdsourcing",
  requestId: "req_abc123"
}
```

---

## Benefits

### For Customers
- ✅ No dead-ends when product not found
- ✅ Direct input into catalog expansion
- ✅ Faster access to needed products
- ✅ Email notification when request approved

### For Platform Owner
- ✅ Crowdsourced catalog growth
- ✅ Data-driven product additions
- ✅ Customer engagement
- ✅ Reduced manual research

### For API Consumers (Developers)
- ✅ Clear error handling with actionable next steps
- ✅ Self-service product requests
- ✅ Transparent review timeline
- ✅ Improved API coverage over time

---

## Testing the Feature

### 1. Customer Flow (Frontend)
```
1. Go to http://localhost:3000
2. Login as customer (delarosaleah38@gmail.com)
3. Navigate to Product Catalog
4. Search for "Xbox Series X" (doesn't exist)
5. See empty state with request form
6. Fill out form and upload image
7. Submit request
8. See success message
```

### 2. Admin Review (Frontend)
```
1. Login as admin
2. Go to http://localhost:3000/admin/requests
3. See pending request from customer
4. Review details and image
5. Click "Approve & Add to Catalog"
6. Product appears in Products collection
```

### 3. API Testing (cURL)
```bash
# Test empty search response
curl -X GET "http://localhost:5000/daas/v1/catalog?search=nonexistent" \
  -H "x-api-key: YOUR_API_KEY"

# Submit product request via API
curl -X POST "http://localhost:5000/api/v1/product-requests" \
  -H "Content-Type: application/json" \
  -d '{
    "requested_by_user_id": "test_user",
    "requested_by_email": "test@example.com",
    "product_name": "Test Product",
    "category": "Hardware"
  }'

# Get all pending requests (admin)
curl -X GET "http://localhost:5000/api/v1/product-requests?status=pending"
```

---

## Environment Variables Required

```env
# Firebase Storage (for image uploads)
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# App URL (for API response URLs)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Future Enhancements

- [ ] Email notifications when request approved/rejected
- [ ] Bulk approve/reject in admin panel
- [ ] Duplicate detection (suggest existing products)
- [ ] Voting system (multiple users request same product)
- [ ] Auto-pricing suggestions using AI
- [ ] Mobile app integration
- [ ] Public product request leaderboard

---

## Support

For questions about the crowdsourcing feature:
- Email: support@inventaapi.com
- Documentation: http://localhost:3000/dashboard/docs
- Admin Panel: http://localhost:3000/admin/requests
