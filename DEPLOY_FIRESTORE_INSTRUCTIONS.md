# 🔥 FIRESTORE DEPLOYMENT INSTRUCTIONS

## ✅ PRE-DEPLOYMENT VERIFICATION

**Rules File Status:**
- ✅ `FINAL_FIRESTORE_RULES_TO_PUBLISH.rules` is CORRECT
- ✅ Contains proper write permissions (`allow create, update, delete`)
- ✅ Already copied to `firestore.rules`

**Write Permissions Confirmed:**
- Users: create (signup), update (own profile), delete (admin only)
- Products: create/update/delete (admin only)
- Product Requests: create (own), update (own/admin), delete (admin only)
- API Keys: create/update/delete (own keys)
- Transactions: NO client writes (webhook only)

**Indexes File Status:**
- ✅ `firestore.indexes.json` exists
- ✅ 6 composite indexes defined

---

## 📋 DEPLOYMENT COMMANDS

Run these commands in sequence:

### 1. Login to Firebase (if not already logged in)
```bash
firebase login
```

### 2. Select the correct project
```bash
firebase use inventaapi-db
```

### 3. Deploy BOTH rules and indexes together
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

**Expected Output:**
```
✔  Deploy complete!

Project Console: https://console.firebase.google.com/project/inventaapi-db/overview
Firestore Rules: Released
Firestore Indexes: 6 indexes created/updated
```

---

## ✅ VERIFICATION

### Via Firebase Console:
1. Go to https://console.firebase.google.com/project/inventaapi-db/firestore/rules
2. Check "Published" timestamp — should be today's date
3. Go to https://console.firebase.google.com/project/inventaapi-db/firestore/indexes
4. Verify all 6 indexes show as "Enabled" (not "Building")

### Via CLI:
```bash
firebase firestore:indexes
```
Should show all 6 indexes with status "ENABLED"

---

## 🚨 IF DEPLOYMENT FAILS

### Error: "Permission denied"
- Ensure you're logged in as the project owner
- Run: `firebase logout` then `firebase login` again

### Error: "Project not found"
- Run: `firebase projects:list`
- Confirm `inventaapi-db` is in the list
- Run: `firebase use inventaapi-db`

### Error: "Index creation failed"
- Indexes may already exist — this is OK
- Check Firebase Console to verify status

---

## 📊 EXPECTED FIRESTORE INDEXES (6 total)

1. **product_requests**: status (ASC) + createdAt (DESC)
2. **product_requests**: status (ASC) + created_at (DESC)
3. **products**: is_active (ASC) + segment (ASC) + name (ASC)
4. **notifications**: user_email (ASC) + is_read (ASC) + created_at (DESC)
5. **users**: role (ASC) + email (ASC)
6. **api_keys**: userId (ASC) + status (ASC)

---

## ✅ AFTER DEPLOYMENT

Mark Item 1 as: **✅ DEPLOYED** and note the deployment timestamp.

Then proceed to Priority 2 tests (PayMongo, auth redirect, delete sync).
