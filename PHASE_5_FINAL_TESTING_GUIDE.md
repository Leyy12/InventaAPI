# Phase 5: Final Testing & Verification Guide

## Overview
Comprehensive end-to-end testing guide for the separated admin panel and customer dashboard system.

---

## 🚀 Starting All Services

### Terminal 1: Backend API (Port 5000)
```bash
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2
node server.js
```

**Expected output:**
```
✅ Firebase Admin SDK initialized
✅ Server running on port 5000
✅ CORS enabled for: http://localhost:3000, http://localhost:3001
```

### Terminal 2: Customer Dashboard (Port 3000)
```bash
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2\dashboard
npm run dev
```

**Expected output:**
```
✓ Ready in 2.5s
○ Local: http://localhost:3000
```

### Terminal 3: Admin Panel (Port 3001)
```bash
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2\admin-panel
npm run dev
```

**Expected output:**
```
✓ Ready in 2.3s
○ Local: http://localhost:3001
```

---

## 🧪 Test Suite

### Test 1: Customer Login Flow ✅

**Steps:**
1. Open `http://localhost:3000` in incognito/private window
2. Click "Get API Key" or "Login" button
3. Enter customer credentials:
   - Email: (any non-admin customer email)
   - Password: (customer password)
4. Click "Login"

**Expected Results:**
- ✅ Login modal shows "Login successful! Welcome back."
- ✅ Modal closes automatically after 1 second
- ✅ User stays on `http://localhost:3000` (does NOT redirect to localhost:3001)
- ✅ If customer has active subscription → can access `/dashboard`
- ✅ If customer has no subscription → cannot access `/dashboard`, redirected to landing

**Console Logs to Verify:**
```
[LOGIN] User authenticated: customer@example.com
[LOGIN] User role: customer
[LOGIN] ✅ Customer login successful
[AUTH DEBUG] ✅ Dashboard access granted - staying on /dashboard
```

---

### Test 2: Admin Login with Token Bridge ✅

**Steps:**
1. Open `http://localhost:3000` in incognito/private window
2. Click "Get API Key" or "Login" button
3. Enter admin credentials:
   - Email: `balquinkevinconeal27@gmail.com`
   - Password: (admin password)
4. Click "Login"

**Expected Results:**
- ✅ Login modal processes login
- ✅ Browser automatically redirects to `http://localhost:3001/?authToken=eyJhbGci...`
- ✅ Admin panel shows loading state: "Authenticating..."
- ✅ Token is consumed and removed from URL
- ✅ Admin panel shows dashboard with red theme
- ✅ Sidebar shows admin-only routes
- ✅ No errors in console

**Console Logs to Verify (localhost:3000):**
```
[LOGIN] User authenticated: balquinkevinconeal27@gmail.com
[LOGIN] User role: admin
[LOGIN] 🔑 Admin detected - initiating token bridge...
[LOGIN] ✅ ID Token generated
[LOGIN] 🚀 Redirecting to admin panel...
```

**Console Logs to Verify (localhost:3001):**
```
[ADMIN AUTH] Token found in URL: eyJhbGci...
[ADMIN AUTH] Verifying token with backend...
[ADMIN AUTH] ✅ Backend verification successful
[ADMIN AUTH] Custom token received, signing in...
[ADMIN AUTH] ✅ Signed in with custom token
[ADMIN AUTH] 🚀 Admin authenticated successfully
```

---

### Test 3: Admin Panel Session Persistence ✅

**Steps:**
1. After successful admin login on `http://localhost:3001`
2. Refresh the page (F5 or Ctrl+R)
3. Navigate to different admin routes:
   - `http://localhost:3001/product-requests`
   - `http://localhost:3001/products/hardware`
   - `http://localhost:3001/audit`

**Expected Results:**
- ✅ Page refresh does NOT log out admin
- ✅ Admin session persists (no re-login required)
- ✅ All admin routes load correctly
- ✅ Red theme visible on all pages
- ✅ Admin sidebar remains functional
- ✅ No redirect back to localhost:3000

---

### Test 4: Customer Dashboard Session Persistence ✅

**Steps:**
1. After successful customer login on `http://localhost:3000`
2. Navigate to `/dashboard`
3. Refresh the page (F5 or Ctrl+R)
4. Navigate to different customer routes:
   - `http://localhost:3000/dashboard/products`
   - `http://localhost:3000/dashboard/api-keys`
   - `http://localhost:3000/dashboard/docs`

**Expected Results:**
- ✅ Page refresh does NOT log out customer
- ✅ Customer session persists (no re-login required)
- ✅ All customer routes load correctly
- ✅ Indigo theme visible on all pages
- ✅ Customer sidebar remains functional
- ✅ No admin routes visible in sidebar

---

### Test 5: Route Protection - Customer Dashboard ✅

**Steps:**
1. Logout from customer dashboard (if logged in)
2. Try to directly access:
   - `http://localhost:3000/dashboard`
   - `http://localhost:3000/dashboard/api-keys`

**Expected Results:**
- ✅ Redirects to `http://localhost:3000` (landing page)
- ✅ Login modal may appear (depending on implementation)
- ✅ Access denied until login with active subscription

**Console Logs:**
```
[AUTH DEBUG] 🔴 REDIRECT #1: No user, protected route -> redirecting to /
```

---

### Test 6: Route Protection - Admin Panel ✅

**Steps:**
1. Open `http://localhost:3001` in incognito/private window (no login)
2. Try to access admin panel directly

**Expected Results:**
- ✅ Shows "Authenticating..." or "Access Denied" state
- ✅ Redirects to `http://localhost:3000` (customer landing) OR shows error
- ✅ Cannot access admin panel without valid token/session

---

### Test 7: Non-Admin User Cannot Access Admin Panel ✅

**Steps:**
1. Login as **customer/developer** on `http://localhost:3000`
2. Manually try to navigate to `http://localhost:3001`

**Expected Results:**
- ✅ Admin panel shows "Access Denied" or redirects to login
- ✅ Customer session on localhost:3000 does NOT grant access to localhost:3001
- ✅ Admin panel requires separate admin authentication

---

### Test 8: Logout from Customer Dashboard ✅

**Steps:**
1. Login as customer on `http://localhost:3000`
2. Navigate to `/dashboard`
3. Click "Sign Out" button in sidebar

**Expected Results:**
- ✅ User is logged out
- ✅ Redirects to `http://localhost:3000` (landing page)
- ✅ Cannot access `/dashboard` anymore
- ✅ Firebase auth state cleared

---

### Test 9: Logout from Admin Panel ✅

**Steps:**
1. Login as admin, redirected to `http://localhost:3001`
2. Click "Sign Out" button in admin sidebar

**Expected Results:**
- ✅ Admin is logged out
- ✅ Redirects to `http://localhost:3000` (landing page)
- ✅ Cannot access admin panel anymore
- ✅ Firebase auth state cleared on localhost:3001

---

### Test 10: Admin Panel Functionality - Product Requests ✅

**Steps:**
1. Login as admin
2. Navigate to `http://localhost:3001/product-requests`
3. Verify pending product requests load from Firestore
4. Try approving a request
5. Try rejecting a request

**Expected Results:**
- ✅ Product requests load from Firebase `product_requests` collection
- ✅ Filter tabs work (Pending, Approved, Rejected, All)
- ✅ Approve button adds product to `products` collection
- ✅ Reject button updates status with admin notes
- ✅ Red theme visible
- ✅ No errors in console

---

### Test 11: Admin Panel Functionality - Catalog Management ✅

**Steps:**
1. Login as admin
2. Navigate to `http://localhost:3001/products/hardware`
3. Verify products load from backend API
4. Try adding a new product
5. Try editing an existing product
6. Try changing product status (Active, Pending, Archived)
7. Try deleting a product
8. Try exporting CSV

**Expected Results:**
- ✅ Products load from backend `/api/v1/products?businessType=hardware`
- ✅ Status filters work (All, Active, Pending, Rejected, Archived)
- ✅ Search works (by name or barcode)
- ✅ Add product modal opens and saves to Firestore
- ✅ Edit product modal opens and updates Firestore
- ✅ Status change updates Firestore
- ✅ Delete removes product from Firestore
- ✅ CSV export downloads file
- ✅ Red theme visible
- ✅ No errors in console

---

### Test 12: Token Bridge Error Handling ✅

**Steps:**
1. Manually navigate to `http://localhost:3001/?authToken=invalid_token_abc123`

**Expected Results:**
- ✅ Admin panel attempts to verify token
- ✅ Backend returns error (401 Unauthorized or 400 Bad Request)
- ✅ Admin panel shows error toast: "Authentication failed"
- ✅ Redirects back to `http://localhost:3000?error=admin_auth_failed`
- ✅ Error message visible on landing page

**Console Logs:**
```
[ADMIN AUTH] Token verification failed: [error details]
[ADMIN AUTH] 🔴 Redirecting back to customer dashboard...
```

---

### Test 13: Expired Token Handling ✅

**Steps:**
1. Wait for token to expire (Firebase ID tokens expire after 1 hour)
2. Try using expired token to access admin panel

**Expected Results:**
- ✅ Backend rejects expired token
- ✅ Admin panel shows error: "Token expired"
- ✅ Redirects back to `http://localhost:3000?error=token_expired`
- ✅ User must re-login

---

### Test 14: Concurrent Sessions (Customer + Admin) ✅

**Steps:**
1. Open two browser windows side-by-side
2. Window 1: Login as customer on `http://localhost:3000`, access dashboard
3. Window 2: Login as admin on `http://localhost:3000`, redirects to `http://localhost:3001`
4. Verify both sessions work independently

**Expected Results:**
- ✅ Customer session on localhost:3000 stays active
- ✅ Admin session on localhost:3001 stays active
- ✅ No conflicts between sessions
- ✅ Each session maintains its own auth state
- ✅ Logging out from one does not affect the other

---

### Test 15: Landing Page "Back to Landing Page" Link ✅

**Steps:**
1. Login as customer on `http://localhost:3000`
2. Navigate to `/dashboard`
3. Look at sidebar, find "Landing Page" link under "External Links"
4. Click "Landing Page" link

**Expected Results:**
- ✅ Redirects to `http://localhost:3000/?view=landing`
- ✅ Shows landing page
- ✅ User remains logged in (session NOT cleared)
- ✅ User can navigate back to `/dashboard`
- ✅ No logout occurred

---

## 🎨 Visual Verification Checklist

### Customer Dashboard (localhost:3000)
- [ ] Indigo color scheme (`text-indigo-400`, `bg-indigo-500/10`)
- [ ] "InventaAPI" branding with indigo logo
- [ ] Sidebar shows 5 customer routes only
- [ ] "SME Consumer" label in sidebar
- [ ] Clean, modern UI with glassmorphism effects

### Admin Panel (localhost:3001)
- [ ] Red color scheme (`text-red-400`, `bg-red-500/10`)
- [ ] "InventaAPI" branding (can be red variant)
- [ ] Sidebar shows 9+ admin routes
- [ ] "Super Admin Control Panel" label
- [ ] "Super Admin" label in sidebar
- [ ] Red accent colors throughout (buttons, badges, highlights)

---

## 🐛 Common Issues & Troubleshooting

### Issue 1: "Cannot connect to localhost:3001"
**Cause:** Admin panel dev server not running
**Solution:** 
```bash
cd admin-panel
npm run dev
```

### Issue 2: "Token verification failed"
**Cause:** Backend not running or Firebase Admin SDK not initialized
**Solution:**
```bash
# Check backend is running on port 5000
# Verify .env has FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2
node server.js
```

### Issue 3: "CORS error" in browser console
**Cause:** Backend CORS not configured for localhost:3001
**Solution:** Verify `server.js` has both origins:
```javascript
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
```

### Issue 4: Admin login redirects but shows blank page
**Cause:** Token consumed but authentication failed
**Solution:** Check console logs on localhost:3001, verify backend `/api/v1/auth/verify-token` endpoint works

### Issue 5: "Products not loading" in admin panel
**Cause:** Backend API not running or Firestore connection issue
**Solution:** 
```bash
# Verify backend is running
curl http://localhost:5000/api/v1/products

# Check Firestore connection in backend logs
```

---

## ✅ Final Verification Checklist

Before marking Phase 5 complete, verify:

### Separation
- [ ] Customer dashboard (`localhost:3000`) and admin panel (`localhost:3001`) run on different ports
- [ ] No `/admin` routes exist in customer dashboard
- [ ] No customer routes in admin panel
- [ ] Both apps have independent navigation and routing

### Authentication
- [ ] Customer login works and stays on `localhost:3000`
- [ ] Admin login works and redirects to `localhost:3001`
- [ ] Token bridge authentication successful (no errors)
- [ ] Session persistence works on both apps
- [ ] Logout works correctly on both apps

### Authorization
- [ ] Customer cannot access admin panel
- [ ] Admin can access admin panel via token bridge
- [ ] Customer dashboard requires active subscription
- [ ] Admin panel requires admin role

### UI/UX
- [ ] Customer dashboard uses indigo theme consistently
- [ ] Admin panel uses red theme consistently
- [ ] Sidebars show correct routes for each user type
- [ ] No UI/UX conflicts or broken layouts
- [ ] Error messages are clear and user-friendly

### Functionality
- [ ] Customer dashboard features work (API keys, docs, analytics, product catalog)
- [ ] Admin panel features work (product requests, catalog management, CRUD operations)
- [ ] Firebase integration works (Firestore read/write)
- [ ] Backend API integration works (product fetching, filtering)
- [ ] CSV export works in admin panel

### Error Handling
- [ ] Invalid token shows error and redirects
- [ ] Expired token shows error and redirects
- [ ] Network errors are handled gracefully
- [ ] 404 errors show appropriate messages
- [ ] Console errors are minimal or explained

---

## 📊 Test Results Summary Template

```
========================================
PHASE 5 TESTING - RESULTS
========================================

Backend API (Port 5000):        [ ] ✅ Pass  [ ] ❌ Fail
Customer Dashboard (Port 3000): [ ] ✅ Pass  [ ] ❌ Fail
Admin Panel (Port 3001):        [ ] ✅ Pass  [ ] ❌ Fail

========================================
TEST RESULTS
========================================

Test 1:  Customer Login Flow              [ ] ✅ Pass  [ ] ❌ Fail
Test 2:  Admin Login with Token Bridge    [ ] ✅ Pass  [ ] ❌ Fail
Test 3:  Admin Panel Session Persistence  [ ] ✅ Pass  [ ] ❌ Fail
Test 4:  Customer Session Persistence     [ ] ✅ Pass  [ ] ❌ Fail
Test 5:  Route Protection (Customer)      [ ] ✅ Pass  [ ] ❌ Fail
Test 6:  Route Protection (Admin)         [ ] ✅ Pass  [ ] ❌ Fail
Test 7:  Non-Admin Access Prevention      [ ] ✅ Pass  [ ] ❌ Fail
Test 8:  Logout (Customer)                [ ] ✅ Pass  [ ] ❌ Fail
Test 9:  Logout (Admin)                   [ ] ✅ Pass  [ ] ❌ Fail
Test 10: Product Requests (Admin)         [ ] ✅ Pass  [ ] ❌ Fail
Test 11: Catalog Management (Admin)       [ ] ✅ Pass  [ ] ❌ Fail
Test 12: Token Bridge Error Handling      [ ] ✅ Pass  [ ] ❌ Fail
Test 13: Expired Token Handling           [ ] ✅ Pass  [ ] ❌ Fail
Test 14: Concurrent Sessions              [ ] ✅ Pass  [ ] ❌ Fail
Test 15: Landing Page Link                [ ] ✅ Pass  [ ] ❌ Fail

========================================
VISUAL VERIFICATION
========================================

Customer Dashboard Theme:  [ ] ✅ Pass  [ ] ❌ Fail
Admin Panel Theme:         [ ] ✅ Pass  [ ] ❌ Fail
Sidebar Consistency:       [ ] ✅ Pass  [ ] ❌ Fail
No UI Conflicts:           [ ] ✅ Pass  [ ] ❌ Fail

========================================
OVERALL STATUS
========================================

Phase 5 Complete: [ ] ✅ YES  [ ] ❌ NO

Notes:
- 
- 
- 

========================================
```

---

## 🚀 Next Steps After Phase 5

Once all tests pass:

1. **Create final architecture documentation**
2. **Document deployment considerations**
3. **Create security audit checklist**
4. **Plan for production deployment** (separate domains, proper CORS, SSL/HTTPS)
5. **Consider session token expiry strategies** for production
6. **Document maintenance procedures** for both apps

---

## Phase 5 Status: ⏳ READY FOR TESTING

Waiting for user to complete all test cases and confirm results.
