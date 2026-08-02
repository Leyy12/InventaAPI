import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

if (!getApps().length) {
    const serviceAccount = require(path.resolve(__dirname, '../service-account.json'));
    initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function runTest() {
    console.log("--- STARTING DUPLICATE PREVENTION TEST ---");
    
    // 1. Emulate the batch script's fetching logic
    console.log("Fetching existing products to build duplicate-check set...");
    const snapshot = await db.collection('products').get();
    const existingNames = new Set(snapshot.docs.map(d => d.data().name.toLowerCase()));
    
    console.log(`Database currently contains ${existingNames.size} products.`);
    
    // 2. Define test cases (2 existing from Batch 1, 1 completely new)
    const testProducts = [
        { name: "Oishi Prawn Crackers", category: "Grocery", expected: "BLOCKED" },
        { name: "Stanley Utility Knife with Retractable Blade", category: "Hardware", expected: "BLOCKED" },
        { name: "Brand New Test Product 999", category: "Pharmacy", expected: "ALLOWED" }
    ];

    console.log("\n--- RUNNING CHECKS ---");
    let skippedCount = 0;
    let allowedCount = 0;

    for (const prod of testProducts) {
        console.log(`\nTesting input: "${prod.name}"`);
        if (existingNames.has(prod.name.toLowerCase())) {
            console.log(`[RESULT] ❌ BLOCKED: Duplicate detected in database.`);
            skippedCount++;
        } else {
            console.log(`[RESULT] ✅ ALLOWED: Product is new, can be inserted.`);
            allowedCount++;
        }
    }
    
    console.log(`\n--- SUMMARY ---`);
    console.log(`Blocked (Duplicates): ${skippedCount}`);
    console.log(`Allowed (New): ${allowedCount}`);
}

runTest().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
