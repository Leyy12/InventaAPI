import '../database/firebase.js';
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore();
const BASE_URL = 'http://localhost:5000';

async function run() {
  console.log('Fetching 555 Sardines product ID...');
  const prodSnap = await db.collection('products').where('name', '==', '555 Sardines').limit(1).get();
  if (prodSnap.empty) {
    console.error('Could not find 555 Sardines.');
    process.exit(1);
  }
  const sardineId = prodSnap.docs[0].id;
  
  // Create a mock API key for testing
  const mockKeyString = 'test_partial_key_12345';
  const mockKeyRef = await db.collection('api_keys').add({
    key: mockKeyString,
    name: 'Test Partial Variant Key',
    userId: 'clean_test_1785554819424',
    status: 'active',
    linkedProductIds: [],
    linkedVariantSelections: {
      [sardineId]: ['Tomato Sauce|155 g'] // Expected to filter only this variant
    },
    createdAt: new Date().toISOString()
  });
  console.log(`Created mock API key doc ID: ${mockKeyRef.id}`);

  try {
    console.log('\n--- Testing Partial Selection ---');
    const resPartial = await fetch(`${BASE_URL}/daas/v1/catalog`, {
      headers: { 'x-api-key': mockKeyString }
    });
    const bodyPartial = await resPartial.json();
    if (bodyPartial.status !== 'success') {
      console.error('API Error:', bodyPartial);
    } else {
      const p = bodyPartial.products.find(p => p.id === sardineId);
      console.log('555 Sardines in response:');
      console.log('Name:', p.name);
      console.log('Variants returned count:', p.variants.length);
      console.log('Variants array:', JSON.stringify(p.variants, null, 2));
    }

    console.log('\n--- Testing Full Selection (existing key) ---');
    const existingKeyString = 'daas_clean_ms9t8n1k_avxawv27'; 
    const resFull = await fetch(`${BASE_URL}/daas/v1/catalog`, {
      headers: { 'x-api-key': existingKeyString }
    });
    const bodyFull = await resFull.json();
    if (bodyFull.status !== 'success') {
      console.error('API Error for existing key:', bodyFull);
    } else {
      const pFull = bodyFull.products.find(p => p.name === '555 Sardines');
      if (pFull) {
        console.log('555 Sardines in response:');
        console.log('Name:', pFull.name);
        console.log('Variants returned count:', pFull.variants.length);
        console.log('Variants array:', JSON.stringify(pFull.variants, null, 2));
      } else {
        console.log('555 Sardines not found in existing key (maybe not linked).');
      }
    }
  } finally {
    console.log('\nCleaning up mock API key...');
    await mockKeyRef.delete();
    console.log('Deleted mock API key.');
    process.exit(0);
  }
}

run().catch(console.error);
