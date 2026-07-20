import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'data.json');

// Ensure database directory exists
if (!fs.existsSync(__dirname)) {
    fs.mkdirSync(__dirname, { recursive: true });
}

// Initial seed data representing multiple business types with images, variations, sizes, capacities
const initialData = {
    users: [
        {
            id: "u1",
            username: "admin",
            passwordHash: "$2a$10$95XvNsw.d8r/1.C1B8VlA.sS2i2lqZpXF4W5vjYn2.D7E0rXjZtXG", // password: admin123
            role: "admin",
            name: "Lead System Administrator"
        },
        {
            id: "u2",
            username: "cashier",
            passwordHash: "$2a$10$tZ92E7nF7b8bC8W5e6d6GeM79s2Yn2H6W5E3.D7E0rXjZtXG", // password: cashier123
            role: "cashier",
            name: "Jane Doe (Cashier)"
        }
    ],
    products: [
        // --- HARDWARE STORE ---
        {
            id: "prod_hw_1",
            barcode: "4800000000010",
            name: "Deformed Steel Bar",
            category: "Structural Steel",
            businessType: "hardware",
            price: 245.00,
            stock: 120,
            image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=300&auto=format&fit=crop",
            size: "12mm x 6m",
            capacity: "Grade 40 Strength",
            variations: { brand: "Pag-asa Steel", grade: "Grade 40" }
        },
        {
            id: "prod_hw_2",
            barcode: "4800000000027",
            name: "Emerald PVC Sanitary Pipe",
            category: "Plumbing",
            businessType: "hardware",
            price: 380.00,
            stock: 85,
            image: "https://images.unsplash.com/photo-1608613304899-ea8098577e38?q=80&w=300&auto=format&fit=crop",
            size: "3 inches x 10ft",
            capacity: "Sanitary Class 150",
            variations: { color: "Blue", brand: "Emerald Plumbing" }
        },
        // --- PHARMACY / DRUGSTORE ---
        {
            id: "prod_ph_1",
            barcode: "4800165521091",
            name: "Paracetamol",
            category: "Analgesic / Antipyretic",
            businessType: "pharmacy",
            price: 6.50,
            stock: 500,
            image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=300&auto=format&fit=crop",
            size: "500mg Tablet",
            capacity: "10 Tablets per strip",
            variations: { brand: "Biogesic", formulation: "Standard Tablet" }
        },
        {
            id: "prod_ph_2",
            barcode: "4800165521092",
            name: "Amoxicillin Trihydrate",
            category: "Antibacterial",
            businessType: "pharmacy",
            price: 18.00,
            stock: 350,
            image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=300&auto=format&fit=crop",
            size: "500mg Capsule",
            capacity: "Requires Prescription",
            variations: { brand: "Amoxil", formulation: "Capsule" }
        },
        // --- GROCERY / SME RETAIL ---
        {
            id: "prod_gr_1",
            barcode: "4800016552109",
            name: "Silver Swan Soy Sauce",
            category: "Condiments",
            businessType: "grocery",
            price: 45.00,
            stock: 150,
            image: "https://images.unsplash.com/photo-1581646733701-5837fa2a0f54?q=80&w=300&auto=format&fit=crop",
            size: "1 Litre",
            capacity: "PET Bottle",
            variations: { brand: "Silver Swan", type: "Regular Soy Sauce" }
        }
    ],
    sales: [],
    recommendations: [] // Holds products requested/added dynamically by intelligent scanner feature
};

class LocalDatabase {
    constructor() {
        this.data = initialData;
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(DB_FILE)) {
                const raw = fs.readFileSync(DB_FILE, 'utf8');
                this.data = JSON.parse(raw);
            } else {
                this.save();
            }
        } catch (e) {
            console.error("Failed to load local database, resetting to seeds", e);
            this.save();
        }
    }

    save() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (e) {
            console.error("Failed to save local database", e);
        }
    }

    // --- Users Helper ---
    findUser(username) {
        return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    }

    getUserById(id) {
        return this.data.users.find(u => u.id === id);
    }

    // --- Products Helper ---
    getProducts(businessType = null, limit = 100) {
        let results = this.data.products;
        if (businessType) {
            results = results.filter(p => p.businessType === businessType);
        }
        return results.slice(0, limit);
    }

    getProductByBarcode(barcode) {
        return this.data.products.find(p => p.barcode === barcode);
    }

    getProductById(id) {
        return this.data.products.find(p => p.id === id);
    }

    addProduct(prod) {
        const id = "prod_" + Date.now();
        const newProduct = { id, ...prod };
        this.data.products.push(newProduct);
        this.save();
        return newProduct;
    }

    updateProduct(id, updates) {
        const idx = this.data.products.findIndex(p => p.id === id);
        if (idx !== -1) {
            this.data.products[idx] = { ...this.data.products[idx], ...updates };
            this.save();
            return this.data.products[idx];
        }
        return null;
    }

    // --- Sales Helper ---
    getSales() {
        return this.data.sales;
    }

    addSale(sale) {
        const id = "sale_" + Date.now();
        const newSale = { id, timestamp: new Date().toISOString(), ...sale };
        this.data.sales.push(newSale);
        
        // Deduct inventory stock
        sale.items.forEach(item => {
            const prod = this.getProductById(item.productId);
            if (prod) {
                prod.stock = Math.max(0, prod.stock - item.quantity);
            }
        });
        
        this.save();
        return newSale;
    }

    // --- Recommendations/Intelligent Product Acquisition Helper ---
    getRecommendations() {
        return this.data.recommendations;
    }

    addRecommendation(reco) {
        const id = "reco_" + Date.now();
        const newReco = { 
            id, 
            timestamp: new Date().toISOString(), 
            status: "pending", // pending, approved, ignored
            ...reco 
        };
        this.data.recommendations.push(newReco);
        this.save();
        return newReco;
    }

    updateRecommendation(id, updates) {
        const idx = this.data.recommendations.findIndex(r => r.id === id);
        if (idx !== -1) {
            this.data.recommendations[idx] = { ...this.data.recommendations[idx], ...updates, updatedAt: new Date().toISOString() };
            this.save();
            return this.data.recommendations[idx];
        }
        return null;
    }
}

export const db = new LocalDatabase();
