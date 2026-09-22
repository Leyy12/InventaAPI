import express from 'express';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// Get audit logs
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    // Sort by timestamp descending
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
      
    res.json({ logs: logs.map(l => ({ id: l.firestoreId, ...l })) });
  } catch (error) {
    console.error('[Audit API] Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Add audit log
router.post('/', async (req, res) => {
  try {
    const newLog = await AuditLog.create({
      firestoreId: req.body.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      ...req.body
    });
    res.status(201).json({ log: { id: newLog.firestoreId, ...newLog.toObject() } });
  } catch (error) {
    console.error('[Audit API] Error creating audit log:', error);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

export default router;
