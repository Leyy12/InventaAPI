/**
 * routes/notifications.js
 *
 * API for fetching and managing user notifications from MongoDB.
 */

import express from 'express';
import Notification from '../models/Notification.js';

const router = express.Router();

// =====================================================
// GET /api/v1/notifications
// Get notifications for a user (by userId or user_email)
// =====================================================
router.get('/', async (req, res) => {
    const { user_email, userId, unread_only, limit } = req.query;

    if (!user_email && !userId) {
        return res.status(400).json({
            success: false,
            error: 'user_email or userId query parameter is required'
        });
    }

    try {
        const query = {};
        if (userId) query.userId = userId;
        else if (user_email) query.userEmail = user_email;

        // Filter by unread
        if (unread_only === 'true') {
            query.read = false;
        }

        const pageLimit = parseInt(limit) || 50;

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(pageLimit)
            .lean();

        res.json({
            success: true,
            notifications: notifications.map(n => ({
                id: n.firestoreId,
                is_read: n.read,
                created_at: n.createdAt,
                ...n
            })),
            count: notifications.length,
            unread_count: notifications.filter(n => !n.read).length
        });
    } catch (err) {
        console.error('[Notifications API] Error fetching notifications:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch notifications',
            message: err.message
        });
    }
});

// =====================================================
// PUT /api/v1/notifications/:id/read
// Mark notification as read
// =====================================================
router.put('/:id/read', async (req, res) => {
    const { id } = req.params;

    try {
        const notification = await Notification.findOneAndUpdate(
            { firestoreId: id },
            { $set: { read: true, readAt: new Date() } },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification marked as read' });
    } catch (err) {
        console.error('[Notifications API] Error marking notification as read:', err);
        res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
    }
});

// =====================================================
// PUT /api/v1/notifications/mark-all-read
// Mark all notifications as read for a user
// =====================================================
router.put('/mark-all-read', async (req, res) => {
    const { user_email, userId } = req.body;

    if (!user_email && !userId) {
        return res.status(400).json({ success: false, error: 'user_email or userId is required' });
    }

    try {
        const query = { read: false };
        if (userId) query.userId = userId;
        else query.userEmail = user_email;

        const result = await Notification.updateMany(query, {
            $set: { read: true, readAt: new Date() }
        });

        res.json({
            success: true,
            message: `Marked ${result.modifiedCount} notifications as read`
        });
    } catch (err) {
        console.error('[Notifications API] Error marking all as read:', err);
        res.status(500).json({ success: false, error: 'Failed to mark all notifications as read' });
    }
});

// =====================================================
// DELETE /api/v1/notifications/:id
// Delete a notification
// =====================================================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await Notification.findOneAndDelete({ firestoreId: id });
        if (!result) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        res.json({ success: true, message: 'Notification deleted' });
    } catch (err) {
        console.error('[Notifications API] Error deleting notification:', err);
        res.status(500).json({ success: false, error: 'Failed to delete notification' });
    }
});

export default router;
