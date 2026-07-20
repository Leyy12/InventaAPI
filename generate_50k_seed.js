import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'database', 'data.json');

// Existing data structure
let existingData = { users: [], products: [], sales: [], recommendations: [] };
if (fs.existsSync(dbPath)) {
    existingData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

const products = [];

// Generators for 4 industries
const hwBrands = ['Pag-asa', 'Emerald', 'Bosch', 'Makita', 'Stanley', 'DeWalt', 'Boysen', 'Davies'];
const hwCategories = ['Structural Steel', 'Plumbing', 'Power Tools', 'Hand Tools', 'Paints', 'Electrical'];
const hwItems = ['Steel Bar', 'PVC Pipe', 'Drill', 'Hammer', 'Wrench', 'Latex Paint', 'Wire', 'Screwdriver'];

const phBrands = ['Biogesic', 'Amoxil', 'Neozep', 'Alaxan', 'Centrum', 'Enervon', 'Solmux', 'Decolgen'];
const phCategories = ['Analgesic', 'Antibacterial', 'Vitamins', 'Cough & Cold', 'First Aid'];
const phItems = ['Tablet', 'Capsule', 'Syrup', 'Drops', 'Ointment', 'Bandage'];

const grBrands = ['Silver Swan', 'Datu Puti', 'Lucky Me', 'Nestle', 'Monde', 'Oishi', 'Jack n Jill', 'Del Monte'];
const grCategories = ['Condiments', 'Noodles', 'Beverages', 'Snacks', 'Canned Goods'];
const grItems = ['Soy Sauce', 'Vinegar', 'Pancit Canton', 'Coffee', 'Biscuits', 'Chips', 'Corned Beef', 'Ketchup'];

const clBrands = ['Bench', 'Penshoppe', 'Uniqlo', 'H&M', 'Zara', 'Oxygen', 'Folded & Hung', 'Kamiseta'];
const clCategories = ['T-Shirts', 'Pants', 'Dresses', 'Jackets', 'Accessories', 'Shorts'];
const clItems = ['Cotton Tee', 'Denim Jeans', 'Summer Dress', 'Hoodie', 'Cap', 'Cargo Shorts'];

const sizes = ['Small', 'Medium', 'Large', 'XL', '1L', '500ml', '250mg', '500mg', '10mm', '1/2 inch'];
const colors = ['Red', 'Blue', 'Green', 'Black', 'White', 'Yellow', 'Silver', 'Clear'];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

let barcodeCounter = 1000000000000;
let skuCounter = 100000;

function generateProducts(count, industry, brands, categories, items) {
    for (let i = 0; i < count; i++) {
        const brand = getRandom(brands);
        const category = getRandom(categories);
        const item = getRandom(items);
        const size = getRandom(sizes);
        const color = getRandom(colors);
        const model = `MDL-${Math.floor(Math.random() * 9000) + 1000}`;
        
        const productName = `${brand} ${item} ${model}`;
        barcodeCounter++;
        skuCounter++;
        
        products.push({
            id: `prod_${industry}_${skuCounter}`,
            sku: `SKU-${industry.substring(0,3).toUpperCase()}-${skuCounter}`,
            barcode: barcodeCounter.toString(),
            name: productName,
            brand: brand,
            category: category,
            subcategory: `${category} Accessories`,
            businessType: industry,
            description: `High-quality ${productName} for your ${industry} business.`,
            specifications: `Size: ${size}, Color: ${color}, Model: ${model}`,
            price: parseFloat((Math.random() * 1000 + 10).toFixed(2)),
            stock: Math.floor(Math.random() * 500) + 10,
            image_url: `https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=300&auto=format&fit=crop`,
            image: `https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=300&auto=format&fit=crop`,
            size: size,
            capacity: "Standard",
            uom: industry === 'grocery' ? 'pcs' : 'unit',
            variations: [
                { type: "Color", value: color },
                { type: "Size", value: size }
            ],
            status: Math.random() > 0.1 ? "Active" : "Out of Stock",
            dateCreated: new Date(Date.now() - Math.random() * 10000000000).toISOString(),
            lastUpdated: new Date().toISOString()
        });
    }
}

console.log("Generating 12,500 products per industry...");
generateProducts(12500, 'hardware', hwBrands, hwCategories, hwItems);
generateProducts(12500, 'pharmacy', phBrands, phCategories, phItems);
generateProducts(12500, 'grocery', grBrands, grCategories, grItems);
generateProducts(12500, 'clothing', clBrands, clCategories, clItems);

existingData.products = products; 

console.log("Writing to data.json... This might take a few seconds.");
fs.writeFileSync(dbPath, JSON.stringify(existingData, null, 2), 'utf-8');
console.log(`Successfully generated ${products.length} products to ${dbPath}`);
