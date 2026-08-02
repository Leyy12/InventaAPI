# 🎨 MANUAL UI VERIFICATION CHECKLIST

## ✅ WHAT'S ALREADY CODE-VERIFIED:

1. **Categories Page Delete Button:**
   - Location: `admin-panel/src/app/categories/page.tsx` line 95
   - ✅ Uses `text-red-400` and `hover:bg-red-500/20` (RED - correct)

2. **All 5 "Coming Soon" Pages Implemented:**
   - ✅ `/categories` - Full CRUD with Firestore
   - ✅ `/consumers` - User list with filters
   - ✅ `/audit` - Audit logs table
   - ✅ `/security` - API keys monitoring
   - ✅ `/settings` - System settings with save

---

## ⏳ MANUAL VERIFICATION NEEDED:

### A. BUTTON COLORS (5 minutes)

**Products Page:**
1. Open: `http://localhost:4000/products`
2. Find any product with a delete button
3. **Verify:** Delete button is RED or ORANGE (not blue/indigo)
4. Take screenshot if possible

**Requests Page:**
1. Open: `http://localhost:4000/requests`
2. Find any request with approve/reject buttons
3. **Verify:** Reject button is RED or ORANGE (not blue/indigo)
4. Take screenshot if possible

**Expected:**
- ✅ Destructive actions (Delete, Reject) use red/orange colors
- ❌ If blue/indigo, the theme change may have affected these buttons

---

### B. COMING SOON PAGES - CLICK TESTS (10 minutes)

**Test 1: Categories Page** (`http://localhost:4000/categories`)
1. Enter test category name: "Electronics"
2. Click "Add Category"
3. **Verify:** Category appears in table
4. Click delete icon (trash) for that category
5. Confirm deletion
6. **Verify:** Category removed from table
7. **Result:** ✅ PASS if add/delete both work

**Test 2: Settings Page** (`http://localhost:4000/settings`)
1. Toggle "Maintenance Mode" switch
2. Click "Save Settings"
3. **Verify:** Green success message appears
4. Refresh page
5. **Verify:** Toggle state persisted
6. **Result:** ✅ PASS if save works

**Test 3: Consumers Page** (`http://localhost:4000/consumers`)
1. Click "Customers" filter button
2. **Verify:** Only customer-role users show
3. Click "All" filter
4. **Verify:** All users show again
5. **Result:** ✅ PASS if filter works

**Test 4: Audit Logs Page** (`http://localhost:4000/audit`)
1. Check if table loads
2. **Verify:** Shows transaction or audit log entries
3. Try search box if logs present
4. **Result:** ✅ PASS if logs display

**Test 5: Security Page** (`http://localhost:4000/security`)
1. Check if API keys table loads
2. **Verify:** Shows active API keys count
3. **Result:** ✅ PASS if data loads

---

## 📊 VERIFICATION FORM

| Item | Status | Notes |
|------|--------|-------|
| Products delete button color | ⏳ | Expected: Red/Orange |
| Requests reject button color | ⏳ | Expected: Red/Orange |
| Categories add/delete | ⏳ | Test both operations |
| Settings save/persist | ⏳ | Test toggle + save |
| Consumers filter | ⏳ | Test role filter |
| Audit logs display | ⏳ | Check if loads |
| Security keys display | ⏳ | Check if loads |

---

## ✅ WHEN COMPLETE:

Update status from ⏳ to:
- ✅ PASS (works as expected)
- ❌ FAIL (doesn't work, needs fix)

Report any failures with:
1. What action was performed
2. What happened
3. What error message (if any)
4. Screenshot if possible
