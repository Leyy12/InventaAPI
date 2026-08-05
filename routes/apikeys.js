import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// server.js imports database/firebase.js first, so getFirestore() is always ready here.
const adminDb = getFirestore();
const router = express.Router();

/**
 * POST /api/v1/api-keys/generate
 * Body: { userId, userEmail, keyName, plan, linkedProducts, linkedProductIds, linkedVariantSelections }
 * 
 * Uses Firebase Admin SDK to bypass Firestore client-side security rules.
 */
router.post('/generate', async (req, res) => {
    const { userId, userEmail, keyName, plan, linkedProducts, linkedProductIds, linkedVariantSelections } = req.body;

    if (!userId || !keyName) {
        return res.status(400).json({ error: 'userId and keyName are required.' });
    }

    try {
        // Generate a secure API key
        const timestamp = Date.now().toString(36);
        const random1 = Math.random().toString(36).substring(2, 10);
        const random2 = Math.random().toString(36).substring(2, 10);
        const newKeyString = `daas_${timestamp}_${random1}${random2}`;

        const keyData = {
            key: newKeyString,
            name: keyName.trim(),
            userId,
            userEmail: userEmail || '',
            plan: plan || 'Professional',
            requestsUsed: 0,
            createdAt: new Date().toISOString(),
            lastUsed: null,
            status: 'active',
            linkedProducts: linkedProducts || [],
            linkedProductIds: linkedProductIds || [],
            linkedVariantSelections: linkedVariantSelections || {},
        };

        // Use Admin SDK — bypasses all Firestore client security rules
        const docRef = await adminDb.collection('api_keys').add(keyData);

        console.log(`[API KEYS] Generated key "${keyName}" for user ${userId}. Doc ID: ${docRef.id}`);

        res.json({
            success: true,
            id: docRef.id,
            key: newKeyString,
            name: keyName,
            plan: keyData.plan,
            createdAt: keyData.createdAt,
        });
    } catch (err) {
        console.error('[API KEYS] Error generating key:', err);
        res.status(500).json({ error: 'Failed to generate API key: ' + err.message });
    }
});

/**
 * GET /api/v1/api-keys?userId=xxx
 * 
 * Fetches all active API keys for a user.
 */
router.get('/', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId query param is required.' });
    }

    try {
        const snapshot = await adminDb.collection('api_keys')
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .get();

        const keys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ success: true, keys });
    } catch (err) {
        console.error('[API KEYS] Error fetching keys:', err);
        res.status(500).json({ error: 'Failed to fetch API keys: ' + err.message });
    }
});

/**
 * DELETE /api/v1/api-keys/:id
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    try {
        const docRef = adminDb.collection('api_keys').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'API key not found.' });
        }

        if (doc.data().userId !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not own this API key.' });
        }

        await docRef.delete();
        res.json({ success: true, message: 'API key revoked.' });
    } catch (err) {
        console.error('[API KEYS] Error revoking key:', err);
        res.status(500).json({ error: 'Failed to revoke API key: ' + err.message });
    }
});

export default router;
