import express from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// server.js imports database/firebase.js first, so getFirestore() is always ready here.
const adminDb = getFirestore();
const router = express.Router();

// =====================================================
// GET /api/v1/notifications
// Get notifications for a user
// =====================================================
router.get('/', async (req, res) => {
    const { user_email, unread_only, limit } = req.query;

    if (!user_email) {
        return res.status(400).json({
            success: false,
            error: 'user_email query parameter is required'
        });
    }

    try {
        let query = adminDb.collection('notifications')
            .where('user_email', '==', user_email);

        // Filter by unread
        if (unread_only === 'true') {
            query = query.where('is_read', '==', false);
        }

        // Order by date
        query = query.orderBy('created_at', 'desc');

        // Apply limit
        const pageLimit = parseInt(limit) || 50;
        query = query.limit(pageLimit);

        const snapshot = await query.get();
        const notifications = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
            read_at: doc.data().read_at?.toDate?.() || doc.data().read_at,
        }));

        res.json({
            success: true,
            notifications,
            count: notifications.length,
            unread_count: notifications.filter(n => !n.is_read).length
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
        const docRef = adminDb.collection('notifications').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        await docRef.update({
            is_read: true,
            read_at: FieldValue.serverTimestamp()
        });

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (err) {
        console.error('[Notifications API] Error marking notification as read:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to mark notification as read',
            message: err.message
        });
    }
});

// =====================================================
// PUT /api/v1/notifications/mark-all-read
// Mark all notifications as read for a user
// =====================================================
router.put('/mark-all-read', async (req, res) => {
    const { user_email } = req.body;

    if (!user_email) {
        return res.status(400).json({
            success: false,
            error: 'user_email is required'
        });
    }

    try {
        const snapshot = await adminDb.collection('notifications')
            .where('user_email', '==', user_email)
            .where('is_read', '==', false)
            .get();

        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                is_read: true,
                read_at: FieldValue.serverTimestamp()
            });
        });

        await batch.commit();

        res.json({
            success: true,
            message: `Marked ${snapshot.size} notifications as read`
        });
    } catch (err) {
        console.error('[Notifications API] Error marking all as read:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to mark all notifications as read',
            message: err.message
        });
    }
});

// =====================================================
// DELETE /api/v1/notifications/:id
// Delete a notification
// =====================================================
router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const docRef = adminDb.collection('notifications').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        await docRef.delete();

        res.json({
            success: true,
            message: 'Notification deleted'
        });
    } catch (err) {
        console.error('[Notifications API] Error deleting notification:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete notification',
            message: err.message
        });
    }
});

export default router;
