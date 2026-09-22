import express from 'express';
import ProductRequest from '../models/ProductRequest.js';

const router = express.Router();

// Get all product requests (Admin)
router.get('/', async (req, res) => {
  try {
    const requests = await ProductRequest.find().sort({ createdAt: -1 }).lean();
    res.json({ requests: requests.map(r => ({ id: r.firestoreId, ...r })) });
  } catch (error) {
    console.error('[Product Requests API] Error fetching requests:', error);
    res.status(500).json({ error: 'Failed to fetch product requests' });
  }
});

// Create product request
router.post('/', async (req, res) => {
  try {
    const newRequest = await ProductRequest.create({
      firestoreId: req.body.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      ...req.body
    });
    res.status(201).json({ request: { id: newRequest.firestoreId, ...newRequest.toObject() } });
  } catch (error) {
    console.error('[Product Requests API] Error creating request:', error);
    res.status(500).json({ error: 'Failed to create product request' });
  }
});

// Update product request status
router.put('/:id', async (req, res) => {
  try {
    const updated = await ProductRequest.findOneAndUpdate(
      { firestoreId: req.params.id },
      { $set: req.body },
      { new: true }
    ).lean();
    
    if (!updated) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json({ request: { id: updated.firestoreId, ...updated } });
  } catch (error) {
    console.error('[Product Requests API] Error updating request:', error);
    res.status(500).json({ error: 'Failed to update product request' });
  }
});

export default router;
