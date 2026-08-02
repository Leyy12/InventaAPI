# 🧪 ADMIN LOGIN TEST PROCEDURE

**Date:** July 27, 2026  
**Purpose:** Verify admin login works after publishing new Firestore rules

---

## 📌 PREREQUISITES

✅ **Before testing, ensure:**

1. ✅ Firestore rules published to Firebase Console
2. ✅ All servers running:
   - Backend: http://localhost:5000
   - Dashboard: http://localhost:3000
   - Admin Panel: http://localhost:3001
3. ✅ Superadmin account exists (run `node scripts/create-superadmin.js` if needed)

---

## 🔐 TEST CREDENTIALS

| Field | Value |
|-------|-------|
| **URL** | `http://localhost:3001/login` |
| **Email** | `superadmin@inventaapi.com` |
| **Password** | `SuperAdmin2024!` |
| **Expected UID** | `VpDeXopPT5cm7EtrgjfCrJ60Gjr2` |

---

## 📝 STEP-BY-STEP TEST PROCEDURE

### **STEP 1: Open Admin Login Page**

1. Open browser (Chrome recommended)
2. Navigate to: `http://localhost:3001/login`
3. **Expected:** Login form displays (red theme, InventaAPI branding)

**If page doesn't load:**
- Check if admin panel server is running on port 3001
- Check browser console for errors

---

### **STEP 2: Open Browser Console**

1. Press `F12` to open DevTools
2. Go to **Console** tab
3. **Purpose:** Monitor authentication logs

**Look for these log prefixes:**
- `[ADMIN LOGIN]` - Login page logs
- `[ADMIN AUTH]` - Auth context logs
- `[AUTH DEBUG]` - Firestore document checks

---

### **STEP 3: Enter Credentials**

1. **Email field:** Type `superadmin@inventaapi.com`
2. **Password field:** Type `SuperAdmin2024!`
3. **Do NOT submit yet** - verify fields are filled correctly

---

### **STEP 4: Submit Login**

1. Click **"Login"** button
2. **Watch console logs** - should see authentication progress

**Expected console logs:**
```
[ADMIN LOGIN] Login attempt: superadmin@inventaapi.com
[ADMIN LOGIN] User authenticated: superadmin@inventaapi.com
[ADMIN LOGIN] Fetching user role from Firestore...
[ADMIN LOGIN] User role: admin
[ADMIN LOGIN] Admin verified - redirecting to /admin
```

---

### **STEP 5: Verify Successful Login**

**✅ SUCCESS INDICATORS:**

1. **URL changes to:** `http://localhost:3001/admin`
2. **Page displays:** Admin dashboard (NOT login form)
3. **Sidebar shows:**
   - InventaAPI logo (top)
   - Navigation menu (Overview, Products, Categories, etc.)
   - Admin email at bottom
4. **Console logs show:**
   - No error messages
   - "Admin verified" message
   - Firestore document loaded successfully

**Expected final state:**
```
Current URL: http://localhost:3001/admin
Page content: Admin dashboard with sidebar
User state: Authenticated as superadmin@inventaapi.com
Role: admin
```

---

### **STEP 6: Verify Dashboard Content**

1. Check sidebar is visible (left side, red theme)
2. Check main content area shows dashboard overview
3. Try clicking navigation items (Products, Categories, etc.)
4. **All should work** - no permission denied errors

---

## 🚨 TROUBLESHOOTING

### **Problem: Login button does nothing**

**Check:**
- Browser console for JavaScript errors
- Network tab for failed API calls
- Credentials are typed correctly (no extra spaces)

**Solution:**
- Clear browser cache
- Hard refresh: `Ctrl+Shift+R`
- Try different browser

---

### **Problem: "Invalid credentials" error**

**Check:**
- Email: `superadmin@inventaapi.com` (exactly)
- Password: `SuperAdmin2024!` (case-sensitive)
- Superadmin account exists in Firebase Auth

**Solution:**
- Run: `node scripts/create-superadmin.js`
- Verify output shows UID: `VpDeXopPT5cm7EtrgjfCrJ60Gjr2`
- Try login again

---

### **Problem: Login succeeds but redirects to error page**

**Check console for:**
```
❌ CRITICAL: Superadmin Firestore document is missing!
```

**Solution:**
- Firestore document is missing
- Run: `node scripts/create-superadmin.js`
- Script will create missing Firestore document
- Try login again

---

### **Problem: "Permission denied" error in console**

**Check:**
- Firestore rules are published correctly
- Rules allow admin role to read/write
- User's Firestore document has `role: 'admin'` (lowercase)

**Solution:**
- Re-publish Firestore rules from `FINAL_FIRESTORE_RULES_TO_PUBLISH.rules`
- Verify superadmin document: `node scripts/create-superadmin.js`
- Check Firebase Console → Firestore → users/{UID} → role field

---

### **Problem: Stuck on loading screen**

**Check console for:**
```
[AUTH DEBUG] ⏳ currentUser exists but currentAppUser still loading
```

**Possible causes:**
1. Firestore read permission denied
2. Document doesn't exist
3. Network connectivity issue

**Solution:**
- Check browser Network tab for failed Firestore requests
- Verify Firestore rules allow `allow read: if isAuthenticated()`
- Run: `node scripts/create-superadmin.js`

---

## ✅ SUCCESS CRITERIA

**Login is successful when ALL of these are true:**

| Criteria | Expected State |
|----------|----------------|
| **URL** | `http://localhost:3001/admin` |
| **Page** | Admin dashboard (NOT login form) |
| **Sidebar** | Visible with navigation menu |
| **Console** | No error messages, shows "Admin verified" |
| **User email** | Displayed in sidebar footer |
| **Navigation** | All menu items clickable |

---

## 📊 EXPECTED CONSOLE LOGS (FULL SEQUENCE)

```
[ADMIN LOGIN] Login attempt: superadmin@inventaapi.com
[ADMIN LOGIN] User authenticated: superadmin@inventaapi.com
[ADMIN LOGIN] Fetching user role from Firestore...
[ADMIN LOGIN] User role: admin
[ADMIN LOGIN] Admin verified - redirecting to /admin

[ADMIN AUTH] Auth state changed
[ADMIN AUTH] User: superadmin@inventaapi.com
[ADMIN AUTH] UID: VpDeXopPT5cm7EtrgjfCrJ60Gjr2

[AUTH DEBUG] ==========================================
[AUTH DEBUG] Pathname: /admin
[AUTH DEBUG] currentUser exists: true
[AUTH DEBUG] currentUser email: superadmin@inventaapi.com
[AUTH DEBUG] currentAppUser exists: true
[AUTH DEBUG] currentAppUser.role: admin
[AUTH DEBUG] ==========================================
```

---

## 📸 WHAT TO REPORT BACK

**After testing, report:**

1. **Did login succeed?** (Yes/No)
2. **Final URL after login:** (e.g., `http://localhost:3001/admin`)
3. **Console logs:** (copy/paste any errors or relevant logs)
4. **Screenshot:** (if login failed, show error message)
5. **Page state:** (describe what you see - login form, dashboard, error, etc.)

---

## 🎯 NEXT STEPS AFTER SUCCESS

Once login works:

1. ✅ Test navigation between admin pages
2. ✅ Test logout functionality
3. ✅ Test customer dashboard signup (http://localhost:3000/signup)
4. ✅ Verify Firestore rules prevent privilege escalation

---

**Test starts AFTER you publish rules to Firebase Console.**

**Good luck!** 🚀
