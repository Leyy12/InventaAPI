# 📐 InventaAPI System Architecture Diagram

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│                     http://localhost:3000                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐      ┌──────────────────┐                   │
│  │  Product Catalog │      │  API Playground  │                   │
│  │    /products     │──┐   │  /api-playground │                   │
│  └──────────────────┘  │   └──────────────────┘                   │
│                         │                                            │
│  User selects products  │   User tests API with generated key       │
│  Builds cart summary    │   Views live response                     │
│  [1,2,3,4,5...]        │   Downloads JSON                          │
│                         │                                            │
└─────────────────────────┼──────────────────────────────────────────┘
                          │
                          ▼
                  Generate API Key
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js)                           │
│                    http://localhost:5001                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              POST /api/v1/generate-key                      │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ 1. Create API Key in database                        │  │   │
│  │  │ 2. Link selected products to API key                 │  │   │
│  │  │ 3. Return: daas_abc123...                            │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │             GET /api/v1/products (PROTECTED)                │   │
│  │  ┌──────────────────────────────────────────────────────┐  │   │
│  │  │ ┌─────────────────────────────────────────────┐      │  │   │
│  │  │ │  verifyApiKeyMiddleware                      │      │  │   │
│  │  │ ├─────────────────────────────────────────────┤      │  │   │
│  │  │ │ 1. Extract API key from header              │      │  │   │
│  │  │ │ 2. Query: SELECT FROM api_keys WHERE...     │      │  │   │
│  │  │ │ 3. Verify: status, expiration, rate limit   │      │  │   │
│  │  │ │ 4. Query: SELECT product_id FROM            │      │  │   │
│  │  │ │           api_key_products WHERE...         │      │  │   │
│  │  │ │ 5. Attach authorizedProductIds to req       │      │  │   │
│  │  │ └─────────────────────────────────────────────┘      │  │   │
│  │  │                                                        │  │   │
│  │  │ ┌─────────────────────────────────────────────┐      │  │   │
│  │  │ │  Route Handler                               │      │  │   │
│  │  │ ├─────────────────────────────────────────────┤      │  │   │
│  │  │ │ 1. Get authorizedProductIds from req        │      │  │   │
│  │  │ │ 2. Query: SELECT * FROM products            │      │  │   │
│  │  │ │           WHERE id = ANY([1,2,3...])        │      │  │   │
│  │  │ │           AND is_active = true              │      │  │   │
│  │  │ │ 3. Return filtered products JSON            │      │  │   │
│  │  │ └─────────────────────────────────────────────┘      │  │   │
│  │  │                                                        │  │   │
│  │  │ ┌─────────────────────────────────────────────┐      │  │   │
│  │  │ │  Async: Log & Track (don't wait)            │      │  │   │
│  │  │ ├─────────────────────────────────────────────┤      │  │   │
│  │  │ │ - INSERT INTO api_usage_logs               │      │  │   │
│  │  │ │ - UPDATE api_keys SET requests_used_today++ │      │  │   │
│  │  │ └─────────────────────────────────────────────┘      │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  DATABASE (PostgreSQL)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │   products   │    │  api_keys    │    │ api_key_products │    │
│  ├──────────────┤    ├──────────────┤    ├──────────────────┤    │
│  │ id (PK)      │    │ id (PK)      │    │ id (PK)          │    │
│  │ sku          │    │ user_id (FK) │    │ api_key_id (FK)  │────┐
│  │ name         │    │ api_key      │    │ product_id (FK)  │    │
│  │ segment      │◄───┤ status       │    │ can_read         │    │
│  │ price        │    │ rate_limit   │    └──────────────────┘    │
│  │ stock        │    │ requests_used│                             │
│  │ is_active    │    └──────────────┘                             │
│  └──────────────┘                                                  │
│        ▲                                                            │
│        │                                                            │
│        └────────────────────────────────────────────────────────────┤
│                    JUNCTION TABLE MAGIC                             │
│     Maps API Keys to Specific Products (Authorization Layer)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow Sequence

### Sequence 1: Product Selection & API Key Generation

```
User                 Frontend              Backend               Database
 │                      │                      │                     │
 │  1. Browse Products  │                      │                     │
 ├─────────────────────>│                      │                     │
 │                      │  2. GET /products    │                     │
 │                      ├─────────────────────>│                     │
 │                      │                      │  3. SELECT *        │
 │                      │                      ├────────────────────>│
 │                      │                      │  4. Return all      │
 │                      │                      │<────────────────────┤
 │                      │  5. Return products  │                     │
 │                      │<─────────────────────┤                     │
 │                      │                      │                     │
 │  6. Select Products  │                      │                     │
 │  [1, 2, 3, 4, 5]     │                      │                     │
 ├─────────────────────>│                      │                     │
 │                      │                      │                     │
 │  7. Generate Key     │                      │                     │
 ├─────────────────────>│  8. POST /gen-key    │                     │
 │                      ├─────────────────────>│                     │
 │                      │  {products: [1,2,3]} │                     │
 │                      │                      │  9. INSERT api_keys │
 │                      │                      ├────────────────────>│
 │                      │                      │  10. Get new_id     │
 │                      │                      │<────────────────────┤
 │                      │                      │  11. INSERT (LOOP)  │
 │                      │                      │  api_key_products   │
 │                      │                      │  (new_id, 1)        │
 │                      │                      ├────────────────────>│
 │                      │                      │  (new_id, 2)        │
 │                      │                      ├────────────────────>│
 │                      │                      │  (new_id, 3)        │
 │                      │                      ├────────────────────>│
 │                      │                      │  12. Success        │
 │                      │                      │<────────────────────┤
 │                      │  13. Return API key  │                     │
 │                      │  daas_abc123...      │                     │
 │                      │<─────────────────────┤                     │
 │  14. Display Key     │                      │                     │
 │<─────────────────────┤                      │                     │
```

### Sequence 2: API Request & Product Filtering

```
Developer App        API Endpoint         Middleware          Database
     │                    │                    │                  │
     │  1. GET /products  │                    │                  │
     │  Header:           │                    │                  │
     │  Authorization:    │                    │                  │
     │  Bearer daas_...   │                    │                  │
     ├───────────────────>│                    │                  │
     │                    │  2. Verify Key     │                  │
     │                    ├───────────────────>│                  │
     │                    │                    │  3. SELECT       │
     │                    │                    │  FROM api_keys   │
     │                    │                    ├─────────────────>│
     │                    │                    │  4. Key exists?  │
     │                    │                    │<─────────────────┤
     │                    │                    │  ✓ Active        │
     │                    │                    │  ✓ Not expired   │
     │                    │                    │  ✓ Under limit   │
     │                    │                    │                  │
     │                    │                    │  5. SELECT       │
     │                    │                    │  product_id FROM │
     │                    │                    │  api_key_products│
     │                    │                    ├─────────────────>│
     │                    │                    │  6. [1,2,3,4,5]  │
     │                    │                    │<─────────────────┤
     │                    │  7. Attach to req  │                  │
     │                    │  authorizedIds     │                  │
     │                    │<───────────────────┤                  │
     │                    │                    │                  │
     │                    │  8. Query products │                  │
     │                    │  WHERE id IN       │                  │
     │                    │  (1,2,3,4,5)       │                  │
     │                    ├────────────────────┼─────────────────>│
     │                    │                    │  9. Return only  │
     │                    │                    │  those 5 products│
     │                    │<───────────────────┼──────────────────┤
     │                    │                    │                  │
     │                    │  10. (Async)       │                  │
     │                    │  Log request       │                  │
     │                    ├────────────────────┼─────────────────>│
     │                    │  Increment counter │                  │
     │                    ├────────────────────┼─────────────────>│
     │                    │                    │                  │
     │  11. JSON Response │                    │                  │
     │  {                 │                    │                  │
     │    products: [     │                    │                  │
     │      {id:1, ...},  │                    │                  │
     │      {id:2, ...},  │                    │                  │
     │      ...           │                    │                  │
     │    ]               │                    │                  │
     │  }                 │                    │                  │
     │<───────────────────┤                    │                  │
```

---

## 🔐 Authorization Matrix

```
┌────────────────────────────────────────────────────────────────────┐
│                    AUTHORIZATION DECISION TREE                     │
└────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────┐
                    │  Incoming Request│
                    │  with API Key    │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  API Key exists  │
                    │  in database?    │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │ NO                          │ YES
              ▼                             ▼
     ┌────────────────┐          ┌──────────────────┐
     │ 401 Unauthorized│          │  Check status    │
     │ "Invalid key"  │          └────────┬─────────┘
     └────────────────┘                   │
                              ┌───────────┼───────────┐
                              │ SUSPENDED │ ACTIVE    │
                              ▼                       ▼
                     ┌────────────────┐   ┌──────────────────┐
                     │ 403 Forbidden  │   │  Check expiration│
                     │ "Key suspended"│   └────────┬─────────┘
                     └────────────────┘            │
                                        ┌──────────┼──────────┐
                                        │ EXPIRED  │ VALID    │
                                        ▼                     ▼
                               ┌────────────────┐  ┌──────────────────┐
                               │ 403 Forbidden  │  │  Check rate limit│
                               │ "Key expired"  │  └────────┬─────────┘
                               └────────────────┘           │
                                               ┌────────────┼────────────┐
                                               │ EXCEEDED   │ OK         │
                                               ▼                         ▼
                                      ┌────────────────┐     ┌──────────────────┐
                                      │ 429 Too Many   │     │ Get authorized   │
                                      │ Requests       │     │ product IDs      │
                                      └────────────────┘     └────────┬─────────┘
                                                                      │
                                                         ┌────────────▼────────────┐
                                                         │ Filter products         │
                                                         │ WHERE id = ANY([...])   │
                                                         └────────────┬────────────┘
                                                                      │
                                                         ┌────────────▼────────────┐
                                                         │ 200 OK                  │
                                                         │ Return filtered products│
                                                         └─────────────────────────┘
```

---

## 📊 Database Relationships (ERD)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Entity Relationship Diagram                  │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │    users     │
    ├──────────────┤
    │ id (PK)      │
    │ firebase_uid │
    │ email        │
    │ business_name│
    │ plan         │
    │ role         │
    └──────┬───────┘
           │ 1
           │
           │ has many
           │
           │ N
    ┌──────▼───────┐
    │  api_keys    │
    ├──────────────┤
    │ id (PK)      │
    │ user_id (FK) │───────┐
    │ api_key      │       │
    │ key_name     │       │
    │ status       │       │ 1
    │ rate_limit   │       │
    │ requests_used│       │ has many
    │ expires_at   │       │
    └──────────────┘       │ N
                           │
                    ┌──────▼──────────────┐
                    │ api_key_products    │
                    │   (JUNCTION TABLE)  │
                    ├─────────────────────┤
                    │ id (PK)             │
                    │ api_key_id (FK)     │
                    │ product_id (FK)     │
                    │ can_read            │
                    │ can_update          │
                    └──────────┬──────────┘
                               │ N
                               │
                               │ references
                               │
                               │ 1
                        ┌──────▼──────┐
                        │  products   │
                        ├─────────────┤
                        │ id (PK)     │
                        │ sku         │
                        │ name        │
                        │ segment     │
                        │ category    │
                        │ price       │
                        │ stock       │
                        │ metadata    │
                        │ is_active   │
                        └─────────────┘


RELATIONSHIPS:
• users → api_keys: One-to-Many (1:N)
  A user can have multiple API keys

• api_keys → api_key_products: One-to-Many (1:N)
  An API key can access multiple products

• products → api_key_products: One-to-Many (1:N)
  A product can be accessed by multiple API keys

• api_key_products: Many-to-Many Junction Table
  Links API keys to specific products for authorization
```

---

## 🎮 API Playground Component Tree

```
┌────────────────────────────────────────────────────────────────┐
│              API Playground Page Component                     │
└────────────────────────────────────────────────────────────────┘

api-playground/page.tsx
│
├─ State Management
│  ├─ apiKey: string
│  ├─ endpoint: string
│  ├─ queryParams: object
│  ├─ response: ApiResponse | null
│  ├─ loading: boolean
│  ├─ responseTime: number | null
│  ├─ copied: boolean
│  └─ expandedProduct: number | null
│
├─ Functions
│  ├─ buildApiUrl(): string
│  ├─ executeRequest(): Promise<void>
│  ├─ copyToClipboard(text: string): void
│  └─ getCodeExample(language: string): string
│
└─ UI Layout
   │
   ├─ Header Section
   │  ├─ Title: "API Playground"
   │  └─ Actions: Clear button
   │
   ├─ Info Banner (conditional)
   │  └─ Shows if products are pre-selected
   │
   └─ Two-Column Grid
      │
      ├─ LEFT PANEL
      │  │
      │  ├─ Request Configuration Card
      │  │  ├─ API Key Input (with icon)
      │  │  ├─ Endpoint Dropdown
      │  │  ├─ Query Parameters (conditional)
      │  │  │  ├─ Segment filter
      │  │  │  ├─ Category filter
      │  │  │  ├─ Search input
      │  │  │  └─ Pagination (limit, offset)
      │  │  └─ Execute Button (with loading state)
      │  │
      │  └─ Code Examples Card
      │     ├─ Language Tabs (JS, Python, cURL, PHP)
      │     ├─ Code Block (syntax highlighted)
      │     └─ Copy Button
      │
      └─ RIGHT PANEL
         │
         └─ Response Card
            ├─ Header (with response time badge)
            │
            ├─ Empty State (if no response)
            │  ├─ Play icon
            │  └─ Placeholder text
            │
            └─ Response Display (if response exists)
               ├─ Status Banner (success/error)
               │
               ├─ API Key Info Panel
               │  ├─ Business name
               │  ├─ Plan tier
               │  └─ Authorized products count
               │
               ├─ Pagination Info
               │  ├─ Total products
               │  ├─ Returned count
               │  └─ Limit/offset
               │
               ├─ Products List
               │  └─ For each product:
               │     ├─ Segment badge
               │     ├─ Name & SKU
               │     └─ Expandable JSON details
               │
               ├─ Raw JSON Display
               │  ├─ Syntax highlighted
               │  └─ Copy button
               │
               └─ Download Button
```

---

**InventaAPI - Complete System Architecture** 🚀
