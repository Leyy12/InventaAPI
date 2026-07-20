# 🚀 Quick Setup Guide - Firebase Products

## ✅ What You're Using Now

**Current Database:** Firebase Firestore (NOT PostgreSQL)
- ✅ Firebase already configured for authentication
- ✅ Easy to add products collection
- ✅ No additional database installation needed

---

## 📦 Step 1: Seed Products to Firebase

Run this command to add sample products:

```bash
# Install Firebase SDK (if not already installed)
cd dashboard
npm install firebase

# Go back to root
cd ..

# Run the seed script
node seed-firebase-products.js
```

**Expected Output:**
```
🚀 Starting Firebase product seeding...

✓ Added: Paracetamol 500mg (PHARM-001)
✓ Added: Biogesic 500mg (PHARM-002)
✓ Added: Bioflu (PHARM-003)
... (18 products total)

✅ Successfully seeded 18 products to Firebase!

📊 Summary:
   - Pharmacy: 5 products
   - Hardware: 5 products
   - Grocery: 8 products
   - Total: 18 products
```

---

## 🎯 Step 2: Verify Products in Firebase Console

1. Go to: https://console.firebase.google.com
2. Select your project: **inventaapi**
3. Click **Firestore Database** in left menu
4. You should see a **`products`** collection
5. Click to see all 18 products

---

## 🖥️ Step 3: Test Product Catalog

1. Make sure your Next.js server is running:
   ```bash
   cd dashboard
   npm run dev
   ```

2. Open browser: `http://localhost:3000/dashboard/products`

3. You should see:
   - ✅ 18 products loaded
   - ✅ Filter tabs (All, Pharmacy, Hardware, Grocery)
   - ✅ Product cards with prices and stock
   - ✅ Selection checkboxes

---

## 📝 Product Data Structure in Firebase

Each product document has:

```javascript
{
  sku: "PHARM-001",
  name: "Paracetamol 500mg",
  description: "Pain reliever and fever reducer",
  category: "Pain Relief",
  segment: "Pharmacy",  // Pharmacy, Hardware, or Grocery
  price: 5.50,
  stock: 500,
  metadata: {
    dosage: "500mg",
    prescription_required: false,
    manufacturer: "Generic Pharma"
  },
  tags: ["pain relief", "fever", "otc", "generic"],
  is_active: true,
  is_featured: true,
  created_at: Timestamp,
  updated_at: Timestamp
}
```

---

## 🔧 Troubleshooting

### Problem: "No Products Found"

**Solution 1: Check if seed ran successfully**
```bash
node seed-firebase-products.js
```

**Solution 2: Verify Firebase config**
Check `dashboard/.env.local` has correct values:
```env
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="inventaapi"
```

**Solution 3: Check browser console**
Open DevTools (F12) → Console tab → Look for errors

### Problem: "Firebase not initialized"

Run:
```bash
cd dashboard
npm install firebase
```

---

## 📊 Current Products (18 Total)

### Pharmacy (5 products)
- Paracetamol 500mg - ₱5.50
- Biogesic 500mg - ₱6.50
- Bioflu - ₱9.50
- Kremil-S - ₱5.00
- Vitamin C 500mg - ₱5.00

### Hardware (5 products)
- Hammer Claw 16oz - ₱299.00
- Screwdriver Set 6pcs - ₱250.00
- Tape Measure 5m - ₱95.00
- LED Bulb 9W - ₱55.00
- Cement Portland 40kg - ₱195.00

### Grocery (8 products)
- White Rice 5kg - ₱245.00
- Cooking Oil 1L - ₱89.00
- Soy Sauce 1L - ₱65.00
- Sugar 1kg - ₱55.00
- Instant Coffee 3-in-1 - ₱8.00
- Canned Sardines 155g - ₱25.00
- Instant Noodles 55g - ₱12.00
- Laundry Detergent 1kg - ₱125.00

---

## ➕ Adding More Products

### Option 1: Via Firebase Console (Manual)
1. Go to Firebase Console → Firestore
2. Click `products` collection
3. Click "Add Document"
4. Fill in fields (sku, name, price, etc.)
5. Click "Save"

### Option 2: Via Code (Programmatic)
```javascript
import { addProduct } from '@/lib/firebase/products-service';

await addProduct({
  sku: 'HW-006',
  name: 'Pliers Set 3pcs',
  description: 'Long nose, slip joint, and cutting pliers',
  category: 'Hand Tools',
  segment: 'Hardware',
  price: 380.00,
  stock: 180,
  metadata: { pieces: 3 },
  tags: ['pliers', 'tools'],
  is_active: true
});
```

---

## 🎉 Success Checklist

After running seed script, you should have:

- [x] 18 products in Firebase Firestore
- [x] Products visible in Firebase Console
- [x] Product Catalog page loads with data
- [x] Can filter by segment (Pharmacy, Hardware, Grocery)
- [x] Can select products with checkboxes
- [x] Cart summary shows totals

---

## 🔄 Reset Products (if needed)

To start fresh:

1. Delete `products` collection in Firebase Console
2. Run seed script again:
   ```bash
   node seed-firebase-products.js
   ```

---

## 🚀 Next Steps

Once products are loaded:

1. ✅ Test product selection
2. ✅ Test cart summary
3. ✅ Generate API keys (future feature)
4. ✅ Test API Playground

---

**Firebase is ready to go! No PostgreSQL needed for now.** 🔥
