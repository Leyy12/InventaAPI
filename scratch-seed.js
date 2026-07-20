const fs = require('fs');

const items = {
  hardware: [
    "Hammer", "Claw Hammer", "Sledge Hammer", "Phillips Screwdriver", "Flat Screwdriver", "Precision Screwdriver Set",
    "Adjustable Wrench", "Combination Wrench", "Pipe Wrench", "Socket Wrench Set", "Allen Wrench Set", "Power Drill",
    "Impact Drill", "Circular Saw", "Angle Grinder", "Jigsaw", "PVC Pipe", "GI Pipe", "Electrical Wire", "Circuit Breaker",
    "Electrical Switch", "Electrical Outlet", "LED Bulb", "Extension Cord", "Cable Tie", "Silicone Sealant", "Paint",
    "Paint Brush", "Paint Roller", "Wood Screws", "Concrete Nails", "Steel Nails", "Measuring Tape", "Spirit Level",
    "Cement", "Sand", "Gravel", "Steel Bar", "Plywood", "Marine Plywood", "Door Knob", "Padlock", "Chains", "Bolts",
    "Nuts", "Washers"
  ],
  pharmacy: [
    "Paracetamol", "Ibuprofen", "Mefenamic Acid", "Cetirizine", "Loratadine", "Amoxicillin", "Azithromycin", "Vitamin C",
    "Multivitamins", "Calcium Tablets", "Iron Supplements", "ORS", "Antacid", "Loperamide", "Cough Syrup", "Alcohol",
    "Hydrogen Peroxide", "Betadine", "Face Mask", "Disposable Gloves", "Cotton Balls", "Cotton Buds", "Gauze Pad",
    "Elastic Bandage", "Medical Tape", "Digital Thermometer", "Blood Pressure Monitor", "Nebulizer", "Glucometer",
    "Glucose Test Strips", "Insulin Syringe", "Disposable Syringe", "Pulse Oximeter", "Pregnancy Test Kit"
  ],
  grocery: [
    "Rice", "Sugar", "Salt", "Cooking Oil", "Soy Sauce", "Vinegar", "Fish Sauce", "Coffee", "Milk", "Powdered Milk",
    "Bread", "Eggs", "Butter", "Cheese", "Instant Noodles", "Canned Sardines", "Corned Beef", "Tuna", "Hotdog", "Ham",
    "Biscuits", "Cookies", "Chocolate", "Candy", "Soft Drinks", "Mineral Water", "Juice", "Energy Drink",
    "Laundry Detergent", "Fabric Conditioner", "Dishwashing Liquid", "Bath Soap", "Shampoo", "Conditioner",
    "Toothpaste", "Toothbrush", "Toilet Tissue", "Paper Towel", "Garbage Bag"
  ],
  clothing: [
    "Plain T-Shirt", "Graphic T-Shirt", "Polo Shirt", "Long Sleeve Shirt", "Hoodie", "Sweater", "Jacket", "Blazer",
    "Dress", "Skirt", "Jeans", "Jogger Pants", "Cargo Pants", "Shorts", "Leggings", "Cap", "Beanie", "Belt", "Wallet",
    "Handbag", "Backpack", "Sneakers", "Running Shoes", "Leather Shoes", "Sandals", "Slippers", "Socks", "Undershirt",
    "Pajama Set"
  ]
};

const images = {
  hardware: "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
  pharmacy: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
  grocery: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
  clothing: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop"
};

const variations = {
  hardware: [
    { type: 'Weight', options: ['8 oz', '12 oz', '16 oz', '20 oz'] },
    { type: 'Length', options: ['10ft', '20ft'] }
  ],
  pharmacy: [
    { type: 'Dosage', options: ['250 mg', '500 mg', '650 mg'] }
  ],
  grocery: [
    { type: 'Weight', options: ['1 kg', '5 kg', '10 kg', '25 kg'] },
    { type: 'Volume', options: ['250mL', '500mL', '1L'] }
  ],
  clothing: [
    { type: 'Size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { type: 'Color', options: ['Black', 'White', 'Gray', 'Blue', 'Red', 'Green'] }
  ]
};

let productsArr = [];
let barcodeCounter = 4800000000100;

for (let [cat, names] of Object.entries(items)) {
  names.forEach(name => {
    let barcode = (barcodeCounter++).toString();
    let price = Math.floor(Math.random() * 500) + 50;
    let stock = Math.floor(Math.random() * 200) + 10;
    
    // Choose sensible variations based on name
    let prodVars = [];
    if (cat === 'clothing') prodVars = variations.clothing;
    if (cat === 'grocery' && (name === 'Rice' || name === 'Sugar' || name === 'Salt')) prodVars = [variations.grocery[0]];
    if (cat === 'pharmacy' && (name.includes('mol') || name.includes('fen'))) prodVars = variations.pharmacy;
    if (cat === 'hardware' && name.includes('Hammer')) prodVars = [variations.hardware[0]];

    productsArr.push({
      barcode,
      name,
      description: 'Premium quality ' + name + ' for your business needs.',
      category: cat.charAt(0).toUpperCase() + cat.slice(1),
      businessType: cat,
      price,
      stock,
      image: images[cat],
      size: 'Standard',
      capacity: 'Standard',
      weight: 'N/A',
      color: 'Assorted',
      uom: 'pcs',
      status: 'Active',
      variations: prodVars,
      attributes: { brand: 'Generic Premium' },
      expirationDate: cat === 'grocery' || cat === 'pharmacy' ? '2027-12-31' : null,
      supplierInfo: { name: 'Master Supplier', contact: 'sales@mastersupplier.com' }
    });
  });
}

const seedScript = \/**
 * ============================================================
 *  INVENTAAPI FIRESTORE SEED SCRIPT (AUTO-GENERATED)
 *  Run: node database/seed.js
 * ============================================================
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId:   process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, '\\n'),
        }),
    });
}

const firestore = getFirestore();

const USERS = [
    {
        id: 'u_admin',
        username: 'balquinkevinconeal27@gmail.com',
        passwordHash: await bcrypt.hash('admin123', 10),
        role: 'admin',
        name: 'Lead System Administrator',
    },
    {
        id: 'u_developer',
        username: 'developer',
        passwordHash: await bcrypt.hash('developer123', 10),
        role: 'developer',
        name: 'SME App Builder / Software Developer',
    },
];

const PRODUCTS = \;

async function seedUsers() {
    console.log('\\n?? Seeding users...');
    const usersCol = firestore.collection('users');
    const snap = await usersCol.get();
    const deleteBatch = firestore.batch();
    snap.docs.forEach(doc => deleteBatch.delete(doc.ref));
    if (!snap.empty) await deleteBatch.commit();

    for (const user of USERS) {
        await usersCol.doc(user.id).set({
            username:     user.username,
            passwordHash: user.passwordHash,
            role:         user.role,
            name:         user.name,
            createdAt:    FieldValue.serverTimestamp(),
        });
        console.log(\  ? CREATED: User '\'\);
    }
}

async function seedProducts() {
    const productsCol = firestore.collection('products');
    console.log('\\n???  Clearing existing products...');
    const snap = await productsCol.get();
    const deleteBatch = firestore.batch();
    snap.docs.forEach(doc => deleteBatch.delete(doc.ref));
    if (!snap.empty) await deleteBatch.commit();

    console.log('\\n?? Seeding \ products...');
    for (const p of PRODUCTS) {
        await productsCol.add({
            barcode: p.barcode,
            name: p.name,
            nameLower: p.name.toLowerCase(),
            description: p.description,
            category: p.category,
            businessType: p.businessType,
            price: p.price,
            stock: p.stock,
            image_url: p.image, // New schema uses image_url or image
            image: p.image,
            size: p.size,
            color: p.color,
            capacity: p.capacity,
            weight: p.weight,
            uom: p.uom,
            status: p.status,
            variations: p.variations,
            attributes: p.attributes,
            expirationDate: p.expirationDate,
            supplierInfo: p.supplierInfo,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }
    console.log('  ? Seeded ' + PRODUCTS.length + ' products.');
}

async function runSeed() {
    try {
        console.log('Starting seed process...');
        await seedUsers();
        await seedProducts();
        console.log('\\n?? SEED COMPLETE!');
        process.exit(0);
    } catch (e) {
        console.error('Seed error:', e);
        process.exit(1);
    }
}
runSeed();
\;

fs.writeFileSync('c:/API/database/seed.js', seedScript);
console.log('Successfully wrote to seed.js');
