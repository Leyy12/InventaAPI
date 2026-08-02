# 🔍 ALL USERS COLLECTION WRITE PATHS ANALYSIS

**Date:** July 27, 2026  
**Search Scope:** Entire codebase (dashboard, admin-panel, backend, scripts)

---

## 1️⃣ **SEARCH PATTERNS USED**

Searched entire project for:

1. **Client SDK writes:**
   - `setDoc(doc(db, "users"`
   - `setDoc(doc(db, 'users'`
   - `collection(db, "users").add(`

2. **Admin SDK writes:**
   - `.collection('users').doc().set(`
   - `.collection('users').add(`
   - `setDoc.*users`

3. **Auth operations:**
   - `createUserWithEmailAndPassword`
   - `createUser` (Admin SDK)
   - `signInWithPopup` (Google/social auth)

4. **Admin panel features:**
   - `createUser`, `addUser`, `new.*user` in admin-panel folder

---

## 2️⃣ **ALL WRITE PATHS FOUND**

### ✅ **PATH 1: Dashboard Signup (MAIN)**

**File:** `dashboard/src/app/signup/page.tsx` (lines 57-66)

**Method:** Client SDK `setDoc()`

**Values Written:**
```javascript
{
  uid: user.uid,
  fullName: formData.fullName,       // User input
  email: formData.email,             // User input
  businessName: formData.businessName, // User input
  businessSegment: formData.businessSegment, // Dropdown
  plan: "Starter",                   // ⭐ HARDCODED
  role: "Developer",                 // ⭐ HARDCODED (capital D)
  apiRequestLimit: 50,               // ⭐ HARDCODED (number)
  apiRequestsUsed: 0,
  createdAt: serverTimestamp(),
  lastLogin: serverTimestamp()
}
```

**Rule Match:** ✅ **PERFECT** - Matches draft create rule exactly


---

### ⚠️ **PATH 2: Auth Context Auto-Heal**

**File:** `dashboard/src/lib/firebase/auth-context.tsx` (lines 69-84)

**Method:** Client SDK `setDoc()` (dynamic import)

**Trigger:** When user is authenticated but NO Firestore document exists

**Values Written:**
```javascript
{
  uid: currentUser.uid,
  fullName: isSuperAdmin ? "Kevin (Super Admin)" : "Developer",
  email: currentUser.email || "",
  businessName: isSuperAdmin ? "InventaAPI Research" : "SME Store",
  businessSegment: isSuperAdmin ? "Admin" : "Hardware Store",
  plan: isSuperAdmin ? "Unlimited" : "Starter",       // ⚠️ CONDITIONAL
  role: isSuperAdmin ? "Admin" : "Developer",         // ⚠️ CONDITIONAL (capital A/D)
  subscription_status: isSuperAdmin ? "active" : "inactive",
  // ❌ MISSING: apiRequestLimit field!
}
```

**Super Admin Check:**
```javascript
const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
```

**Rule Match:** 
- Regular user: ❌ **FAILS** - Missing `apiRequestLimit` field
- Super admin: ❌ **FAILS** - `role: "Admin"` (not "Developer"), missing `apiRequestLimit`

**CRITICAL ISSUE:** This auto-heal path will be BLOCKED by strict create rule!

---

### 🔧 **PATH 3: Admin Scripts (7 files)**

All scripts use **Admin SDK** which **BYPASSES Firestore Security Rules**.

#### 3a. `create-admin-user.js` (Root)
```javascript
{
  uid, email, fullName,
  role: 'admin',              // lowercase admin
  plan: 'Unlimited',
  businessName: 'InventaAPI',
  createdAt, isActive
}
```
**Bypasses rules:** ✅ Admin SDK

---

#### 3b. `scripts/create-superadmin.js`
```javascript
{
  uid, email, fullName: 'Super Admin',
  role: 'admin',              // lowercase admin
  plan: 'Unlimited',
  businessName: 'InventaAPI',
  createdAt, isActive
}
```
**Bypasses rules:** ✅ Admin SDK

---

#### 3c. `scripts/cleanup-firestore-only.mjs`
```javascript
{
  uid, email, fullName: 'Super Admin', username: 'superadmin',
  role: 'admin',              // lowercase admin
  plan: 'Unlimited',
  businessName: 'InventaAPI',
  createdAt, updatedAt, isActive
}
```
**Bypasses rules:** ✅ Admin SDK

---

#### 3d. `create-test-user.js`
```javascript
{
  email: 'test@example.com',
  fullName: 'Test Admin',
  role: 'admin',              // lowercase admin
  username: 'testadmin'
  // ❌ MISSING: plan, apiRequestLimit
}
```
**Bypasses rules:** ✅ Admin SDK

---

#### 3e. `database/setup-admin.js`
```javascript
{
  email, fullName: 'InventaAPI Super Admin',
  role: 'Admin',              // ⚠️ CAPITAL 'A'
  businessName: 'InventaAPI Research Team',
  businessSegment: 'Admin',
  plan: 'Unlimited'
  // ❌ MISSING: apiRequestLimit
}
```
**Bypasses rules:** ✅ Admin SDK

---

#### 3f. `scripts/test-signup-flow.js` (Test Only)
Uses exact same values as dashboard signup - not production code.

---

### ❌ **PATH 4: Google/Social Auth**
**Search Result:** NOT FOUND

No `signInWithPopup`, `GoogleAuthProvider`, or `signInWithRedirect` in codebase.

**Conclusion:** Social auth NOT implemented.

---

### ❌ **PATH 5: Admin Panel User Creation**
**Search Result:** NOT FOUND

No user creation features in `admin-panel/` folder.

**Conclusion:** Admin cannot create users via UI.

---

### ❌ **PATH 6: Backend API Endpoints**
**Search Result:** NOT FOUND

No `/api/users` or `/signup` endpoints in backend `server.js`.

**Conclusion:** Backend does not create user documents.

---

## 3️⃣ **RULE COMPATIBILITY ANALYSIS**

### Draft Create Rule:
```javascript
allow create: if request.auth != null
              && request.auth.uid == userId
              && request.resource.data.role == 'Developer'
              && request.resource.data.plan == 'Starter'
              && request.resource.data.apiRequestLimit == 50;
```

### Compatibility Table:

| Path | Rule Match? | Why? | Impact |
|------|-------------|------|--------|
| **1. Dashboard Signup** | ✅ **YES** | Exact match: `Developer`, `Starter`, `50` | ✅ Works |
| **2. Auto-Heal (Regular)** | ❌ **NO** | Missing `apiRequestLimit` field | 🚨 **BREAKS** |
| **2. Auto-Heal (SuperAdmin)** | ❌ **NO** | `role: "Admin"`, missing `apiRequestLimit` | 🚨 **BREAKS** |
| **3. Admin Scripts** | ✅ **BYPASS** | Admin SDK bypasses rules | ✅ Works |
| **4. Social Auth** | N/A | Not implemented | N/A |
| **5. Admin Panel UI** | N/A | Not implemented | N/A |
| **6. Backend API** | N/A | Not implemented | N/A |

---

## 4️⃣ **CRITICAL ISSUE: AUTO-HEAL WILL BREAK**

### Problem:

**Auth Context** (lines 69-84) has "auto-heal" logic that creates Firestore document if missing.

**Current behavior:**
1. User authenticated in Firebase Auth
2. No Firestore document found
3. Auto-heal creates document with these values:

**Regular user:**
```javascript
{
  role: "Developer",      // ✅ Matches rule
  plan: "Starter",        // ✅ Matches rule
  // ❌ Missing apiRequestLimit! Rule requires 50
}
```

**Super admin check:**
```javascript
const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
```

**Super admin values:**
```javascript
{
  role: "Admin",          // ❌ Rule requires "Developer"
  plan: "Unlimited",      // ❌ Rule requires "Starter"
  // ❌ Missing apiRequestLimit
}
```

**Result with strict rule:** ❌ **PERMISSION DENIED** - Auto-heal will fail!

---

## 5️⃣ **SOLUTIONS**

### ✅ **RECOMMENDED: FIX AUTO-HEAL CODE**

**Update** `dashboard/src/lib/firebase/auth-context.tsx` lines 69-84:

```javascript
const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
const newDoc = {
  uid: currentUser.uid,
  fullName: isSuperAdmin ? "Kevin (Super Admin)" : "Developer",
  email: currentUser.email || "",
  businessName: isSuperAdmin ? "InventaAPI Research" : "SME Store",
  businessSegment: isSuperAdmin ? "Admin" : "Hardware Store",
  plan: isSuperAdmin ? "Unlimited" : "Starter",
  role: isSuperAdmin ? "Admin" : "Developer",
  apiRequestLimit: isSuperAdmin ? 999999 : 50,     // ⭐ ADD THIS
  apiRequestsUsed: 0,                              // ⭐ ADD THIS
  subscription_status: isSuperAdmin ? "active" : "inactive",
};
```

**BUT WAIT:** This still won't work for super admin because rule requires `role == 'Developer'`.

### ✅ **BETTER SOLUTION: REMOVE AUTO-HEAL, USE ADMIN SDK FOR ADMINS**

**Option A: Remove auto-heal entirely**
- Delete lines 69-84 from auth-context.tsx
- Rely on proper signup flow only
- Admins created via Admin SDK scripts (bypasses rules)

**Option B: Make auto-heal work for regular users only**
- Add check: `if (isSuperAdmin) return;` (don't auto-heal admins)
- Only auto-heal regular users with proper values
- Admins must be created via scripts

### ✅ **ALTERNATIVE: RELAX CREATE RULE**

```javascript
// Allow normal signup OR admin creation
allow create: if (
  // Normal signup
  isAuthenticated()
  && request.auth.uid == userId
  && request.resource.data.role == 'Developer'
  && request.resource.data.plan == 'Starter'
  && request.resource.data.apiRequestLimit == 50
) || (
  // Admin-created accounts (via auto-heal or future admin UI)
  isAuthenticated()
  && request.auth.uid == userId
  && request.resource.data.role in ['Developer', 'Admin']
  && request.resource.data.plan in ['Starter', 'Professional', 'Enterprise', 'Unlimited']
  && request.resource.data.apiRequestLimit >= 0
);
```

**Tradeoff:** Less strict, but allows auto-heal and future admin UI features.

---

## 6️⃣ **FINAL RECOMMENDATION**

### ✅ **IMMEDIATE FIX (BEFORE PUBLISHING RULES)**

**Step 1:** Update `dashboard/src/lib/firebase/auth-context.tsx`:

```javascript
// Line 69-84: Add check to skip auto-heal for admins
if (!userDoc.exists()) {
  console.warn("User document not found in Firestore.");
  
  // Check if this is superadmin account
  const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
  
  if (isSuperAdmin) {
    console.warn("Super admin account detected - use Admin SDK script to create document");
    // Don't auto-heal admin accounts - they should be created via scripts
    return;
  }
  
  // Auto-heal for REGULAR users only
  const newDoc = {
    uid: currentUser.uid,
    fullName: "Developer",
    email: currentUser.email || "",
    businessName: "SME Store",
    businessSegment: "Hardware Store",
    plan: "Starter",
    role: "Developer",
    apiRequestLimit: 50,              // ⭐ REQUIRED by rule
    apiRequestsUsed: 0,
    subscription_status: "inactive",
  };
  
  import("firebase/firestore").then(({ setDoc, doc }) => {
    setDoc(doc(db, "users", currentUser.uid), newDoc).then(() => {
      setAppUser(newDoc as AppUser);
    });
  });
}
```

**Step 2:** Publish strict create rule (matches signup exactly)

**Step 3:** Test signup flow again

---

## 7️⃣ **SEARCH SUMMARY**

### Patterns Searched:
```
✅ setDoc(doc(db, "users"
✅ setDoc(doc(db, 'users'
✅ collection(db, "users").add(
✅ .collection('users').doc().set(
✅ .collection('users').add(
✅ createUserWithEmailAndPassword
✅ createUser (Admin SDK)
✅ signInWithPopup|GoogleAuthProvider
✅ createUser|addUser in admin-panel
```

### Files Found:
1. ✅ `dashboard/src/app/signup/page.tsx` - Main signup
2. ⚠️ `dashboard/src/lib/firebase/auth-context.tsx` - Auto-heal (NEEDS FIX)
3. ✅ `create-admin-user.js` - Admin script (bypasses rules)
4. ✅ `scripts/create-superadmin.js` - Admin script (bypasses rules)
5. ✅ `scripts/cleanup-firestore-only.mjs` - Admin script (bypasses rules)
6. ✅ `create-test-user.js` - Admin script (bypasses rules)
7. ✅ `database/setup-admin.js` - Admin script (bypasses rules)
8. ✅ `scripts/test-signup-flow.js` - Test script (not production)

### Paths NOT Found:
- ❌ Google/social auth
- ❌ Admin panel user creation UI
- ❌ Backend API user endpoints
- ❌ Password reset document overwrites

---

## 8️⃣ **CONCLUSION**

**Can we publish strict rule?** ⚠️ **NOT YET**

**Blocker:** Auto-heal code in `auth-context.tsx` will break.

**Action required:**
1. Fix auto-heal code (add `apiRequestLimit`, skip admins)
2. Test updated code
3. THEN publish strict rules

**After fix:** ✅ Only 1 production write path (signup form) - strict rule is safe.
