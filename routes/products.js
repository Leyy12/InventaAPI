import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('products').get();
    const products = [];
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });
    res.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getFirestore();
    const doc = await db.collection('products').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: { id: doc.id, ...doc.data() } });
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
    details: 'Admin operations now use Firestore directly with proper security rules.',
    alternative: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`,
  });
});

export default router;
