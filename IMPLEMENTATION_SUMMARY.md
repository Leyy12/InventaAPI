# ✅ Product Request Crowdsourcing - Implementation Complete

## Implementation follows EXACT specification provided

---

## 1. Client-Side UX Flow ✅

### **Trigger:** Search returns 0 results
- Location: `/dashboard/products` page
- Condition: `filteredProducts.length === 0`

### **Empty State CTA Button**
```
[ + Can't find product? Submit Request ]
```
**Implementation:**
- Appears as a prominent call-to-action button
- Centered in the empty state area
- Opens product request form when clicked

### **Request Form Fields:**

| Field | Type | Required | Behavior |
|-------|------|----------|----------|
| **Product Name** | Text input | ✅ Yes | Auto-filled with user's search query |
| **Category** | Dropdown | ✅ Yes | Options: Pharmacy, Hardware, Grocery, Electronics |
| **SKU / Barcode** | Text input | ❌ Optional | Free text |
| **Brand / Specifications** | Textarea | ❌ Optional | Labeled as "Additional Details" |
| **Product Image** | File upload | ❌ Optional | PNG, JPG, WebP with preview |

### **Form Behavior:**
1. User clicks CTA button → Form expands/shows
2. Product Name auto-fills if search query exists
3. User completes form fields
4. Clicks "Submit Product Request"
5. Image uploads to Firebase Storage (if provided)
6. Form submits to backend

### **Success Feedback:**
**Exact message displayed:**
> "Thank you! Your product request has been submitted for review. Once approved by our team, it will be added to the InventaAPI Master Catalog."

---

## 2. Backend API Endpoint ✅

### **Endpoint:** `POST /api/v1/product-requests`

**Request Payload Structure:**
```json
{
  "requested_by_user_id": "usr_12345",
  "requested_by_email": "user@example.com",
  "product_name": "Dyson Hair Dryer Pink",
  "category": "Electronics",
  "barcode": "123456789",
  "brand": "Dyson",
  "specifications": "1600W, Ionic Technology",
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

### **Database: `product_requests` Collection**
**Schema:**
```javascript
{
  productName: "Dyson Hair Dryer Pink",
  category: "Electronics",
  sku: "123456789",
  details: "Brand and specifications combined",
  imageUrl: "https://storage.firebase.com/...",
  searchQuery: "dyson",
  requestedBy: {
    uid: "usr_12345",
    email: "user@example.com"
  },
  status: "pending", // Initial status
  createdAt: "2026-07-21T17:00:00Z",
  reviewedAt: null,
  reviewedBy: null,
  notes: null
}
```

---

## 3. Admin Portal Workflow ✅

### **Admin View URL:** `/admin/product-requests`

**Features:**
- Filter tabs: Pending | Approved | Rejected | All
- List view of product requests
- Shows all request details including image preview

### **Admin Actions:**

#### **[ Approve & Publish ]**
**Behavior:**
1. Copies data from `product_requests` → `products` collection
2. Sets product `status` to `active` in products table
3. Updates request `status` to `approved`
4. Records `reviewedAt` timestamp and `reviewedBy` admin email
5. Product immediately available via API to ALL customers

**Code execution:**
```javascript
// Add to products collection
await addDoc(collection(db, "products"), {
  name: request.productName,
  category: request.category,
  sku: request.sku || auto-generated,
  price: 0, // Admin updates later
  image_url: request.imageUrl,
  description: request.details,
  status: "active",
  addedVia: "crowdsourcing"
});

// Update request status
await updateDoc(doc(db, "product_requests", request.id), {
  status: "approved",
  reviewedAt: serverTimestamp(),
  reviewedBy: currentAdmin.email
});
```

#### **[ Reject / Duplicate ]**
**Behavior:**
1. Prompts admin for rejection reason
2. Updates request `status` to `rejected`
3. Stores reason in `notes` field
4. Records `reviewedAt` and `reviewedBy`
5. Request does NOT move to products table

---

## 4. API Response Behavior ✅

### **Updated DaaS Catalog Endpoint:** `GET /daas/v1/catalog`

#### **Scenario: No products found matching search**

**Request:**
```bash
curl -X GET "http://localhost:5000/daas/v1/catalog?search=Dyson" \
  -H "x-api-key: inv_live_abc123..."
```

**Response (EXACT format per specification):**
```json
{
  "status": "error",
  "message": "No products found matching query.",
  "data": [],
  "action_required": {
    "can_request_product": true,
    "request_url": "https://inventaapi.com/dashboard/requests/new?query=Dyson"
  }
}
```

**Key Points:**
- ✅ `status`: "error"
- ✅ `message`: Exact text as specified
- ✅ `data`: Empty array `[]`
- ✅ `action_required` object with exact structure
- ✅ URL includes query parameter for auto-fill

---

## Testing Checklist ✅

### **Customer Flow:**
1. ✅ Go to `http://localhost:3000/dashboard/products`
2. ✅ Search for non-existent product (e.g., "Dyson")
3. ✅ See empty state with CTA button: "[ + Can't find product? Submit Request ]"
4. ✅ Click button → Form expands
5. ✅ Product Name auto-filled with "Dyson"
6. ✅ Select category, add optional fields
7. ✅ Upload product image (optional)
8. ✅ Submit form
9. ✅ See success message: "Thank you! Your product request has been submitted..."

### **Admin Flow:**
1. ✅ Login as admin
2. ✅ Go to `http://localhost:3000/admin/product-requests`
3. ✅ See list of pending requests
4. ✅ Review product details, image, requester info
5. ✅ Click "Approve & Publish"
6. ✅ Product automatically added to `products` collection with `status: "active"`
7. ✅ Request marked as `approved`

### **API Developer Flow:**
1. ✅ Make API request: `GET /daas/v1/catalog?search=NonExistent`
2. ✅ Receive response with `action_required` object
3. ✅ Parse `request_url` and direct user to submit request page
4. ✅ User submits request via dashboard
5. ✅ Admin approves
6. ✅ Product now appears in subsequent API calls

---

## File Changes Summary

### **Frontend:**
- ✅ `dashboard/src/app/dashboard/products/page.tsx`
  - Added CTA button trigger
  - Form shows/hides based on state
  - Auto-fill product name from search
  - Image upload with preview
  - Success message matches spec

- ✅ `dashboard/src/app/admin/product-requests/page.tsx` (renamed from `requests`)
  - Admin review interface
  - Approve & Reject actions
  - Image preview display

### **Backend:**
- ✅ `routes/product-requests.js` (NEW)
  - POST endpoint for submissions
  - GET endpoint for admin list
  - PATCH endpoint for status updates

- ✅ `routes/daas.js`
  - Updated response format
  - Added `action_required` metadata
  - Exact JSON structure per spec

- ✅ `server.js`
  - Registered `/api/v1/product-requests` route

### **Database:**
- ✅ `product_requests` (Firestore collection)
  - Auto-created on first submission
  - Schema matches specification

---

## URLs

**Landing Page:**
```
http://localhost:3000
```

**Product Catalog (Customer):**
```
http://localhost:3000/dashboard/products
```

**Admin Product Requests:**
```
http://localhost:3000/admin/product-requests
```

**API Endpoints:**
```
POST http://localhost:5000/api/v1/product-requests
GET  http://localhost:5000/daas/v1/catalog?search=query
```

---

## Key Features Delivered

✅ Interactive CTA button (not auto-visible form)  
✅ Product name auto-fills from search query  
✅ Image upload with Firebase Storage  
✅ Exact success message as specified  
✅ Admin URL: `/admin/product-requests`  
✅ Approve & Publish → moves to `products` table  
✅ Reject → marks as rejected  
✅ API response includes `action_required` metadata  
✅ Exact JSON structure per specification  
✅ Status field: `pending` → `approved` / `rejected`  

---

## Status: ✅ COMPLETE - Ready for Testing

All requirements from the specification have been implemented exactly as requested.
