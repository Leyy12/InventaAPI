# InventaAPI - Complete Localhost URLs Reference

## 🌐 All Services and URLs

---

## 🖥️ Backend API (Port 5000)

### Base URL
```
http://localhost:5000
```

### Endpoints

#### Products
```
GET  http://localhost:5000/api/v1/products
GET  http://localhost:5000/api/v1/products?businessType=hardware
GET  http://localhost:5000/api/v1/products?businessType=pharmacy
GET  http://localhost:5000/api/v1/products?businessType=grocery
GET  http://localhost:5000/api/v1/products?businessType=clothing
```

#### Authentication (Token Bridge)
```
POST http://localhost:5000/api/v1/auth/verify-token
Body: { "idToken": "<Firebase_ID_Token>" }
Response: { "success": true, "customToken": "<Custom_Token>" }
```

---

## 👥 Customer Dashboard (Port 3000)

### Theme: 🔵 Indigo

### Public Routes (No Auth Required)
```
http://localhost:3000/                      # Landing page
http://localhost:3000/?view=landing         # Landing page (bypass redirect)
http://localhost:3000/signup                # Customer registration
```

### Protected Routes (Auth + Subscription Required)
```
http://localhost:3000/dashboard                   # Dashboard overview
http://localhost:3000/dashboard/products          # Product catalog
http://localhost:3000/dashboard/api-keys          # API key management
http://localhost:3000/dashboard/docs              # API documentation
http://localhost:3000/dashboard/analytics         # Usage analytics
http://localhost:3000/dashboard/api-playground    # API testing tool
```

### Error States (Query Params)
```
http://localhost:3000/?error=admin_auth_failed    # Admin auth failed
http://localhost:3000/?error=token_expired        # Token expired
http://localhost:3000/?error=admin_only           # Admin access required
http://localhost:3000/?error=user_not_found       # User not found
```

---

## 🛡️ Admin Panel (Port 3001)

### Theme: 🔴 Red

### Auth Entry Point (Token Bridge)
```
http://localhost:3001/?authToken=<Firebase_ID_Token>
```

### Admin Routes (Auth + Admin Role Required)
```
http://localhost:3001/                            # Admin dashboard homepage

# Product Management
http://localhost:3001/product-requests            # Product request management
http://localhost:3001/products/hardware           # Hardware catalog
http://localhost:3001/products/pharmacy           # Pharmacy catalog
http://localhost:3001/products/grocery            # Grocery catalog
http://localhost:3001/products/clothing           # Clothing catalog

# System Management (Coming Soon)
http://localhost:3001/audit                       # Audit logs
http://localhost:3001/categories                  # Category management
http://localhost:3001/consumers                   # API consumer management
http://localhost:3001/security                    # Security center
http://localhost:3001/settings                    # System settings
```

---

## 🎨 Visual Guide

### Customer Dashboard (localhost:3000)
```
┌────────────────────────────────────────────────┐
│  🔵 InventaAPI                    [User Menu] │
├───────────┬────────────────────────────────────┤
│           │                                    │
│ Overview  │  Welcome to Dashboard              │
│ Products  │                                    │
│ API Keys  │  [Indigo themed cards and buttons] │
│ Docs      │                                    │
│ Analytics │                                    │
│           │                                    │
│ ─────────│                                    │
│           │                                    │
│ 🏠 Landing│                                    │
│           │                                    │
└───────────┴────────────────────────────────────┘
       Indigo Theme (#6366f1)
```

### Admin Panel (localhost:3001)
```
┌────────────────────────────────────────────────┐
│  🔴 InventaAPI Admin         [Admin Menu]     │
├───────────┬────────────────────────────────────┤
│           │                                    │
│ Dashboard │  Super Admin Control Panel         │
│ Requests  │                                    │
│ Hardware  │  [Red themed cards and buttons]    │
│ Pharmacy  │                                    │
│ Grocery   │                                    │
│ Clothing  │                                    │
│ Consumers │                                    │
│ Security  │                                    │
│ Settings  │                                    │
│           │                                    │
└───────────┴────────────────────────────────────┘
       Red Theme (#ef4444)
```

---

## 🔄 Authentication Flow URLs

### Customer Login (Stays on :3000)
```
1. Visit:     http://localhost:3000/
2. Click:     "Login" button
3. Enter:     customer@example.com + password
4. Success:   Stay on http://localhost:3000/
5. Access:    http://localhost:3000/dashboard
```

### Admin Login (Redirects to :3001)
```
1. Visit:     http://localhost:3000/
2. Click:     "Login" button
3. Enter:     balquinkevinconeal27@gmail.com + password
4. Redirect:  http://localhost:3001/?authToken=eyJhbGci...
5. Verify:    Backend verifies token
6. Auth:      Sign in with custom token
7. Redirect:  http://localhost:3001/ (clean URL)
8. Success:   Admin panel dashboard visible
```

---

## 🧪 Testing URLs

### Test Customer Access
```bash
# 1. Open in browser
http://localhost:3000

# 2. Login as customer
# Email: (customer email)
# Password: (customer password)

# 3. Should stay on localhost:3000

# 4. Access dashboard
http://localhost:3000/dashboard
```

### Test Admin Access
```bash
# 1. Open in browser
http://localhost:3000

# 2. Login as admin
# Email: balquinkevinconeal27@gmail.com
# Password: (admin password)

# 3. Should auto-redirect to
http://localhost:3001/?authToken=...

# 4. Token consumed, clean URL
http://localhost:3001/

# 5. Admin dashboard visible
```

### Test Route Protection
```bash
# Customer Dashboard Protection
# (Without login, should redirect to landing)
http://localhost:3000/dashboard
→ Redirects to http://localhost:3000/

# Admin Panel Protection
# (Without login, should show access denied)
http://localhost:3001/
→ Shows "Access Denied" or redirects
```

### Test Deleted Routes (Should 404)
```bash
# These routes no longer exist in customer dashboard
http://localhost:3000/admin                        # 404 ❌
http://localhost:3000/admin/products/hardware      # 404 ❌
http://localhost:3000/admin/requests               # 404 ❌
```

---

## 📊 Port Summary

| Port | Application | Theme | Primary Users |
|------|-------------|-------|---------------|
| 5000 | Backend API | N/A | All (backend service) |
| 3000 | Customer Dashboard | 🔵 Indigo | SME Customers, Developers |
| 3001 | Admin Panel | 🔴 Red | Super Admin only |

---

## 🔧 Development URLs

### Start Commands
```bash
# Terminal 1: Backend (Port 5000)
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2
node server.js
# → http://localhost:5000

# Terminal 2: Customer Dashboard (Port 3000)
cd dashboard
npm run dev
# → http://localhost:3000

# Terminal 3: Admin Panel (Port 3001)
cd admin-panel
npm run dev
# → http://localhost:3001
```

### Health Check URLs
```bash
# Backend health check
curl http://localhost:5000/api/v1/products
# Should return product list JSON

# Customer dashboard
curl http://localhost:3000
# Should return HTML

# Admin panel
curl http://localhost:3001
# Should return HTML
```

---

## 🚨 Common URL Mistakes

### ❌ Wrong URLs
```bash
# Don't use these
http://localhost:3000/admin                  # Doesn't exist anymore!
http://localhost:3001/dashboard              # Admin panel doesn't have /dashboard
http://localhost:3000/products/hardware      # Use /dashboard/products instead
```

### ✅ Correct URLs
```bash
# Customer routes (port 3000)
http://localhost:3000/
http://localhost:3000/dashboard
http://localhost:3000/dashboard/products

# Admin routes (port 3001)
http://localhost:3001/
http://localhost:3001/product-requests
http://localhost:3001/products/hardware
```

---

## 📱 Browser Testing Recommendations

### Recommended Browsers
- ✅ Chrome/Edge (Chromium) - Best developer tools
- ✅ Firefox - Good for CORS debugging
- ✅ Safari (macOS) - Webkit engine testing

### Testing Tips
- Use **Incognito/Private** windows for clean sessions
- Open **DevTools Console** (F12) to see auth logs
- Use **Network tab** to verify API calls and CORS
- Test on **different ports simultaneously** (two browser windows)

---

## 🔍 Debugging URLs

### Check CORS Issues
```bash
# In browser console, check if these domains are allowed
http://localhost:3000  # Should be in CORS whitelist
http://localhost:3001  # Should be in CORS whitelist
```

### Check Token Bridge
```bash
# Admin login should show these logs
[LOGIN] 🔑 Admin detected - initiating token bridge...
[LOGIN] ✅ ID Token generated
[LOGIN] 🚀 Redirecting to admin panel...

# Then on localhost:3001
[ADMIN AUTH] Token found in URL: eyJhbGci...
[ADMIN AUTH] Verifying token with backend...
[ADMIN AUTH] ✅ Backend verification successful
[ADMIN AUTH] ✅ Signed in with custom token
```

---

## 📋 Quick Reference Card

```
╔════════════════════════════════════════════════╗
║        INVENTAAPI LOCALHOST REFERENCE          ║
╠════════════════════════════════════════════════╣
║                                                ║
║  Backend:   http://localhost:5000             ║
║  Customer:  http://localhost:3000             ║
║  Admin:     http://localhost:3001             ║
║                                                ║
║  Customer Login → Stay on :3000               ║
║  Admin Login    → Redirect to :3001           ║
║                                                ║
║  Customer Theme: 🔵 Indigo (#6366f1)          ║
║  Admin Theme:    🔴 Red (#ef4444)             ║
║                                                ║
╚════════════════════════════════════════════════╝
```

---

**Print this reference card and keep it handy during testing!** 📄
