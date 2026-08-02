# 🚨 HARDCODED EMAIL BACKDOOR AUDIT

**Date:** July 27, 2026  
**Severity:** HIGH - Active backdoor in production code

---

## 🔍 **ALL HARDCODED EMAIL CHECKS FOUND**

### 🚨 **CRITICAL: PRODUCTION BACKDOOR (MUST DELETE)**

#### **File:** `dashboard/src/lib/firebase/auth-context.tsx`

**Line 70:**
```javascript
const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
```

**Context (Lines 68-76):**
```javascript
} else {
  console.warn("User document not found in Firestore.");
  
  // Check if this is superadmin account
  const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
  
  if (isSuperAdmin) {
    console.warn("⚠️  Super admin account detected - document should be created via Admin SDK script");
    console.warn("   Run: node scripts/create-superadmin.js");
    // Don't auto-heal admin accounts - they must be created via scripts with proper permissions
    setLoading(false);
    return;
  }
```

**Exposure:**
- **Location:** Customer dashboard authentication context
- **Trigger:** Every login, every page load
- **Duration:** Unknown (predates current audit)
- **Impact:** Anyone with email `balquinkevinconeal27@gmail.com` gets special treatment

**Risk:**
- ⚠️ Email hardcoded in production code
- ⚠️ Continuous code path (not one-time)
- ⚠️ Same pattern as deleted signup backdoor

**Action:** **DELETE** this hardcoded email check

---

### ✅ **SAFE: ADMIN SCRIPTS (Backend only, Admin SDK)**

These are Admin SDK scripts that bypass Firestore rules - safe because:
- Not exposed to client
- Require server access to run
- Use Admin SDK (privileged)

| File | Line | Email | Purpose |
|------|------|-------|---------|
| `database/setup-admin.js` | 23 | `balquinkevinconeal27@gmail.com` | Setup script |
| `database/make-admin-firestore.js` | 21 | `balquinkevinconeal27@gmail.com` | Setup script |
| `makeAdmin.js` | 4 | `balquinkevinconeal27@gmail.com` | Setup script |
| `scripts/cleanup-admin-accounts.js` | 45 | `balquinkevinconeal27@gmail.com` | Cleanup (DELETE list) |

**Status:** ✅ Safe - backend scripts only

---

### ✅ **SAFE: SEED/TEST DATA (Not production)**

| File | Line | Email | Purpose |
|------|------|-------|---------|
| `database/seed.js` | 30 | `balquinkevinconeal27@gmail.com` | Test data seed |
| `scratch-seed.js` | 128 | `balquinkevinconeal27@gmail.com` | Test data seed |

**Status:** ✅ Safe - test/seed data only

---

### ✅ **SAFE: FORENSIC SCRIPTS (Read-only audit)**

| File | Line | Email | Purpose |
|------|------|-------|---------|
| `scripts/forensic-audit-users.js` | 75, 110 | `balquinkevinconeal27@gmail.com` | Whitelist for audit (excludes from "suspicious" flag) |
| `scripts/verify-all-users.js` | 83 | `balquinkevinconeal27@gmail.com` | Expected accounts list |
| `scripts/trace-auth-account-creation.js` | 79 | `delarosaleah38@gmail.com` | Test customer check |
| `scripts/verify-document-state.js` | 80 | `superadmin@inventaapi.com` | Superadmin verification |

**Status:** ✅ Safe - read-only scripts

---

### ✅ **SAFE: DOCUMENTATION REFERENCE**

| File | Line | Email | Context |
|------|------|-------|---------|
| `scripts/check-live-firestore-rules.js` | 58 | `superadmin@inventaapi.com` | Example in console.log message |

**Status:** ✅ Safe - documentation only

---

## 🎯 **SUMMARY**

### Backdoors Found: **1**

| Location | Email | Status | Action |
|----------|-------|--------|--------|
| `dashboard/src/lib/firebase/auth-context.tsx` line 70 | `balquinkevinconeal27@gmail.com` | 🚨 **ACTIVE** | **DELETE NOW** |

### Why This Is A Backdoor:

1. **Client-side code** - Exposed in dashboard bundle
2. **Hardcoded email** - Special treatment for specific account
3. **Continuous execution** - Runs every login/page load
4. **Same pattern** as deleted signup backdoor (`balquinkevinconeal27@gmail.com`)

### Historical Context:

**Previously deleted backdoor:**
- **File:** `dashboard/src/app/signup/page.tsx` (DELETED)
- **Code:** `if (formData.email === 'balquinkevinconeal27@gmail.com') { /* admin role */ }`
- **Deleted:** Earlier in this session

**Current backdoor:**
- **File:** `dashboard/src/lib/firebase/auth-context.tsx` (STILL EXISTS)
- **Code:** `const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';`
- **Status:** ACTIVE NOW

**Same email, same pattern - missed during first cleanup.**

---

## 🔧 **FIX REQUIRED**

### Current Code (Lines 68-76):
```javascript
} else {
  console.warn("User document not found in Firestore.");
  
  // Check if this is superadmin account
  const isSuperAdmin = currentUser.email === 'balquinkevinconeal27@gmail.com';
  
  if (isSuperAdmin) {
    console.warn("⚠️  Super admin account detected - document should be created via Admin SDK script");
    console.warn("   Run: node scripts/create-superadmin.js");
    setLoading(false);
    return;
  }
```

### ✅ **Recommended Fix:**

**Option 1: Remove email check entirely (RECOMMENDED)**

```javascript
} else {
  console.warn("User document not found in Firestore.");
  
  // All users without Firestore documents should go through proper signup
  // Admins must be created via Admin SDK scripts
  console.log("Auto-healing regular user document...");
  
  const newDoc = {
    uid: currentUser.uid,
    fullName: "Developer",
    email: currentUser.email || "",
    businessName: "SME Store",
    businessSegment: "Hardware Store",
    plan: "Starter",
    role: "Developer",
    apiRequestLimit: 50,
    apiRequestsUsed: 0,
    subscription_status: "inactive",
  };
  
  import("firebase/firestore").then(({ setDoc, doc }) => {
    setDoc(doc(db, "users", currentUser.uid), newDoc).then(() => {
      console.log("✅ Auto-heal successful");
      setAppUser(newDoc as AppUser);
    }).catch((error) => {
      console.error("❌ Auto-heal failed:", error);
    });
  });
}
```

**Rationale:**
- No hardcoded emails in production code
- Admin accounts MUST be created via Admin SDK scripts (proper privilege escalation)
- Regular users auto-heal with Developer role
- If admin tries to login without Firestore doc, they get Developer role (safe default)

**Option 2: Check via Firestore role (if doc exists)**

NO - This option doesn't work because we're in the "else" branch where doc DOESN'T exist.

---

## 📊 **IMPACT ASSESSMENT**

### If We Remove This Check:

**Scenario 1: Regular user with Auth but no Firestore doc**
- **Before:** Auto-heal creates Developer document ✅
- **After:** Auto-heal creates Developer document ✅
- **Impact:** NONE

**Scenario 2: Admin (`balquinkevinconeal27@gmail.com`) with Auth but no Firestore doc**
- **Before:** Shows warning, skips auto-heal, user stuck without doc ⚠️
- **After:** Auto-heal creates Developer document, admin must be recreated via script
- **Impact:** Admin loses special treatment (GOOD - closes backdoor)

**Scenario 3: Proper admin (created via script)**
- **Before:** Has Firestore doc, no auto-heal, works normally ✅
- **After:** Has Firestore doc, no auto-heal, works normally ✅
- **Impact:** NONE

### Conclusion:

Removing the check ONLY affects `balquinkevinconeal27@gmail.com` if they login without Firestore doc.

**Solution:** Ensure `superadmin@inventaapi.com` (NOT `balquinkevinconeal27@gmail.com`) is the official admin account, created via script.

---

## ✅ **ACTION PLAN**

1. **DELETE** hardcoded email check from `auth-context.tsx` line 70
2. **VERIFY** no other hardcoded email checks in client code
3. **ENSURE** `superadmin@inventaapi.com` is proper admin (created via script)
4. **RETIRE** `balquinkevinconeal27@gmail.com` email from production use
5. **PUBLISH** Firestore rules after fix

---

**Status:** ⚠️ **BLOCKED - FIX REQUIRED BEFORE PUBLISHING RULES**
