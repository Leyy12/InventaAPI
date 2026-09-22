import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Get all users (Admin only)
router.get('/', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json({ users: users.map(u => ({ id: u.firestoreId, ...u })) });
  } catch (error) {
    console.error('[Users API] Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID (used for auth context)
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findOne({ firestoreId: req.params.id }).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: { id: user.firestoreId, ...user } });
  } catch (error) {
    console.error('[Users API] Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user by ID
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { firestoreId: req.params.id },
      { $set: req.body },
      { new: true }
    ).lean();
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: { id: user.firestoreId, ...user } });
  } catch (error) {
    console.error('[Users API] Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Create new user (Signup)
router.post('/', async (req, res) => {
  try {
    const { id, ...data } = req.body; // id from Firebase Auth
    const user = await User.create({
      firestoreId: id,
      ...data
    });
    res.status(201).json({ user: { id: user.firestoreId, ...user.toObject() } });
  } catch (error) {
    console.error('[Users API] Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

export default router;
