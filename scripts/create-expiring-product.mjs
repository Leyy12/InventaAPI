import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();

async function run() {
  const now = new Date();
  now.setDate(now.getDate() + 15);
  const expDateStr = now.toISOString().split('T')[0];
  
  const payload = {
    name: "Test Expiring Product",
    brand: "Tester",
    category: "Grocery",
    segment: "Grocery",
    status: "Active",
    is_active: true,
    variants: [
      {
        flavor: "Original",
        size: "100g",
        price: 50,
        sku: "TEST-EXP-001",
        expirationDate: expDateStr
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const ref = await db.collection('products').add(payload);
  console.log(`Created test expiring product with ID: ${ref.id} and exp date: ${expDateStr}`);
}

run().catch(console.error);
