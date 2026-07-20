/**
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
            privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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

const PRODUCTS = [
    {
        "barcode": "4800000000100",
        "name": "Hammer",
        "description": "Premium quality Hammer for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 64,
        "stock": 88,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Weight",
                "options": [
                    "8 oz",
                    "12 oz",
                    "16 oz",
                    "20 oz"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000101",
        "name": "Claw Hammer",
        "description": "Premium quality Claw Hammer for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 199,
        "stock": 201,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Weight",
                "options": [
                    "8 oz",
                    "12 oz",
                    "16 oz",
                    "20 oz"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000102",
        "name": "Sledge Hammer",
        "description": "Premium quality Sledge Hammer for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 112,
        "stock": 111,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Weight",
                "options": [
                    "8 oz",
                    "12 oz",
                    "16 oz",
                    "20 oz"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000103",
        "name": "Phillips Screwdriver",
        "description": "Premium quality Phillips Screwdriver for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 482,
        "stock": 68,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000104",
        "name": "Flat Screwdriver",
        "description": "Premium quality Flat Screwdriver for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 261,
        "stock": 140,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000105",
        "name": "Precision Screwdriver Set",
        "description": "Premium quality Precision Screwdriver Set for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 450,
        "stock": 37,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000106",
        "name": "Adjustable Wrench",
        "description": "Premium quality Adjustable Wrench for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 415,
        "stock": 162,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000107",
        "name": "Combination Wrench",
        "description": "Premium quality Combination Wrench for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 129,
        "stock": 136,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000108",
        "name": "Pipe Wrench",
        "description": "Premium quality Pipe Wrench for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 304,
        "stock": 186,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000109",
        "name": "Socket Wrench Set",
        "description": "Premium quality Socket Wrench Set for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 263,
        "stock": 75,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000110",
        "name": "Allen Wrench Set",
        "description": "Premium quality Allen Wrench Set for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 282,
        "stock": 57,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000111",
        "name": "Power Drill",
        "description": "Premium quality Power Drill for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 88,
        "stock": 122,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000112",
        "name": "Impact Drill",
        "description": "Premium quality Impact Drill for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 510,
        "stock": 57,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000113",
        "name": "Circular Saw",
        "description": "Premium quality Circular Saw for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 497,
        "stock": 167,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000114",
        "name": "Angle Grinder",
        "description": "Premium quality Angle Grinder for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 325,
        "stock": 41,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000115",
        "name": "Jigsaw",
        "description": "Premium quality Jigsaw for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 211,
        "stock": 67,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000116",
        "name": "PVC Pipe",
        "description": "Premium quality PVC Pipe for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 461,
        "stock": 101,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000117",
        "name": "GI Pipe",
        "description": "Premium quality GI Pipe for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 325,
        "stock": 61,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000118",
        "name": "Electrical Wire",
        "description": "Premium quality Electrical Wire for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 240,
        "stock": 23,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000119",
        "name": "Circuit Breaker",
        "description": "Premium quality Circuit Breaker for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 435,
        "stock": 158,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000120",
        "name": "Electrical Switch",
        "description": "Premium quality Electrical Switch for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 373,
        "stock": 44,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000121",
        "name": "Electrical Outlet",
        "description": "Premium quality Electrical Outlet for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 520,
        "stock": 20,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000122",
        "name": "LED Bulb",
        "description": "Premium quality LED Bulb for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 371,
        "stock": 111,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000123",
        "name": "Extension Cord",
        "description": "Premium quality Extension Cord for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 238,
        "stock": 76,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000124",
        "name": "Cable Tie",
        "description": "Premium quality Cable Tie for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 510,
        "stock": 173,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000125",
        "name": "Silicone Sealant",
        "description": "Premium quality Silicone Sealant for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 123,
        "stock": 25,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000126",
        "name": "Paint",
        "description": "Premium quality Paint for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 377,
        "stock": 60,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000127",
        "name": "Paint Brush",
        "description": "Premium quality Paint Brush for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 167,
        "stock": 162,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000128",
        "name": "Paint Roller",
        "description": "Premium quality Paint Roller for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 93,
        "stock": 89,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000129",
        "name": "Wood Screws",
        "description": "Premium quality Wood Screws for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 329,
        "stock": 92,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000130",
        "name": "Concrete Nails",
        "description": "Premium quality Concrete Nails for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 141,
        "stock": 165,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000131",
        "name": "Steel Nails",
        "description": "Premium quality Steel Nails for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 177,
        "stock": 68,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000132",
        "name": "Measuring Tape",
        "description": "Premium quality Measuring Tape for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 269,
        "stock": 174,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000133",
        "name": "Spirit Level",
        "description": "Premium quality Spirit Level for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 101,
        "stock": 54,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000134",
        "name": "Cement",
        "description": "Premium quality Cement for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 124,
        "stock": 186,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000135",
        "name": "Sand",
        "description": "Premium quality Sand for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 441,
        "stock": 66,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000136",
        "name": "Gravel",
        "description": "Premium quality Gravel for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 340,
        "stock": 161,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000137",
        "name": "Steel Bar",
        "description": "Premium quality Steel Bar for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 525,
        "stock": 139,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000138",
        "name": "Plywood",
        "description": "Premium quality Plywood for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 130,
        "stock": 53,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000139",
        "name": "Marine Plywood",
        "description": "Premium quality Marine Plywood for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 468,
        "stock": 124,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000140",
        "name": "Door Knob",
        "description": "Premium quality Door Knob for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 465,
        "stock": 128,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000141",
        "name": "Padlock",
        "description": "Premium quality Padlock for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 344,
        "stock": 56,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000142",
        "name": "Chains",
        "description": "Premium quality Chains for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 57,
        "stock": 193,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000143",
        "name": "Bolts",
        "description": "Premium quality Bolts for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 531,
        "stock": 118,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000144",
        "name": "Nuts",
        "description": "Premium quality Nuts for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 253,
        "stock": 163,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000145",
        "name": "Washers",
        "description": "Premium quality Washers for your business needs.",
        "category": "Hardware",
        "businessType": "hardware",
        "price": 255,
        "stock": 15,
        "image": "https://images.unsplash.com/photo-1504148455328-c376907d081c?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000146",
        "name": "Paracetamol",
        "description": "Premium quality Paracetamol for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 81,
        "stock": 186,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Dosage",
                "options": [
                    "250 mg",
                    "500 mg",
                    "650 mg"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000147",
        "name": "Ibuprofen",
        "description": "Premium quality Ibuprofen for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 541,
        "stock": 27,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Dosage",
                "options": [
                    "250 mg",
                    "500 mg",
                    "650 mg"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000148",
        "name": "Mefenamic Acid",
        "description": "Premium quality Mefenamic Acid for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 485,
        "stock": 22,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Dosage",
                "options": [
                    "250 mg",
                    "500 mg",
                    "650 mg"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000149",
        "name": "Cetirizine",
        "description": "Premium quality Cetirizine for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 342,
        "stock": 171,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000150",
        "name": "Loratadine",
        "description": "Premium quality Loratadine for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 337,
        "stock": 58,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000151",
        "name": "Amoxicillin",
        "description": "Premium quality Amoxicillin for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 390,
        "stock": 200,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000152",
        "name": "Azithromycin",
        "description": "Premium quality Azithromycin for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 287,
        "stock": 154,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000153",
        "name": "Vitamin C",
        "description": "Premium quality Vitamin C for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 533,
        "stock": 72,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000154",
        "name": "Multivitamins",
        "description": "Premium quality Multivitamins for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 92,
        "stock": 106,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000155",
        "name": "Calcium Tablets",
        "description": "Premium quality Calcium Tablets for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 329,
        "stock": 139,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000156",
        "name": "Iron Supplements",
        "description": "Premium quality Iron Supplements for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 219,
        "stock": 48,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000157",
        "name": "ORS",
        "description": "Premium quality ORS for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 239,
        "stock": 191,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000158",
        "name": "Antacid",
        "description": "Premium quality Antacid for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 478,
        "stock": 22,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000159",
        "name": "Loperamide",
        "description": "Premium quality Loperamide for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 87,
        "stock": 159,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000160",
        "name": "Cough Syrup",
        "description": "Premium quality Cough Syrup for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 134,
        "stock": 34,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000161",
        "name": "Alcohol",
        "description": "Premium quality Alcohol for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 406,
        "stock": 209,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000162",
        "name": "Hydrogen Peroxide",
        "description": "Premium quality Hydrogen Peroxide for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 507,
        "stock": 93,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000163",
        "name": "Betadine",
        "description": "Premium quality Betadine for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 182,
        "stock": 126,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000164",
        "name": "Face Mask",
        "description": "Premium quality Face Mask for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 243,
        "stock": 93,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000165",
        "name": "Disposable Gloves",
        "description": "Premium quality Disposable Gloves for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 130,
        "stock": 57,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000166",
        "name": "Cotton Balls",
        "description": "Premium quality Cotton Balls for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 534,
        "stock": 167,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000167",
        "name": "Cotton Buds",
        "description": "Premium quality Cotton Buds for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 140,
        "stock": 66,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000168",
        "name": "Gauze Pad",
        "description": "Premium quality Gauze Pad for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 439,
        "stock": 31,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000169",
        "name": "Elastic Bandage",
        "description": "Premium quality Elastic Bandage for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 61,
        "stock": 44,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000170",
        "name": "Medical Tape",
        "description": "Premium quality Medical Tape for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 55,
        "stock": 39,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000171",
        "name": "Digital Thermometer",
        "description": "Premium quality Digital Thermometer for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 350,
        "stock": 201,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000172",
        "name": "Blood Pressure Monitor",
        "description": "Premium quality Blood Pressure Monitor for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 458,
        "stock": 79,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000173",
        "name": "Nebulizer",
        "description": "Premium quality Nebulizer for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 308,
        "stock": 57,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000174",
        "name": "Glucometer",
        "description": "Premium quality Glucometer for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 252,
        "stock": 180,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000175",
        "name": "Glucose Test Strips",
        "description": "Premium quality Glucose Test Strips for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 403,
        "stock": 111,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000176",
        "name": "Insulin Syringe",
        "description": "Premium quality Insulin Syringe for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 313,
        "stock": 41,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000177",
        "name": "Disposable Syringe",
        "description": "Premium quality Disposable Syringe for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 481,
        "stock": 19,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000178",
        "name": "Pulse Oximeter",
        "description": "Premium quality Pulse Oximeter for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 353,
        "stock": 86,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000179",
        "name": "Pregnancy Test Kit",
        "description": "Premium quality Pregnancy Test Kit for your business needs.",
        "category": "Pharmacy",
        "businessType": "pharmacy",
        "price": 113,
        "stock": 13,
        "image": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000180",
        "name": "Rice",
        "description": "Premium quality Rice for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 130,
        "stock": 206,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Weight",
                "options": [
                    "1 kg",
                    "5 kg",
                    "10 kg",
                    "25 kg"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000181",
        "name": "Sugar",
        "description": "Premium quality Sugar for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 506,
        "stock": 104,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Weight",
                "options": [
                    "1 kg",
                    "5 kg",
                    "10 kg",
                    "25 kg"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000182",
        "name": "Salt",
        "description": "Premium quality Salt for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 151,
        "stock": 190,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Weight",
                "options": [
                    "1 kg",
                    "5 kg",
                    "10 kg",
                    "25 kg"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000183",
        "name": "Cooking Oil",
        "description": "Premium quality Cooking Oil for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 225,
        "stock": 91,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000184",
        "name": "Soy Sauce",
        "description": "Premium quality Soy Sauce for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 93,
        "stock": 155,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000185",
        "name": "Vinegar",
        "description": "Premium quality Vinegar for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 207,
        "stock": 40,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000186",
        "name": "Fish Sauce",
        "description": "Premium quality Fish Sauce for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 178,
        "stock": 44,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000187",
        "name": "Coffee",
        "description": "Premium quality Coffee for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 420,
        "stock": 129,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000188",
        "name": "Milk",
        "description": "Premium quality Milk for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 488,
        "stock": 89,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000189",
        "name": "Powdered Milk",
        "description": "Premium quality Powdered Milk for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 402,
        "stock": 57,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000190",
        "name": "Bread",
        "description": "Premium quality Bread for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 363,
        "stock": 181,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000191",
        "name": "Eggs",
        "description": "Premium quality Eggs for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 253,
        "stock": 93,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000192",
        "name": "Butter",
        "description": "Premium quality Butter for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 235,
        "stock": 108,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000193",
        "name": "Cheese",
        "description": "Premium quality Cheese for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 343,
        "stock": 19,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000194",
        "name": "Instant Noodles",
        "description": "Premium quality Instant Noodles for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 50,
        "stock": 51,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000195",
        "name": "Canned Sardines",
        "description": "Premium quality Canned Sardines for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 159,
        "stock": 90,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000196",
        "name": "Corned Beef",
        "description": "Premium quality Corned Beef for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 460,
        "stock": 144,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000197",
        "name": "Tuna",
        "description": "Premium quality Tuna for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 304,
        "stock": 58,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000198",
        "name": "Hotdog",
        "description": "Premium quality Hotdog for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 355,
        "stock": 196,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000199",
        "name": "Ham",
        "description": "Premium quality Ham for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 72,
        "stock": 50,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000200",
        "name": "Biscuits",
        "description": "Premium quality Biscuits for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 390,
        "stock": 23,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000201",
        "name": "Cookies",
        "description": "Premium quality Cookies for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 409,
        "stock": 95,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000202",
        "name": "Chocolate",
        "description": "Premium quality Chocolate for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 92,
        "stock": 20,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000203",
        "name": "Candy",
        "description": "Premium quality Candy for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 442,
        "stock": 34,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000204",
        "name": "Soft Drinks",
        "description": "Premium quality Soft Drinks for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 257,
        "stock": 109,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000205",
        "name": "Mineral Water",
        "description": "Premium quality Mineral Water for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 204,
        "stock": 90,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000206",
        "name": "Juice",
        "description": "Premium quality Juice for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 146,
        "stock": 58,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000207",
        "name": "Energy Drink",
        "description": "Premium quality Energy Drink for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 118,
        "stock": 174,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000208",
        "name": "Laundry Detergent",
        "description": "Premium quality Laundry Detergent for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 115,
        "stock": 127,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000209",
        "name": "Fabric Conditioner",
        "description": "Premium quality Fabric Conditioner for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 329,
        "stock": 111,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000210",
        "name": "Dishwashing Liquid",
        "description": "Premium quality Dishwashing Liquid for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 304,
        "stock": 81,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000211",
        "name": "Bath Soap",
        "description": "Premium quality Bath Soap for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 81,
        "stock": 140,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000212",
        "name": "Shampoo",
        "description": "Premium quality Shampoo for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 236,
        "stock": 118,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000213",
        "name": "Conditioner",
        "description": "Premium quality Conditioner for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 413,
        "stock": 18,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000214",
        "name": "Toothpaste",
        "description": "Premium quality Toothpaste for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 264,
        "stock": 88,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000215",
        "name": "Toothbrush",
        "description": "Premium quality Toothbrush for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 215,
        "stock": 27,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000216",
        "name": "Toilet Tissue",
        "description": "Premium quality Toilet Tissue for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 127,
        "stock": 174,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000217",
        "name": "Paper Towel",
        "description": "Premium quality Paper Towel for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 138,
        "stock": 57,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000218",
        "name": "Garbage Bag",
        "description": "Premium quality Garbage Bag for your business needs.",
        "category": "Grocery",
        "businessType": "grocery",
        "price": 470,
        "stock": 80,
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": "2027-12-31",
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000219",
        "name": "Plain T-Shirt",
        "description": "Premium quality Plain T-Shirt for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 454,
        "stock": 99,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000220",
        "name": "Graphic T-Shirt",
        "description": "Premium quality Graphic T-Shirt for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 286,
        "stock": 19,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000221",
        "name": "Polo Shirt",
        "description": "Premium quality Polo Shirt for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 459,
        "stock": 23,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000222",
        "name": "Long Sleeve Shirt",
        "description": "Premium quality Long Sleeve Shirt for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 474,
        "stock": 143,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000223",
        "name": "Hoodie",
        "description": "Premium quality Hoodie for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 132,
        "stock": 117,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000224",
        "name": "Sweater",
        "description": "Premium quality Sweater for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 191,
        "stock": 64,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000225",
        "name": "Jacket",
        "description": "Premium quality Jacket for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 500,
        "stock": 124,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000226",
        "name": "Blazer",
        "description": "Premium quality Blazer for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 112,
        "stock": 68,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000227",
        "name": "Dress",
        "description": "Premium quality Dress for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 195,
        "stock": 134,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000228",
        "name": "Skirt",
        "description": "Premium quality Skirt for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 478,
        "stock": 126,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000229",
        "name": "Jeans",
        "description": "Premium quality Jeans for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 300,
        "stock": 36,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000230",
        "name": "Jogger Pants",
        "description": "Premium quality Jogger Pants for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 150,
        "stock": 173,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000231",
        "name": "Cargo Pants",
        "description": "Premium quality Cargo Pants for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 493,
        "stock": 82,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000232",
        "name": "Shorts",
        "description": "Premium quality Shorts for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 239,
        "stock": 76,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000233",
        "name": "Leggings",
        "description": "Premium quality Leggings for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 122,
        "stock": 39,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000234",
        "name": "Cap",
        "description": "Premium quality Cap for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 117,
        "stock": 69,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000235",
        "name": "Beanie",
        "description": "Premium quality Beanie for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 70,
        "stock": 46,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000236",
        "name": "Belt",
        "description": "Premium quality Belt for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 101,
        "stock": 126,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000237",
        "name": "Wallet",
        "description": "Premium quality Wallet for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 519,
        "stock": 198,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000238",
        "name": "Handbag",
        "description": "Premium quality Handbag for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 241,
        "stock": 127,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000239",
        "name": "Backpack",
        "description": "Premium quality Backpack for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 507,
        "stock": 113,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000240",
        "name": "Sneakers",
        "description": "Premium quality Sneakers for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 232,
        "stock": 65,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000241",
        "name": "Running Shoes",
        "description": "Premium quality Running Shoes for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 60,
        "stock": 204,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000242",
        "name": "Leather Shoes",
        "description": "Premium quality Leather Shoes for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 289,
        "stock": 85,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000243",
        "name": "Sandals",
        "description": "Premium quality Sandals for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 339,
        "stock": 17,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000244",
        "name": "Slippers",
        "description": "Premium quality Slippers for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 373,
        "stock": 158,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000245",
        "name": "Socks",
        "description": "Premium quality Socks for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 192,
        "stock": 13,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000246",
        "name": "Undershirt",
        "description": "Premium quality Undershirt for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 348,
        "stock": 198,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    },
    {
        "barcode": "4800000000247",
        "name": "Pajama Set",
        "description": "Premium quality Pajama Set for your business needs.",
        "category": "Clothing",
        "businessType": "clothing",
        "price": 331,
        "stock": 119,
        "image": "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=400&auto=format&fit=crop",
        "size": "Standard",
        "capacity": "Standard",
        "weight": "N/A",
        "color": "Assorted",
        "uom": "pcs",
        "status": "Active",
        "variations": [
            {
                "type": "Size",
                "options": [
                    "XS",
                    "S",
                    "M",
                    "L",
                    "XL",
                    "XXL"
                ]
            },
            {
                "type": "Color",
                "options": [
                    "Black",
                    "White",
                    "Gray",
                    "Blue",
                    "Red",
                    "Green"
                ]
            }
        ],
        "attributes": {
            "brand": "Generic Premium"
        },
        "expirationDate": null,
        "supplierInfo": {
            "name": "Master Supplier",
            "contact": "sales@mastersupplier.com"
        }
    }
];

async function seedUsers() {
    console.log('\n📦 Seeding users...');
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
        console.log(`  ✅ CREATED: User '${user.username}'`);
    }
}

async function seedProducts() {
    const productsCol = firestore.collection('products');
    console.log('\n🗑️  Clearing existing products...');
    const snap = await productsCol.get();
    const deleteBatch = firestore.batch();
    snap.docs.forEach(doc => deleteBatch.delete(doc.ref));
    if (!snap.empty) await deleteBatch.commit();

    console.log('\n📦 Seeding ' + PRODUCTS.length + ' products...');
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
    console.log('  ✅ Seeded ' + PRODUCTS.length + ' products.');
}

async function runSeed() {
    try {
        console.log('Starting seed process...');
        await seedUsers();
        await seedProducts();
        console.log('\n🎉 SEED COMPLETE!');
        process.exit(0);
    } catch (e) {
        console.error('Seed error:', e);
        process.exit(1);
    }
}
runSeed();
