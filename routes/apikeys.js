/**
 * routes/apikeys.js
 *
 * API Keys management endpoints using MongoDB Atlas.
 */

import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Product from '../models/Product.js';

const router = express.Router();

/**
 * POST /api/v1/api-keys/generate
 */
router.post('/generate', async (req, res) => {
    const { userEmail, keyName, linkedProducts, linkedProductIds, linkedVariantSelections } = req.body;
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!idToken || !keyName?.trim()) {
        return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'A Firebase ID token and key name are required.' });
    }

    try {
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (authError) {
            return res.status(401).json({ success: false, error: 'UNAUTHENTICATED', message: 'Your login session is invalid or expired.' });
        }

        const userId = decodedToken.uid;
        
        // Fetch user from MongoDB
        const user = await User.findOne({ firestoreId: userId }).lean();
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'ACCOUNT_NOT_FOUND', message: 'User account not found.' });
        }

        const userPlan = user.plan || 'free';
        
        if (userPlan === 'FreeTrial' && user.trialExpiresAt && new Date() > new Date(user.trialExpiresAt)) {
            return res.status(403).json({ success: false, error: 'TRIAL_EXPIRED', message: 'Your Free Trial has expired.' });
        }

        if (userPlan.toLowerCase() === 'free') {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentKey = await ApiKey.findOne({ userId, createdAt: { $gte: oneDayAgo } });
            if (recentKey) {
                return res.status(429).json({ success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Free plan users can only generate 1 API key per day.' });
            }
        }

        const timestamp = Date.now().toString(36);
        const random1 = Math.random().toString(36).substring(2, 10);
        const random2 = Math.random().toString(36).substring(2, 10);
        const newKeyString = `daas_${timestamp}_${random1}${random2}`;

        const keyCreatedAt = new Date();
        const productAvailability = {};
        const allLinkedIds = Array.from(new Set([
            ...(linkedProductIds || []),
            ...Object.keys(linkedVariantSelections || {})
        ]));
        
        for (const productId of allLinkedIds) {
            productAvailability[productId] = { availableSince: keyCreatedAt };
        }

        const newApiKey = await ApiKey.create({
            firestoreId: `key_${Date.now()}_${random1}`,
            key: newKeyString,
            name: keyName.trim(),
            userId,
            userEmail: decodedToken.email || userEmail || '',
            plan: userPlan,
            requestsUsed: 0,
            status: 'active',
            linkedProductIds: linkedProductIds || [],
            linkedVariantSelections: linkedVariantSelections || {},
            productAvailability
        });

        await AuditLog.create({
            firestoreId: `audit_${Date.now()}_${random1}`,
            action: 'API Key Generated',
            userId: userId,
            email: newApiKey.userEmail,
            keyName: keyName.trim(),
            timestamp: new Date()
        });

        res.json({
            success: true,
            id: newApiKey.firestoreId,
            key: newKeyString,
            name: keyName,
            plan: userPlan,
            createdAt: newApiKey.createdAt
        });
    } catch (err) {
        console.error('[API KEYS] Error generating key:', err);
        res.status(500).json({ success: false, error: 'API_KEY_GENERATION_FAILED', message: 'Unable to create your API key.' });
    }
});

/**
 * GET /api/v1/api-keys?userId=xxx
 */
router.get('/', async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId query param is required.' });

    try {
        const keys = await ApiKey.find({ userId, status: 'active' }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, keys: keys.map(k => ({ id: k.firestoreId, ...k })) });
    } catch (err) {
        console.error('[API KEYS] Error fetching keys:', err);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

/**
 * GET /api/v1/api-keys/all (Admin)
 */
router.get('/all', async (req, res) => {
    try {
        const keys = await ApiKey.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, keys: keys.map(k => ({ id: k.firestoreId, ...k })) });
    } catch (err) {
        console.error('[API KEYS] Error fetching all keys:', err);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

/**
 * PATCH /api/v1/api-keys/:id/products
 */
router.patch('/:id/products', async (req, res) => {
    const { id } = req.params;
    const { userId, linkedProductIds: newProductIds, linkedVariantSelections: newVariantSelections } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    try {
        const apiKey = await ApiKey.findOne({ firestoreId: id });
        if (!apiKey) return res.status(404).json({ error: 'API key not found.' });
        if (apiKey.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

        const user = await User.findOne({ firestoreId: userId }).lean();
        const isFreePlan = ['free', 'Free', 'Starter'].includes(user?.plan);
        
        if (isFreePlan && user?.selectedSegment) {
            const requestedIds = Array.from(new Set([
                ...(newProductIds || []),
                ...Object.keys(newVariantSelections || {})
            ]));
            
            if (requestedIds.length > 0) {
                const products = await Product.find({ firestoreId: { $in: requestedIds } }).lean();
                const disallowed = products.filter(p => p.segment !== user.selectedSegment);
                
                if (disallowed.length > 0) {
                    return res.status(403).json({
                        success: false,
                        error: 'PLAN_SEGMENT_RESTRICTION',
                        message: `Your Free plan only allows products from ${user.selectedSegment}.`,
                        disallowed: disallowed.map(d => d.name)
                    });
                }
            }
        }

        const existingAvailability = apiKey.productAvailability || {};
        const now = new Date();
        const incomingProductIds = new Set([
            ...(newProductIds || []),
            ...Object.keys(newVariantSelections || {})
        ]);
        const previouslyLinkedIds = new Set([
            ...(apiKey.linkedProductIds || []),
            ...Object.keys(apiKey.linkedVariantSelections || {})
        ]);

        const updatedAvailability = {};
        incomingProductIds.forEach(productId => {
            if (existingAvailability[productId]) {
                updatedAvailability[productId] = existingAvailability[productId];
            } else if (!previouslyLinkedIds.has(productId)) {
                updatedAvailability[productId] = { availableSince: now };
            }
        });

        apiKey.linkedProductIds = newProductIds || [];
        apiKey.linkedVariantSelections = newVariantSelections || {};
        apiKey.productAvailability = updatedAvailability;
        
        await apiKey.save();

        await AuditLog.create({
            firestoreId: `audit_${Date.now()}_${Math.random().toString(36).substring(2)}`,
            action: 'API Key Products Updated',
            userId,
            email: apiKey.userEmail || apiKey.name,
            keyName: apiKey.name,
            timestamp: now
        });

        res.json({ success: true, message: 'Product links updated successfully.' });
    } catch (err) {
        console.error('[API KEYS] Error updating products:', err);
        res.status(500).json({ error: 'Failed to update product links' });
    }
});

/**
 * DELETE /api/v1/api-keys/:id
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    try {
        const apiKey = await ApiKey.findOne({ firestoreId: id });
        if (!apiKey) return res.status(404).json({ error: 'API key not found.' });
        if (apiKey.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

        apiKey.status = 'revoked';
        await apiKey.save();

        await AuditLog.create({
            firestoreId: `audit_${Date.now()}_${Math.random().toString(36).substring(2)}`,
            action: 'API Key Revoked',
            userId,
            email: apiKey.userEmail || apiKey.name,
            keyName: apiKey.name,
            timestamp: new Date()
        });

        res.json({ success: true, message: 'API key revoked.' });
    } catch (err) {
        console.error('[API KEYS] Error revoking key:', err);
        res.status(500).json({ error: 'Failed to revoke API key' });
    }
});

export default router;
