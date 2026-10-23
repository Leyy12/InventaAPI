import express from 'express';
import { getFirestore } from '../database/firestore.js';
import { createCustomerCatalogHandler } from '../services/customer-catalog.js';
import { projectProduct, withoutPrices } from '../services/product-contract.js';

const router = express.Router();

router.get('/', createCustomerCatalogHandler({ getDb: getFirestore }));

router.get('/:id', async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('products').doc(req.params.id).get();
    // Same visibility as the public list: hidden, archived or draft products stay private.
    if (!doc.exists || !projectProduct(doc.data(), doc.id)?.visibility.visible) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: withoutPrices({ id: doc.id, ...doc.data() }) });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Disable mutating endpoints
router.all('*', (req, res) => {
  res.status(410).json({
    error: 'Endpoint Disabled',
    message: 'Product management mutation endpoints are deprecated and have been disabled for security reasons.',
    details: 'Admin catalog mutations require the authenticated /api/v1/admin/catalog writer.',
    alternative: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`,
  });
});

export default router;
