# 🔄 SYSTEM FLOWCHART - B2B Product Catalog API Platform

## 📊 COMPLETE SYSTEM FLOW

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PUBLIC LANDING PAGE                          │
│                     https://inventaapi.com                          │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
            ┌───────▼────────┐          ┌────────▼────────┐
            │   SIGN UP      │          │     LOGIN       │
            │                │          │                 │
            │ • Email        │          │ • Email         │
            │ • Password     │          │ • Password      │
            │ • Business     │          │                 │
            └───────┬────────┘          └────────┬────────┘
                    │                            │
                    └──────────┬─────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  PRICING PAGE       │
                    │                     │
                    │ Choose Plan:        │
                    │ • Starter ($0)      │
                    │ • Professional ($)  │
                    │ • Enterprise        │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  SELECT INDUSTRY        │
                    │                         │
                    │ • 🔨 Hardware          │
                    │ • 💊 Pharmacy          │
                    │ • 🛒 Grocery           │
                    │ • 👗 Boutique          │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  SUBSCRIPTION MODAL     │
                    │                         │
                    │ 1. Fill Info           │
                    │    • Email             │
                    │    • Business Name     │
                    │    • Business Segment  │
                    │                        │
                    │ 2. Payment (if paid)   │
                    │    • GCash             │
                    │    • Maya              │
                    │    • Card              │
                    │    • Bank              │
                    │                        │
                    │ 3. Generate API Key    │
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │  REDIRECT TO DASHBOARD  │
                    │  Based on Industry:     │
                    │                         │
                    │ Hardware → /hardware    │
                    │ Pharmacy → /pharmacy    │
                    │ Grocery  → /grocery     │
                    │ Boutique → /boutique    │
                    └──────────┬──────────────┘
                               │
        ┏━━━━━━━━━━━━━━━━━━━━━━▼━━━━━━━━━━━━━━━━━━━━━━┓
        ┃                                               ┃
        ┃         CUSTOMER DASHBOARD (6 PAGES)          ┃
        ┃                                               ┃
        ┗━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━━━━━┛
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                             │
┌───────▼────────┐  ┌─────────┐  ┌──────────┐  ┌────────────┐
│ 1. OVERVIEW    │  │2.PRODUCTS│  │3.API KEYS│  │4.DOCS      │
│                │  │          │  │          │  │            │
│ • Welcome      │  │• Browse  │  │• Generate│  │• Quick     │
│ • Plan Badge   │  │• Search  │  │• View    │  │  Start     │
│ • Quota Bar    │  │• Filter  │  │• Copy    │  │• Auth      │
│ • Quick Copy   │  │• JSON    │  │• Revoke  │  │• Endpoints │
│ • 7-Day Chart  │  │  Preview │  │• Stats   │  │• Errors    │
│ • Categories   │  │          │  │          │  │            │
└───────┬────────┘  └─────┬────┘  └────┬─────┘  └─────┬──────┘
        │                 │            │              │
        └─────────┬───────┴────────────┴──────────────┘
                  │
        ┌─────────▼──────────┐  ┌────────────────┐
        │5.RECOMMENDATIONS   │  │6.ANALYTICS     │
        │                    │  │                │
        │ • AI Insights      │  │ • Traffic Chart│
        │ • Trending         │  │ • Breakdown    │
        │ • Inventory Tips   │  │ • Performance  │
        └────────────────────┘  └────────────────┘
```

---

## 🔐 AUTHENTICATION FLOW

```
┌─────────────────────────────────────────────────────────────┐
│                   USER AUTHENTICATION                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  Firebase Auth      │
        │                     │
        │ • Email/Password    │
        │ • OAuth (Google)    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │  Check User Role    │
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│   CUSTOMER     │   │     ADMIN       │
│   Dashboard    │   │     Dashboard   │
│                │   │                 │
│ /dashboard/    │   │ /admin/         │
│  [industry]    │   │  (All access)   │
└────────────────┘   └─────────────────┘
```

---

## 🔑 API KEY GENERATION FLOW

```
┌─────────────────────────────────────────────────────────────┐
│              USER GENERATES API KEY                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │ Click "Generate     │
        │  New Key" button    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Enter Key Name      │
        │ "Production Server" │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Server Generates:   │
        │                     │
        │ daas_[timestamp]_   │
        │   [random32chars]   │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Save to Firestore:  │
        │                     │
        │ • key               │
        │ • name              │
        │ • userId            │
        │ • createdAt         │
        │ • status: active    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Show Key ONCE       │
        │ (One-time display)  │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ User Copies Key     │
        │ Stores in .env      │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Ready to use API!   │
        └─────────────────────┘
```

---

## 📡 API REQUEST FLOW

```
┌─────────────────────────────────────────────────────────────┐
│           CUSTOMER'S APPLICATION MAKES API CALL              │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼──────────────┐
        │ HTTP Request:           │
        │                         │
        │ GET /api/products       │
        │ Header:                 │
        │   Authorization:        │
        │   Bearer daas_key...    │
        └──────────┬──────────────┘
                   │
        ┌──────────▼──────────────┐
        │ API Server              │
        │ (Backend)               │
        └──────────┬──────────────┘
                   │
        ┌──────────▼──────────────┐
        │ Validate API Key        │
        └──────────┬──────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   ┌────▼─────┐         ┌─────▼─────┐
   │ VALID    │         │ INVALID   │
   │ Key ✓    │         │ Key ✗     │
   └────┬─────┘         └─────┬─────┘
        │                     │
        │              ┌──────▼──────┐
        │              │ Return:     │
        │              │ 401         │
        │              │ Unauthorized│
        │              └─────────────┘
        │
┌───────▼───────┐
│ Check Quota   │
└───────┬───────┘
        │
┌───────┴───────┐
│               │
┌▼───────────┐  │
│ Within     │  │
│ Quota ✓    │  │
└┬───────────┘  │
 │              │
 │         ┌────▼────────┐
 │         │ Exceeded    │
 │         │ Quota ✗     │
 │         └────┬────────┘
 │              │
 │       ┌──────▼──────┐
 │       │ Return:     │
 │       │ 429         │
 │       │ Rate Limit  │
 │       └─────────────┘
 │
┌▼──────────────┐
│ Query Database│
└┬──────────────┘
 │
┌▼──────────────┐
│ Filter by     │
│ Business Type │
│ (if SME)      │
└┬──────────────┘
 │
┌▼──────────────┐
│ Return Data:  │
│               │
│ 200 OK        │
│ {             │
│   success:true│
│   data: [...]│
│ }             │
└┬──────────────┘
 │
┌▼──────────────┐
│ Update Stats: │
│               │
│ • requestsUsed│
│ • lastUsed    │
└───────────────┘
```

---

## 🏢 INDUSTRY-SPECIFIC ROUTING

```
┌─────────────────────────────────────────────────────────────┐
│              USER SELECTS BUSINESS SEGMENT                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │ During Subscription │
        │ Choose Industry:    │
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│   HARDWARE     │   │    PHARMACY     │
│   Selected     │   │    Selected     │
└───────┬────────┘   └────────┬────────┘
        │                     │
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│ Save to DB:    │   │ Save to DB:     │
│ businessSegment│   │ businessSegment │
│ = "hardware"   │   │ = "pharmacy"    │
└───────┬────────┘   └────────┬────────┘
        │                     │
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│ Redirect to:   │   │ Redirect to:    │
│ /dashboard/    │   │ /dashboard/     │
│  hardware      │   │  pharmacy       │
└───────┬────────┘   └────────┬────────┘
        │                     │
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│ OVERVIEW PAGE  │   │ OVERVIEW PAGE   │
│                │   │                 │
│ Theme: Orange  │   │ Theme: Green    │
│ Icon: Hammer   │   │ Icon: Pill      │
│ Greeting:      │   │ Greeting:       │
│ "Builder"      │   │ "Doctor"        │
│                │   │                 │
│ Categories:    │   │ Categories:     │
│ • Construction │   │ • Prescription  │
│ • Tools        │   │ • OTC Medicine  │
│ • Electrical   │   │ • Supplements   │
│ • Plumbing     │   │ • Medical       │
└────────────────┘   └─────────────────┘

        (Same pattern for Grocery & Boutique)
```

---

## 📊 DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│               (Next.js Dashboard)                            │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ API Calls
                   │
        ┌──────────▼──────────┐
        │    BACKEND API      │
        │   (Node.js/Express) │
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼────────┐   ┌────────▼────────┐
│   FIRESTORE    │   │   FIREBASE      │
│   (Database)   │   │   AUTH          │
│                │   │                 │
│ Collections:   │   │ • Users         │
│ • users        │   │ • Sessions      │
│ • api_keys     │   │ • Tokens        │
│ • products     │   │                 │
│ • categories   │   │                 │
│ • requests_log │   │                 │
└────────────────┘   └─────────────────┘
```

---

## 🎯 USER JOURNEY MAP

```
DAY 1: DISCOVERY & SIGNUP
┌─────────────────────────────────────────────────────────────┐
│ 1. Visit landing page → Learn about API                     │
│ 2. Click "Get Started" → See pricing                        │
│ 3. Choose Professional Plan ($1,499/mo)                     │
│ 4. Select "Hardware" industry                               │
│ 5. Fill subscription form                                   │
│ 6. Complete payment via GCash                               │
│ 7. Receive API key (shown once)                             │
│ 8. Redirected to /dashboard/hardware                        │
└─────────────────────────────────────────────────────────────┘

DAY 1: ONBOARDING
┌─────────────────────────────────────────────────────────────┐
│ 9. See Overview page (orange theme, "Builder" greeting)     │
│ 10. Copy API key from Quick Actions                         │
│ 11. Click "Documentation" → Read Quick Start                │
│ 12. Copy code example (JavaScript)                          │
│ 13. Paste in their POS system code                          │
│ 14. Replace YOUR_API_KEY with real key                      │
└─────────────────────────────────────────────────────────────┘

DAY 2-7: INTEGRATION
┌─────────────────────────────────────────────────────────────┐
│ 15. Test API calls from local environment                   │
│ 16. Check Products page → Browse hardware catalog           │
│ 17. Click "View JSON" → See data structure                  │
│ 18. Integrate into inventory system                         │
│ 19. Handle errors using Error Handling guide                │
│ 20. Deploy to production server                             │
└─────────────────────────────────────────────────────────────┘

WEEK 2+: REGULAR USAGE
┌─────────────────────────────────────────────────────────────┐
│ 21. Check Overview → Monitor quota usage                    │
│ 22. View 7-day chart → Analyze API traffic                  │
│ 23. Check Recommendations → Discover trending products      │
│ 24. View Analytics → Detailed performance reports           │
│ 25. Generate additional keys for staging/mobile             │
└─────────────────────────────────────────────────────────────┘

MONTH 2+: OPTIMIZATION
┌─────────────────────────────────────────────────────────────┐
│ 26. Review usage patterns in Analytics                      │
│ 27. Optimize API calls based on insights                    │
│ 28. Consider upgrading to higher plan if needed             │
│ 29. Refer to documentation for advanced features            │
│ 30. Contact support for custom requirements                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 FULL SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                      USERS / CLIENTS                         │
│          (SMEs: Hardware, Pharmacy, Grocery, Boutique)      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HTTPS
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                  FRONTEND LAYER                              │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Landing   │  │  Dashboard │  │   Admin    │           │
│  │   Page     │  │  (6 Pages) │  │   Panel    │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│                                                              │
│  Technology: Next.js 16, React 19, TailwindCSS 4           │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ REST API
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                  BACKEND API LAYER                           │
│                                                              │
│  Endpoints:                                                  │
│  • POST   /api/auth/login                                   │
│  • POST   /api/auth/register                                │
│  • GET    /api/products                                     │
│  • GET    /api/products/:id                                 │
│  • GET    /api/products/search                              │
│  • POST   /api/keys/generate                                │
│  • DELETE /api/keys/:id                                     │
│  • GET    /api/analytics                                    │
│                                                              │
│  Middleware:                                                 │
│  • Authentication                                            │
│  • Rate Limiting                                             │
│  • CORS                                                      │
│  • Logging                                                   │
│                                                              │
│  Technology: Node.js, Express                               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                  DATABASE LAYER                              │
│                                                              │
│  ┌────────────────────┐  ┌────────────────────┐            │
│  │  FIRESTORE DB      │  │  FIREBASE AUTH     │            │
│  │                    │  │                    │            │
│  │  • users           │  │  • Authentication  │            │
│  │  • api_keys        │  │  • Sessions        │            │
│  │  • products        │  │  • OAuth           │            │
│  │  • categories      │  │                    │            │
│  │  • requests_log    │  │                    │            │
│  └────────────────────┘  └────────────────────┘            │
│                                                              │
│  Technology: Google Firebase                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 ANALYTICS TRACKING FLOW

```
┌─────────────────────────────────────────────────────────────┐
│              USER MAKES API REQUEST                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │ Log Request:        │
        │                     │
        │ • timestamp         │
        │ • userId            │
        │ • apiKeyId          │
        │ • endpoint          │
        │ • method            │
        │ • statusCode        │
        │ • responseTime      │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Save to Firestore   │
        │ Collection:         │
        │ "requests_log"      │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Update User Stats:  │
        │                     │
        │ • requestsUsed++    │
        │ • lastUsed = now    │
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────┐
        │ Analytics Dashboard │
        │ Queries Logs:       │
        │                     │
        │ • 7-day chart       │
        │ • Top endpoints     │
        │ • Error rates       │
        │ • Response times    │
        └─────────────────────┘
```

---

## 🎨 THEME SWITCHING FLOW

```
┌─────────────────────────────────────────────────────────────┐
│         USER'S BUSINESS SEGMENT DETERMINES THEME             │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │ Read from Database: │
        │ user.businessSegment│
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┬──────────┬──────────┐
        │                     │          │          │
┌───────▼────────┐   ┌────────▼──┐  ┌───▼───┐  ┌──▼─────┐
│   "hardware"   │   │"pharmacy" │  │"grocery"│ │"boutique"│
└───────┬────────┘   └────────┬──┘  └───┬───┘  └──┬─────┘
        │                     │          │          │
┌───────▼────────┐   ┌────────▼──┐  ┌───▼───┐  ┌──▼─────┐
│ Apply Theme:   │   │Apply Theme│  │ Apply  │  │ Apply  │
│ • Orange       │   │• Green    │  │ • Blue │  │• Pink  │
│ • Hammer icon  │   │• Pill icon│  │• Cart  │  │• Shirt │
│ • "Builder"    │   │• "Doctor" │  │•"Retailr"│ │•"Designr"│
│ • Hardware cat.│   │• Med. cat.│  │• Food  │  │• Fashion│
└────────────────┘   └───────────┘  └────────┘  └────────┘
```

---

**End of System Flowchart** 🎉

