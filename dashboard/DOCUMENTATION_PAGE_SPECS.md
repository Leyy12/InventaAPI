# 📖 DOCUMENTATION PAGE - COMPLETE SPECIFICATIONS

## ✅ What is the Documentation Page?

The **Documentation page** is a **developer guide** that teaches customers (or their hired developers) how to integrate and use your API. It's like an **instruction manual** for coding.

**Think of it like:** IKEA furniture instructions, pero for APIs!

---

## 🎯 Purpose

**Teach developers:**
- ✅ How to authenticate (use API keys)
- ✅ How to make API calls
- ✅ What endpoints are available
- ✅ What data they'll receive (response format)
- ✅ How to handle errors
- ✅ Code examples in multiple languages

---

## 📍 Route

**URL:** `/dashboard/docs`

**SHARED across ALL industries** (Hardware, Pharmacy, Grocery, Boutique)

---

## 🎨 Page Structure

### Layout:
```
┌─────────────────────────────────────────┐
│  [Sidebar]    [Main Content]            │
│  - Quick      ┌──────────────────────┐  │
│    Start      │  Documentation       │  │
│  - Auth       │  Content Here        │  │
│  - Endpoints  │                      │  │
│  - Errors     └──────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 📑 MAIN SECTIONS

### **1. QUICK START GUIDE** ⚡

**Purpose:** Get developers up and running in 3 steps

**Content:**

#### Step 1: Get Your API Key
```
Navigate to API Keys page and generate a new key.
Save it securely in your .env file:

API_KEY=daas_your_key_here
```

#### Step 2: Make Your First Request
```bash
curl -X GET "https://api.inventaapi.com/products" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### Step 3: Handle the Response
```javascript
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Portland Cement 40kg",
      "sku": "HW-CEM-001",
      "price": 285.00,
      "stock": 450
    }
  ]
}
```

---

### **2. AUTHENTICATION** 🔐

**Purpose:** Explain how to use API keys

**Content:**

#### How It Works:
- All API requests require authentication
- Use your API key in the `Authorization` header
- Format: `Bearer YOUR_API_KEY`

#### Header Format:
```
Authorization: Bearer daas_lqz8j2k_a8f9d3e2...
```

#### Example in Different Languages:

**JavaScript (fetch):**
```javascript
fetch('https://api.inventaapi.com/products', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
})
```

**Python (requests):**
```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY'
}
response = requests.get('https://api.inventaapi.com/products', headers=headers)
data = response.json()
```

**PHP (cURL):**
```php
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, 'https://api.inventaapi.com/products');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Authorization: Bearer YOUR_API_KEY'
]);
$response = curl_exec($ch);
```

**cURL:**
```bash
curl -X GET https://api.inventaapi.com/products \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### **3. API ENDPOINTS** 🔗

**Purpose:** List all available endpoints with details

---

#### **Endpoint 1: Get All Products**

**HTTP Method:** `GET`  
**URL:** `/api/products`  
**Description:** Retrieve the complete product catalog

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Filter by category (e.g., "construction") |
| `limit` | number | No | Number of results (default: 50, max: 100) |
| `offset` | number | No | Skip results for pagination (default: 0) |

**Example Request:**
```bash
GET /api/products?category=construction&limit=20
```

**Example Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Portland Cement 40kg",
      "sku": "HW-CEM-001",
      "category": "Construction Materials",
      "price": 285.00,
      "stock": 450,
      "barcode": "8906000123456",
      "businessType": "hardware"
    }
  ],
  "meta": {
    "total": 150,
    "limit": 20,
    "offset": 0
  }
}
```

**Code Examples:**

**JavaScript:**
```javascript
const response = await fetch('https://api.inventaapi.com/products?category=construction&limit=20', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
});
const data = await response.json();
console.log(data);
```

**Python:**
```python
import requests

url = "https://api.inventaapi.com/products"
params = {"category": "construction", "limit": 20}
headers = {"Authorization": "Bearer YOUR_API_KEY"}

response = requests.get(url, params=params, headers=headers)
data = response.json()
print(data)
```

---

#### **Endpoint 2: Get Single Product**

**HTTP Method:** `GET`  
**URL:** `/api/products/{id}`  
**Description:** Get details of a specific product by ID

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | Product ID |

**Example Request:**
```bash
GET /api/products/1
```

**Example Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Portland Cement 40kg",
    "sku": "HW-CEM-001",
    "category": "Construction Materials",
    "price": 285.00,
    "stock": 450,
    "barcode": "8906000123456",
    "businessType": "hardware",
    "description": "High-quality Portland cement for construction",
    "supplier": "ABC Cement Co.",
    "lastUpdated": "2024-12-20T10:30:00Z"
  }
}
```

---

#### **Endpoint 3: Search Products**

**HTTP Method:** `GET`  
**URL:** `/api/products/search`  
**Description:** Search products by name, SKU, or barcode

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `limit` | number | No | Results per page (default: 20) |

**Example Request:**
```bash
GET /api/products/search?q=cement&limit=10
```

**Example Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Portland Cement 40kg",
      "sku": "HW-CEM-001",
      "price": 285.00,
      "matchType": "name"
    }
  ],
  "meta": {
    "query": "cement",
    "resultsFound": 1
  }
}
```

---

#### **Endpoint 4: Get Categories**

**HTTP Method:** `GET`  
**URL:** `/api/categories`  
**Description:** Get list of all product categories

**Example Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Construction Materials",
      "slug": "construction",
      "productCount": 450
    },
    {
      "id": 2,
      "name": "Power Tools",
      "slug": "power-tools",
      "productCount": 180
    }
  ]
}
```

---

### **4. ERROR HANDLING** ⚠️

**Purpose:** Teach how to handle API errors

**Content:**

#### HTTP Status Codes:

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Invalid or missing API key |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

#### Error Response Format:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid or has been revoked",
    "details": "Please check your API key or generate a new one"
  }
}
```

#### Common Errors:

**1. Invalid API Key (401):**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key"
  }
}
```

**Solution:** Check your API key in the header

**2. Rate Limit Exceeded (429):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "You have exceeded your monthly quota of 5,000 requests"
  }
}
```

**Solution:** Upgrade your plan or wait for reset

**3. Resource Not Found (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Product with ID 9999 not found"
  }
}
```

**Solution:** Verify the product ID exists

#### Error Handling Code:

**JavaScript:**
```javascript
try {
  const response = await fetch('https://api.inventaapi.com/products', {
    headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
  });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API Error:', error.error.message);
    
    if (response.status === 401) {
      // Handle invalid API key
    } else if (response.status === 429) {
      // Handle rate limit
    }
  }
  
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error('Network Error:', error);
}
```

**Python:**
```python
import requests

try:
    response = requests.get(
        'https://api.inventaapi.com/products',
        headers={'Authorization': 'Bearer YOUR_API_KEY'}
    )
    response.raise_for_status()
    data = response.json()
    print(data)
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 401:
        print("Invalid API key")
    elif e.response.status_code == 429:
        print("Rate limit exceeded")
except Exception as e:
    print(f"Error: {e}")
```

---

## 🎨 Visual Design

### **Tabbed Code Examples:**
```
┌─────────────────────────────────────┐
│ [JavaScript] [Python] [PHP] [cURL] │ ← Tabs
├─────────────────────────────────────┤
│ fetch('https://api...', {           │ ← Code
│   headers: {                        │
│     'Authorization': 'Bearer ...'   │
│   }                                 │
│ })                                  │
│                               [📋]  │ ← Copy button
└─────────────────────────────────────┘
```

### **Response Examples:**
```
┌─────────────────────────────────────┐
│ ● Response Example    200 OK        │ ← Header
├─────────────────────────────────────┤
│ {                                   │ ← JSON
│   "success": true,                  │   (syntax highlighted)
│   "data": [...]                     │
│ }                                   │
└─────────────────────────────────────┘
```

---

## 💡 Additional Sections

### **5. RATE LIMITS**
- Starter: 50 requests/day
- Professional: 5,000 requests/month
- Enterprise: Unlimited

### **6. BEST PRACTICES**
- Cache responses when possible
- Use pagination for large datasets
- Handle errors gracefully
- Store API keys securely
- Use HTTPS only

### **7. WEBHOOKS** (Optional)
- Coming soon: Real-time notifications

### **8. SDKs** (Optional)
- JavaScript SDK
- Python SDK
- PHP SDK

---

## 🔄 User Flow

**Developer Journey:**

1. Opens Documentation page
2. Clicks "Quick Start"
3. Sees 3-step guide
4. Copies code example
5. Pastes in their IDE
6. Replaces `YOUR_API_KEY` with real key
7. Runs code
8. Gets response
9. Clicks "Endpoints" to see more options
10. Explores different endpoints
11. Clicks "Error Handling" to learn debugging
12. Successfully integrates API! ✅

---

## ✅ Implementation Checklist

**Must-Have Features:**
- [x] Sidebar navigation
- [x] Quick Start (3 steps)
- [x] Authentication guide
- [x] API Endpoints list
- [x] Code examples (4 languages minimum)
- [x] Tabbed code view
- [x] Copy code button
- [x] Response examples
- [x] Error handling guide
- [x] HTTP status codes table
- [x] Search functionality (optional)
- [x] Syntax highlighting
- [x] Mobile responsive

**Nice-to-Have:**
- [ ] Interactive API tester (sandbox)
- [ ] Downloadable Postman collection
- [ ] Video tutorials
- [ ] SDK downloads
- [ ] Changelog

---

## 🎯 Key Takeaway

**Ang Documentation page ay:**
1. **Tutorial** - Step-by-step guide
2. **Reference** - Complete API specs
3. **Examples** - Copy-paste ready code
4. **Troubleshooting** - Error handling

**Parang cookbook** - May recipes (code examples), ingredients list (endpoints), at cooking tips (best practices)! 👨‍🍳📖

---

**End of Documentation Page Specifications** 🎉
