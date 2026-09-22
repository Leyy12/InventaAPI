/**
 * routes/products.js
 *
 * Admin/internal product catalog endpoints.
 * Now reads from MongoDB Atlas (via Mongoose Product model)
 * instead of Firestore.
 *
 * Lookup key: firestoreId — preserves compatibility with
 * existing api_keys.linkedProductIds (Firestore document IDs).
 */

import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

/**
 * GET /api/v1/products
 * Returns all active products from MongoDB.
 */
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .select('-__v')
      .lean();

    // Shape: return `id` as the firestoreId so consumers remain compatible
    const shaped = products.map(p => ({
      id: p.firestoreId,
      ...p,
    }));

    res.json({ products: shaped });
  } catch (error) {
    console.error('[Products] Error fetching products from MongoDB:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/v1/products/:id
 * Fetch a single product by Firestore ID (firestoreId field in MongoDB).
 */
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findOne({
      firestoreId: req.params.id,
      isActive: true,
    })
      .select('-__v')
      .lean();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product: { id: product.firestoreId, ...product } });
  } catch (error) {
    console.error('[Products] Error fetching product from MongoDB:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Disable mutating endpoints
router.all('*', (req, res) => {
  res.status(410).json({
    error: 'Endpoint Disabled',
    message: 'Product management mutation endpoints are deprecated and have been disabled for security reasons.',
    details: 'Admin operations now use Firestore directly with proper security rules.',
    alternative: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`,
  });
});

export default router;
