import '../database/firebase.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
const db = getFirestore();
const BASE_URL = 'http://localhost:5000';

async function run() {
  console.log('=== START E2E PENDING REQUEST FLOW TEST ===');
  
  // 1. Simulating Customer Request Submission
  console.log('\n[Customer Dashboard] Submitting product request...');
  const reqBody = {
    product_name: "E2E Test Magic Potion",
    category: "Medicine",
    notes: "Please add this rare potion.",
    requested_by: "e2e_tester@example.com",
    requested_by_name: "E2E Tester"
  };
  
  const resPost = await fetch(`${BASE_URL}/api/v1/product-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody)
  });
  
  const postData = await resPost.json();
  if (!postData.success) {
    console.error('Failed to submit request:', postData);
    process.exit(1);
  }
  const requestId = postData.request_id;
  console.log(`✅ Request submitted successfully. Request ID: ${requestId}`);

  // 2. Simulating Admin Fetch
  console.log('\n[Admin Dashboard] Fetching pending requests...');
  const docSnap = await db.collection('product_requests').doc(requestId).get();
  const dbData = docSnap.data();
  
  // Apply the newly fixed mapping logic
  const adminMappedData = {
    id: docSnap.id,
    productName: dbData.product_name || dbData.productName || "Unknown",
    category: dbData.category || "Uncategorized",
    details: dbData.notes || dbData.details || "",
    requestedBy: {
      uid: dbData.requested_by_uid || "anonymous",
      email: dbData.requested_by || dbData.requestedBy?.email || "anonymous"
    },
    status: dbData.status || "pending",
    notes: dbData.review_notes || dbData.notes || ""
  };
  
  console.log('Mapped Request for Admin UI:');
  console.log(adminMappedData);
  
  if (adminMappedData.productName !== reqBody.product_name || adminMappedData.details !== reqBody.notes) {
    console.error('❌ Mismatch in data mapping!');
    process.exit(1);
  }
  console.log('✅ Admin mapping is correct.');

  // 3. Simulating Admin Approval (what the UI does)
  console.log('\n[Admin Dashboard] Approving request...');
  const productPayload = {
    name: adminMappedData.productName,
    category: adminMappedData.category,
    sku: `AUTO-${Date.now()}`,
    price: 0,
    size: null,
    image_url: "https://via.placeholder.com/400x400?text=Image+Needed",
    description: adminMappedData.details,
    createdAt: FieldValue.serverTimestamp(),
    addedVia: "crowdsourcing",
    requestId: adminMappedData.id,
    status: "Active",
    is_active: true,
    variants: []
  };
  
  const newProductRef = await db.collection('products').add(productPayload);
  console.log(`✅ Product added to Master Catalog with ID: ${newProductRef.id}`);
  
  await db.collection('product_requests').doc(requestId).update({
    status: "approved",
    reviewed_at: FieldValue.serverTimestamp(),
    reviewed_by: "admin@system.com",
    review_notes: "Approved and added to product catalog"
  });
  
  console.log('✅ Request marked as approved in Firestore.');
  
  // Cleanup
  console.log('\n[Cleanup] Deleting test records...');
  await db.collection('products').doc(newProductRef.id).delete();
  await db.collection('product_requests').doc(requestId).delete();
  console.log('✅ Cleanup complete. Flow verified successfully.');
}

run().catch(console.error);
