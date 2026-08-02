# InventaAPI - Final Architecture Summary
## Admin Panel Separation Project - Complete Documentation

---

## 🎯 Project Overview

Successfully separated the admin panel from the customer dashboard into two independent Next.js applications running on different ports to eliminate authentication state conflicts and improve security isolation.

---

## 📐 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND API SERVER                          │
│                      (Node.js + Express)                            │
│                       Port: 5000                                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  Firebase Admin SDK                                       │     │
│  │  - Token Verification (/api/v1/auth/verify-token)       │     │
│  │  - Custom Token Generation                               │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │  Product API (/api/v1/products)                          │     │
│  │  - Firestore Integration                                 │     │
│  │  - Business Type Filtering                               │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                     │
│  CORS: ['http://localhost:3000', 'http://localhost:3001']         │
└─────────────────────────────────────────────────────────────────────┘
                            ▲                    ▲
                            │                    │
                 ┌──────────┴────────┐  ┌───────┴──────────┐
                 │                   │  │                   │
    ┌────────────────────────┐      │  │      ┌────────────────────────┐
    │  CUSTOMER DASHBOARD    │      │  │      │     ADMIN PANEL        │
    │     (Next.js App)      │      │  │      │    (Next.js App)       │
    │   Port: 3000           │◄─────┘  └─────►│   Port: 3001           │
    │                        │                 │                        │
    │  Theme: Indigo         │                 │  Theme: Red            │
    │  Routes:               │                 │  Routes:               │
    │    /                   │                 │    /                   │
    │    /signup             │                 │    /product-requests   │
    │    /dashboard/*        │                 │    /products/[ind...]  │
    │                        │                 │    /audit              │
    │  Firebase Client SDK   │                 │  /categories           │
    │  - Authentication      │                 │  /consumers            │
    │  - Firestore           │                 │  /security             │
    │                        │                 │  /settings             │
    │  Auth Context:         │                 │                        │
    │  - Customer/Developer  │                 │  Admin Auth Context:   │
    │  - Subscription Check  │                 │  - Admin Only          │
    │                        │                 │  - Token Bridge Auth   │
    └────────────────────────┘                 └────────────────────────┘
                 │                                          ▲
                 │                                          │
                 │     TOKEN BRIDGE (Admin Login)          │
                 └──────────────────────────────────────────┘
                   1. Admin logs in on :3000
                   2. Generate Firebase ID Token
                   3. Redirect to :3001?authToken=...
                   4. Verify token via backend
                   5. Get custom token
                   6. signInWithCustomToken()
                   7. Admin session established on :3001
```

---

## 🗂️ Project Structure

```
APIinventaB2-backup/APIinventaB2/
│
├── server.js                          # Backend API (Port 5000)
├── routes/
│   └── auth.js                        # Token verification endpoint
│
├── dashboard/                         # Customer Dashboard (Port 3000)
│   ├── package.json
│   ├── next.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── signup/               # Customer registration
│   │   │   └── dashboard/            # Customer routes
│   │   │       ├── page.tsx          # Overview
│   │   │       ├── products/         # Product catalog
│   │   │       ├── api-keys/         # API key management
│   │   │       ├── docs/             # Documentation
│   │   │       └── analytics/        # Usage analytics
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx       # Customer sidebar (indigo theme)
│   │   │   │   └── Navbar.tsx
│   │   │   └── auth/
│   │   │       └── LoginModal.tsx    # Token bridge redirect logic
│   │   └── lib/
│   │       └── firebase/
│   │           ├── config.ts         # Firebase client config
│   │           └── auth-context.tsx  # Customer auth (no admin logic)
│   └── .env.local
│
└── admin-panel/                       # Admin Panel (Port 3001)
    ├── package.json
    ├── next.config.ts                 # Custom port: 3001
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx             # Root layout with AdminAuthProvider
    │   │   ├── page.tsx               # Admin dashboard homepage
    │   │   ├── product-requests/      # Crowdsourcing management
    │   │   ├── products/
    │   │   │   └── [industry]/        # Industry catalogs
    │   │   ├── audit/                 # Audit logs (coming soon)
    │   │   ├── categories/            # Category management
    │   │   ├── consumers/             # API consumer management
    │   │   ├── security/              # Security center
    │   │   └── settings/              # System settings
    │   ├── components/
    │   │   ├── layout/
    │   │   │   ├── AdminSidebar.tsx   # Admin sidebar (red theme)
    │   │   │   ├── AdminNavbar.tsx
    │   │   │   └── AdminLayoutWrapper.tsx
    │   │   └── admin/
    │   │       ├── AdminStats.tsx
    │   │       ├── AdminProductTable.tsx
    │   │       └── ErrorState.tsx
    │   └── lib/
    │       └── firebase/
    │           ├── config.ts          # Firebase client config
    │           └── admin-auth-context.tsx  # Token bridge auth
    └── .env.local
```

---

## 🔐 Authentication Flow

### Customer Login Flow
```
1. User visits http://localhost:3000
2. Clicks "Login" → LoginModal opens
3. Enters email + password
4. Firebase Auth validates credentials
5. Fetches user document from Firestore
6. If role !== "admin":
   → Show "Login successful!"
   → Close modal
   → Stay on localhost:3000
   → Access /dashboard if subscription active
```

### Admin Login Flow (Token Bridge)
```
1. User visits http://localhost:3000
2. Clicks "Login" → LoginModal opens
3. Enters email + password
4. Firebase Auth validates credentials
5. Fetches user document from Firestore
6. If role === "admin":
   → Generate Firebase ID Token (1 hour validity)
   → Redirect to: http://localhost:3001/?authToken=<ID_TOKEN>
   
7. Admin panel receives token in URL
8. Extracts token from query params
9. Sends token to backend: POST /api/v1/auth/verify-token
10. Backend verifies token via Firebase Admin SDK
11. Backend generates custom token (1 hour validity)
12. Admin panel receives custom token
13. Calls signInWithCustomToken(customToken)
14. Firebase Auth session established on localhost:3001
15. Remove token from URL (clean URL bar)
16. Redirect to admin dashboard (/)
17. Admin session active ✅
```

---

## 🌐 Complete URL Reference

### Backend API
| Endpoint | Method | Description |
|----------|--------|-------------|
| `http://localhost:5000/api/v1/products` | GET | Fetch products (with filters) |
| `http://localhost:5000/api/v1/auth/verify-token` | POST | Verify ID token, return custom token |

### Customer Dashboard (Port 3000)
| URL | Description | Auth Required | Subscription Required |
|-----|-------------|---------------|----------------------|
| `http://localhost:3000/` | Landing page | No | No |
| `http://localhost:3000/?view=landing` | Landing page (bypass redirect) | No | No |
| `http://localhost:3000/signup` | Customer registration | No | No |
| `http://localhost:3000/dashboard` | Dashboard overview | Yes | Yes |
| `http://localhost:3000/dashboard/products` | Product catalog | Yes | Yes |
| `http://localhost:3000/dashboard/api-keys` | API key management | Yes | Yes |
| `http://localhost:3000/dashboard/docs` | API documentation | Yes | Yes |
| `http://localhost:3000/dashboard/analytics` | Usage analytics | Yes | Yes |

### Admin Panel (Port 3001)
| URL | Description | Auth Required | Admin Role Required |
|-----|-------------|---------------|---------------------|
| `http://localhost:3001/` | Admin dashboard | Yes | Yes |
| `http://localhost:3001/product-requests` | Product request management | Yes | Yes |
| `http://localhost:3001/products/hardware` | Hardware catalog | Yes | Yes |
| `http://localhost:3001/products/pharmacy` | Pharmacy catalog | Yes | Yes |
| `http://localhost:3001/products/grocery` | Grocery catalog | Yes | Yes |
| `http://localhost:3001/products/clothing` | Clothing catalog | Yes | Yes |
| `http://localhost:3001/audit` | Audit logs (coming soon) | Yes | Yes |
| `http://localhost:3001/categories` | Category management | Yes | Yes |
| `http://localhost:3001/consumers` | API consumer management | Yes | Yes |
| `http://localhost:3001/security` | Security center | Yes | Yes |
| `http://localhost:3001/settings` | System settings | Yes | Yes |

---

## 🎨 Theme & Branding

### Customer Dashboard (Indigo Theme)
- Primary color: `indigo-500` / `#6366f1`
- Accent color: `purple-600` / `#9333ea`
- Sidebar label: "SME Consumer"
- Button style: `bg-indigo-600 hover:bg-indigo-700`
- Active nav: `bg-indigo-500/10 text-indigo-400`

### Admin Panel (Red Theme)
- Primary color: `red-500` / `#ef4444`
- Accent color: `red-600` / `#dc2626`
- Sidebar label: "Super Admin"
- Button style: `bg-red-600 hover:bg-red-700`
- Active nav: `bg-red-500/10 text-red-400`
- Header: "Super Admin Control Panel"

---

## 🔑 Environment Variables

### Backend (.env)
```env
PORT=5000

# Firebase Admin SDK
FIREBASE_PROJECT_ID=inventaapi-db
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xyz@inventaapi-db.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw...\n-----END PRIVATE KEY-----\n"

# Firestore
FIRESTORE_EMULATOR_HOST=  # Leave empty for production Firestore
```

### Customer Dashboard (.env.local)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyC...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=inventaapi-db.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=inventaapi-db
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=inventaapi-db.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

NEXT_PUBLIC_API_URL=http://localhost:5000
```

### Admin Panel (.env.local)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyC...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=inventaapi-db.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=inventaapi-db
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=inventaapi-db.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

NEXT_PUBLIC_API_URL=http://localhost:5000
```

---

## 🚀 Deployment Considerations

### Local Development
- ✅ Backend: `http://localhost:5000`
- ✅ Customer Dashboard: `http://localhost:3000`
- ✅ Admin Panel: `http://localhost:3001`
- ✅ CORS configured for both frontend origins

### Production Deployment (Recommendations)

#### Option 1: Separate Domains
```
Backend:             https://api.inventaapi.com
Customer Dashboard:  https://app.inventaapi.com
Admin Panel:         https://admin.inventaapi.com
```

**Token Bridge Update:**
```typescript
// LoginModal.tsx
const adminUrl = `https://admin.inventaapi.com/?authToken=${idToken}`;
```

**Backend CORS Update:**
```javascript
// server.js
app.use(cors({
  origin: ['https://app.inventaapi.com', 'https://admin.inventaapi.com'],
  credentials: true
}));
```

#### Option 2: Subpaths (Not Recommended)
```
https://inventaapi.com/app         (Customer Dashboard)
https://inventaapi.com/admin       (Admin Panel)
```
⚠️ **Problem:** Defeats the purpose of separation — still shares same origin, potential auth conflicts.

---

## 🔒 Security Considerations

### Token Security
- ✅ Firebase ID tokens expire after 1 hour (non-configurable)
- ✅ Custom tokens expire after 1 hour (Firebase default)
- ✅ Tokens passed via URL query param (acceptable for local dev)
- ⚠️ **Production:** Consider POST request with body instead of URL param

### CORS Configuration
- ✅ Backend explicitly whitelists both frontend origins
- ✅ Credentials enabled for cookie-based sessions (future use)
- ⚠️ **Production:** Update CORS origins to production URLs

### Session Management
- ✅ Each app maintains independent Firebase Auth session
- ✅ Sessions stored in browser's IndexedDB/localStorage (per origin)
- ✅ No session sharing between `localhost:3000` and `localhost:3001`
- ✅ Logout from one app does not affect the other

### Role-Based Access Control (RBAC)
- ✅ Customer dashboard: Checks `subscription_status === "active"`
- ✅ Admin panel: Checks `role === "admin"` (case-insensitive)
- ✅ Backend: Verifies Firebase tokens before issuing custom tokens
- ⚠️ **Production:** Consider additional backend role verification for sensitive operations

---

## 📊 Firebase Firestore Schema

### `users` Collection
```typescript
{
  uid: string;              // Firebase Auth UID
  email: string;
  fullName: string;
  businessName: string;
  businessSegment: string;  // "Hardware Store", "Admin", etc.
  role: string;             // "Admin", "Customer", "Developer"
  plan: string;             // "Starter", "Professional", "Enterprise", "Unlimited"
  subscription_status: string; // "active", "inactive", "trial"
}
```

### `products` Collection
```typescript
{
  id: string;               // Auto-generated
  name: string;
  nameLower: string;        // For case-insensitive search
  barcode: string;
  businessType: string;     // "hardware", "pharmacy", "grocery", "clothing"
  category: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  image: string;            // Alternative image field
  size: string;
  color: string;
  weight: string;
  uom: string;              // Unit of measure: "pcs", "kg", "box"
  status: string;           // "Active", "Pending", "Archived", "Rejected"
  attributes: {
    brand: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  variations: [];           // Future use
  addedVia?: string;        // "crowdsourcing" if from product request
  requestId?: string;       // Reference to product_requests doc
}
```

### `product_requests` Collection
```typescript
{
  id: string;
  productName: string;
  category: string;
  sku?: string;
  details?: string;
  searchQuery?: string;     // Search term that triggered request
  imageUrl?: string;
  requestedBy: {
    uid: string;
    email: string;
  };
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;      // Admin email
  notes?: string;           // Admin review notes
}
```

---

## 🛠️ Key Implementation Files

### Backend Token Verification
**File:** `routes/auth.js`
```javascript
router.post('/verify-token', async (req, res) => {
  const { idToken } = req.body;
  
  try {
    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    
    // Generate custom token
    const customToken = await admin.auth().createCustomToken(uid);
    
    res.json({ success: true, customToken });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});
```

### Customer Dashboard Login
**File:** `dashboard/src/components/auth/LoginModal.tsx`
```typescript
const handleLogin = async (e: React.FormEvent) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const role = userData?.role?.toLowerCase();
  
  if (role === "admin") {
    const idToken = await user.getIdToken();
    const adminUrl = `http://localhost:3001/?authToken=${idToken}`;
    window.location.href = adminUrl;
  } else {
    // Customer login success
    setSuccess("Login successful! Welcome back.");
  }
};
```

### Admin Panel Token Bridge
**File:** `admin-panel/src/lib/firebase/admin-auth-context.tsx`
```typescript
useEffect(() => {
  const authToken = searchParams.get("authToken");
  
  if (authToken) {
    verifyAndSignIn(authToken);
  }
}, [searchParams]);

const verifyAndSignIn = async (idToken: string) => {
  // Send to backend
  const response = await fetch(`${API_URL}/api/v1/auth/verify-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  
  const { customToken } = await response.json();
  
  // Sign in with custom token
  await signInWithCustomToken(auth, customToken);
  
  // Clean URL
  router.replace('/');
};
```

---

## 📝 Migration Phases Summary

### ✅ Phase 1: Setup Admin Panel Structure
- Created `admin-panel/` directory
- Set up Next.js with custom port 3001
- Installed dependencies
- Configured Firebase client SDK
- Created `.env.local` with Firebase config

### ✅ Phase 2: Token Bridge Implementation
- Added backend `/api/v1/auth/verify-token` endpoint
- Updated backend CORS to allow `localhost:3001`
- Modified `LoginModal.tsx` to redirect admins with ID token
- Created `admin-auth-context.tsx` with token consumption logic
- Added error handling UI for failed authentication

### ✅ Phase 3: Move Admin Components
- Copied all admin routes from customer dashboard to admin panel
- Created admin sidebar (red theme) and navbar
- Created admin layout wrapper
- Copied admin components (AdminStats, AdminProductTable, ErrorState)
- Created all admin pages (dashboard, product-requests, products/[industry], etc.)
- Applied red theme throughout admin panel

### ✅ Phase 4: Clean Customer Dashboard
- Deleted `/admin` directory from customer dashboard
- Removed admin routes from `Sidebar.tsx`
- Removed admin logic from `auth-context.tsx`
- Preserved token bridge redirect in `LoginModal.tsx`
- Customer dashboard now handles customer/developer roles only

### ⏳ Phase 5: Final Testing & Verification
- Comprehensive testing guide created
- 15 test cases defined
- Visual verification checklist
- Troubleshooting guide
- Final architecture documentation

---

## 🎯 Benefits of Separation

### Security
- ✅ Isolated authentication states (no conflicts)
- ✅ Separate CORS policies per app
- ✅ Admin routes physically separated from customer app
- ✅ Token-based cross-origin authentication (secure)

### Maintainability
- ✅ Clear separation of concerns (customer vs admin)
- ✅ Independent deployments possible
- ✅ Easier to manage permissions and roles
- ✅ Reduced complexity in each codebase

### Performance
- ✅ Customer dashboard loads faster (no admin code)
- ✅ Admin panel optimized for admin workflows
- ✅ Independent scaling possible in production

### Developer Experience
- ✅ Clear project structure (two separate apps)
- ✅ No route conflicts or naming collisions
- ✅ Easier to onboard new developers
- ✅ Better IDE performance (smaller codebases)

---

## 🚧 Known Limitations & Future Work

### Current Limitations
- ⚠️ Token passed via URL query param (visible in browser history)
- ⚠️ No token refresh mechanism (1-hour session limit)
- ⚠️ Manual re-login required after token expiry
- ⚠️ Local development only (localhost URLs hardcoded)

### Future Improvements
- [ ] Implement POST-based token exchange (more secure)
- [ ] Add token refresh mechanism (silent re-authentication)
- [ ] Implement "Remember Me" functionality
- [ ] Add 2FA for admin accounts
- [ ] Create automated tests (E2E with Playwright/Cypress)
- [ ] Add monitoring and logging (Sentry, LogRocket)
- [ ] Optimize for production deployment
- [ ] Add rate limiting on backend endpoints
- [ ] Implement session timeout warnings
- [ ] Add audit logging for admin actions

---

## 📚 Additional Resources

### Documentation
- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Admin SDK Docs](https://firebase.google.com/docs/admin/setup)
- [Next.js Docs](https://nextjs.org/docs)
- [CORS Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

### Related Files
- `PHASE_1_SETUP_SUMMARY.md`
- `PHASE_2_TOKEN_BRIDGE_SUMMARY.md`
- `PHASE_3_ADMIN_COMPONENTS_SUMMARY.md`
- `PHASE_4_CUSTOMER_DASHBOARD_CLEANUP_SUMMARY.md`
- `PHASE_5_FINAL_TESTING_GUIDE.md`

---

## ✅ Project Status: COMPLETE (Pending Phase 5 Testing)

**Date Completed:** [Pending user confirmation after Phase 5 testing]

**Phases Completed:** 4 / 5

**Next Action:** User to complete Phase 5 testing and confirm all tests pass.

---

**Built with ❤️ for InventaAPI by Kiro AI**
