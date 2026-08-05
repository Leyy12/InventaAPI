import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const db = getFirestore();

async function run() {
  console.log('1. Mocking customer request submission (like ProductRequestModal does)...');
  const requestData = {
    product_name: "Test E2E Mismatch Product",
    category: "Grocery",
    notes: "Please add this.",
    status: 'pending',
    requested_by: "customer@test.com",
    requested_by_name: "Test Cust",
    created_at: FieldValue.serverTimestamp()
  };
  
  const docRef = await db.collection('product_requests').add(requestData);
  console.log(`Created request ${docRef.id}`);

  console.log('\n2. Simulating Admin Panel fetch (page.tsx logic)...');
  const docSnap = await db.collection('product_requests').doc(docRef.id).get();
  const adminData = docSnap.data();
  
  // This is how the admin panel uses it:
  console.log('Admin UI expects request.productName, got:', adminData.productName);
  console.log('Admin UI expects request.details, got:', adminData.details);
  console.log('Admin UI expects request.requestedBy.email, got:', adminData.requestedBy?.email);
  console.log('Admin UI expects request.createdAt, got:', adminData.createdAt);
  
  console.log('\nActual DB document:');
  console.log(adminData);
}

run().catch(console.error);
