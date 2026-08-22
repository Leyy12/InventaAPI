import express from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken, requireAdmin } from '../middleware/auth.js';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// server.js imports database/firebase.js first, so getFirestore() is always ready here.
let adminDb = null;
function getDb() {
  if (!adminDb) {
    adminDb = getFirestore();
  }
  return adminDb;
}
const router = express.Router();

// =====================================================
// GET /api/v1/product-requests
// Retrieve all product requests (with optional filters)
// =====================================================
router.get('/', async (req, res) => {
    const { status, limit, requested_by } = req.query;
    
    try {
        let query = getDb().collection('product_requests');
        
        // Filter by status
        if (status) {
            query = query.where('status', '==', status);
        }
        
        // Filter by user
        if (requested_by) {
            query = query.where('requested_by', '==', requested_by);
        }
        
        // Order by creation date (newest first)
        query = query.orderBy('created_at', 'desc');
        
        // Apply limit
        const pageLimit = parseInt(limit) || 100;
        query = query.limit(pageLimit);
        
        const snapshot = await query.get();
        const requests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
            updated_at: doc.data().updated_at?.toDate?.() || doc.data().updated_at,
            approved_at: doc.data().approved_at?.toDate?.() || doc.data().approved_at,
            rejected_at: doc.data().rejected_at?.toDate?.() || doc.data().rejected_at,
        }));
        
        res.json({
            success: true,
            requests,
            count: requests.length
        });
    } catch (err) {
        console.error('[Product Requests API] Error fetching requests:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product requests',
            message: err.message
        });
    }
});

// =====================================================
// GET /api/v1/product-requests/:id
// Get a specific product request by ID
// =====================================================
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const doc = await getDb().collection('product_requests').doc(id).get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Product request not found'
            });
        }
        
        const request = {
            id: doc.id,
            ...doc.data(),
            created_at: doc.data().created_at?.toDate?.() || doc.data().created_at,
            updated_at: doc.data().updated_at?.toDate?.() || doc.data().updated_at,
            approved_at: doc.data().approved_at?.toDate?.() || doc.data().approved_at,
            rejected_at: doc.data().rejected_at?.toDate?.() || doc.data().rejected_at,
        };
        
        res.json({
            success: true,
            request
        });
    } catch (err) {
        console.error('[Product Requests API] Error fetching request:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product request',
            message: err.message
        });
    }
});

// =====================================================
// POST /api/v1/product-requests
// Submit a new product request
// =====================================================
router.post('/', async (req, res) => {
    const { product_name, category, notes, requested_by, requested_by_name, requested_by_uid } = req.body;
    
    // Validation
    if (!product_name || !category) {
        return res.status(400).json({
            success: false,
            error: 'Product name and category are required'
        });
    }
    
    try {
        // ── Duplicate Prevention ───────────────────────────────────────────
        // Check if this user already has a PENDING request for the same product.
        // Comparison is case-insensitive to catch "dove" vs "Dove" etc.
        const uid = requested_by_uid || 'anonymous';
        const normalizedName = product_name.trim().toLowerCase();

        const existingSnap = await getDb().collection('product_requests')
            .where('requested_by_uid', '==', uid)
            .where('status', '==', 'pending')
            .get();

        const alreadyExists = existingSnap.docs.some(
            d => (d.data().product_name || '').trim().toLowerCase() === normalizedName
        );

        if (alreadyExists) {
            return res.status(409).json({
                success: false,
                error: 'duplicate',
                message: `You already have a pending request for "${product_name}". Please wait for it to be reviewed before submitting again.`
            });
        }
        // ── End Duplicate Prevention ───────────────────────────────────────

        const requestData = {
            product_name: product_name.trim(),
            category: category.trim(),
            notes: notes?.trim() || '',
            status: 'pending',
            requested_by: requested_by || 'anonymous',
            requested_by_name: requested_by_name || 'Anonymous User',
            requested_by_uid: uid,
            reviewed_by: null,
            review_notes: null,
            approved_at: null,
            rejected_at: null,
            created_product_id: null,
            created_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp()
        };
        
        const docRef = await getDb().collection('product_requests').add(requestData);
        
        // Create notification for user
        await getDb().collection('notifications').add({
            user_email: requested_by || 'anonymous',
            type: 'request_received',
            title: 'Product Request Received',
            message: `Your request for "${product_name}" has been submitted successfully. We'll review it within 24-48 hours.`,
            related_request_id: docRef.id,
            related_product_id: null,
            is_read: false,
            read_at: null,
            created_at: FieldValue.serverTimestamp()
        });
        
        res.status(201).json({
            success: true,
            message: 'Product request submitted successfully',
            request_id: docRef.id,
            data: {
                id: docRef.id,
                ...requestData,
                created_at: new Date(),
                updated_at: new Date()
            }
        });
    } catch (err) {
        console.error('[Product Requests API] Error creating request:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to submit product request',
            message: err.message
        });
    }
});


// =====================================================
// PUT /api/v1/product-requests/:id/approve
// Approve a product request and optionally create the product
// =====================================================
router.put('/:id/approve', verifyFirebaseToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { reviewed_by, review_notes, create_product, product_data } = req.body;
    
    try {
        const docRef = getDb().collection('product_requests').doc(id);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Product request not found'
            });
        }
        
        const requestData = doc.data();
        let createdProductId = null;
        
        // Create the product if requested
        if (create_product && product_data) {
            const productRef = await getDb().collection('products').add({
                ...product_data,
                name: product_data.name || requestData.product_name,
                category: product_data.category || requestData.category,
                segment: product_data.segment || 'Grocery',
                price: product_data.price || 0,
                stock: product_data.stock || 0,
                is_active: true,
                created_at: FieldValue.serverTimestamp(),
                updated_at: FieldValue.serverTimestamp()
            });
            createdProductId = productRef.id;
        }
        
        // Update request status
        await docRef.update({
            status: 'approved',
            reviewed_by: reviewed_by || 'admin',
            review_notes: review_notes || '',
            approved_at: FieldValue.serverTimestamp(),
            created_product_id: createdProductId,
            updated_at: FieldValue.serverTimestamp()
        });
        
        // Create notification for user
        await getDb().collection('notifications').add({
            user_email: requestData.requested_by,
            type: 'product_approved',
            title: 'Product Request Approved',
            message: `Great news! Your request for "${requestData.product_name}" has been approved${createdProductId ? ' and added to the catalog' : ''}.`,
            related_request_id: id,
            related_product_id: createdProductId,
            is_read: false,
            read_at: null,
            created_at: FieldValue.serverTimestamp()
        });
        
        res.json({
            success: true,
            message: 'Product request approved successfully',
            created_product_id: createdProductId
        });
    } catch (err) {
        console.error('[Product Requests API] Error approving request:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to approve product request',
            message: err.message
        });
    }
});

// =====================================================
// PUT /api/v1/product-requests/:id/reject
// Reject a product request
// =====================================================
router.put('/:id/reject', verifyFirebaseToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { reviewed_by, review_notes } = req.body;
    
    try {
        const docRef = getDb().collection('product_requests').doc(id);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Product request not found'
            });
        }
        
        const requestData = doc.data();
        
        // Update request status
        await docRef.update({
            status: 'rejected',
            reviewed_by: reviewed_by || 'admin',
            review_notes: review_notes || 'Request does not meet our criteria',
            rejected_at: FieldValue.serverTimestamp(),
            updated_at: FieldValue.serverTimestamp()
        });
        
        // Create notification for user
        await getDb().collection('notifications').add({
            user_email: requestData.requested_by,
            type: 'product_rejected',
            title: 'Product Request Not Approved',
            message: `Your request for "${requestData.product_name}" has been reviewed but was not approved. Reason: ${review_notes || 'Does not meet criteria'}`,
            related_request_id: id,
            related_product_id: null,
            is_read: false,
            read_at: null,
            created_at: FieldValue.serverTimestamp()
        });
        
        res.json({
            success: true,
            message: 'Product request rejected'
        });
    } catch (err) {
        console.error('[Product Requests API] Error rejecting request:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to reject product request',
            message: err.message
        });
    }
});

// =====================================================
// PUT /api/v1/product-requests/:id/status
// Update request status to under_review
// =====================================================
router.put('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'under_review', 'approved', 'rejected'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid status',
            valid_statuses: validStatuses
        });
    }
    
    try {
        const docRef = getDb().collection('product_requests').doc(id);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Product request not found'
            });
        }
        
        await docRef.update({
            status,
            updated_at: FieldValue.serverTimestamp()
        });
        
        res.json({
            success: true,
            message: `Request status updated to ${status}`
        });
    } catch (err) {
        console.error('[Product Requests API] Error updating status:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update request status',
            message: err.message
        });
    }
});

// =====================================================
// DELETE /api/v1/product-requests/:id
// Delete (cancel) a product request
// =====================================================
router.delete('/:id', verifyFirebaseToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        const docRef = getDb().collection('product_requests').doc(id);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Product request not found'
            });
        }
        
        const requestData = doc.data();
        
        // Only allow deletion if pending
        if (requestData.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Can only cancel pending requests'
            });
        }
        
        await docRef.delete();
        
        res.json({
            success: true,
            message: 'Product request cancelled successfully'
        });
    } catch (err) {
        console.error('[Product Requests API] Error deleting request:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel product request',
            message: err.message
        });
    }
});

// =====================================================
// GET /api/v1/product-requests/stats/summary
// Get summary statistics
// =====================================================
router.get('/stats/summary', async (req, res) => {
    try {
        const snapshot = await getDb().collection('product_requests').get();
        
        const stats = {
            total: 0,
            pending: 0,
            under_review: 0,
            approved: 0,
            rejected: 0
        };
        
        snapshot.forEach(doc => {
            stats.total++;
            const status = doc.data().status;
            if (stats[status] !== undefined) {
                stats[status]++;
            }
        });
        
        res.json({
            success: true,
            stats
        });
    } catch (err) {
        console.error('[Product Requests API] Error fetching stats:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
            message: err.message
        });
    }
});

export default router;
