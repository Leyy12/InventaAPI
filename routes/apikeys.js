import express from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let adminDb = null;
function getDb() {
  if (!adminDb) {
    adminDb = getFirestore();
  }
  return adminDb;
}
const router = express.Router();

/**
 * POST /api/v1/api-keys/generate
 * Body: { userId, userEmail, keyName, plan, linkedProducts, linkedProductIds, linkedVariantSelections }
 * 
 * Uses Firebase Admin SDK to bypass Firestore client-side security rules.
 */
router.post('/generate', async (req, res) => {
    const { userEmail, keyName, linkedProducts, linkedProductIds, linkedVariantSelections } = req.body;
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!idToken || !keyName?.trim()) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_REQUEST',
            message: 'A Firebase ID token and key name are required.'
        });
    }

    try {
        let decodedToken;
        try {
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (authError) {
            console.log('[API KEYS] Firebase token verification failed:', authError.message);
            return res.status(401).json({
                success: false,
                error: 'UNAUTHENTICATED',
                message: 'Your login session is invalid or expired. Please sign in again.'
            });
        }

        const userId = decodedToken.uid;

        // SECURITY: Fetch user's ACTUAL plan from Firestore (trusted source)
        // FAIL CLOSED: Do NOT generate key if plan cannot be verified
        let userDoc;
        let userData;

        try {
            userDoc = await getDb().collection('users').doc(userId).get();
        } catch (firestoreError) {
            // FAIL CLOSED: Handle Firestore quota/connectivity issues
            if (firestoreError.code === 8 || firestoreError.message?.includes('Quota exceeded')) {
                console.log(`[API KEYS] Firestore quota exceeded for user ${userId} - failing closed`);
                return res.status(503).json({
                    success: false,
                    error: 'SERVICE_UNAVAILABLE',
                    message: 'Unable to verify your subscription plan due to temporary service limits. Please try again later.'
                });
            } else {
                console.log(`[API KEYS] Firestore error for user ${userId}:`, firestoreError.message, ' - failing closed');
                return res.status(500).json({
                    success: false,
                    error: 'PLAN_VERIFICATION_FAILED',
                    message: 'Unable to verify your subscription plan. Please try again later.'
                });
            }
        }

        if (!userDoc.exists) {
            console.log(`[API KEYS] User document not found for ${userId} - failing closed`);
            return res.status(404).json({ 
                success: false,
                error: 'ACCOUNT_NOT_FOUND',
                message: 'User account information could not be found. Please contact support if this persists.'
            });
        }

        userData = userDoc.data();
        const userPlan = userData.plan;
        const userRequestLimit = userData.apiRequestLimit;
        if (typeof userPlan !== 'string' || !userPlan.trim() || typeof userRequestLimit !== 'number') {
            console.log(`[API KEYS] Incomplete entitlement data for ${userId} - failing closed`);
            return res.status(500).json({
                success: false,
                error: 'PLAN_VERIFICATION_FAILED',
                message: 'Unable to verify your subscription plan. Please try again later.'
            });
        }

        console.log(`[API KEYS] User plan verification successful: ${userPlan}, limit: ${userRequestLimit}`);

        // Generate a secure API key
        const timestamp = Date.now().toString(36);
        const random1 = Math.random().toString(36).substring(2, 10);
        const random2 = Math.random().toString(36).substring(2, 10);
        const newKeyString = `daas_${timestamp}_${random1}${random2}`;

        // Build productAvailability map: records when each product became available
        // to THIS consumer. This is the authoritative source of truth for consumer-specific
        // "new product" detection. availableSince = moment the key was generated.
        const keyCreatedAt = Timestamp.now();
        const productAvailability = {};
        const allLinkedIds = Array.from(new Set([
            ...(linkedProductIds || []),
            ...Object.keys(linkedVariantSelections || {})
        ]));
        for (const productId of allLinkedIds) {
            productAvailability[productId] = { availableSince: keyCreatedAt };
        }

        const keyData = {
            key: newKeyString,
            name: keyName.trim(),
            userId,
            userEmail: decodedToken.email || userEmail || '',
            plan: userPlan,  // Use VERIFIED user plan only
            requestLimit: userRequestLimit,  // Store the verified limit for frontend display
            requestsUsed: 0,
            createdAt: keyCreatedAt,
            lastUsed: null,
            status: 'active',
            linkedProducts: linkedProducts || [],
            linkedProductIds: linkedProductIds || [],
            linkedVariantSelections: linkedVariantSelections || {},
            // productAvailability: consumer-specific per-product authorization timestamps.
            // Key = productId, value = { availableSince: Firestore Timestamp }.
            // Never derive "new" status from the product's own createdAt — that reflects
            // the product's creation date in the master catalog, not consumer authorization.
            productAvailability,
        };

        // Use Admin SDK — bypasses all Firestore client security rules
        const docRef = await getDb().collection('api_keys').add(keyData);

        console.log(`[API KEYS] Generated key "${keyName}" for user ${userId}. Plan: ${userPlan}, Limit: ${userRequestLimit}. Doc ID: ${docRef.id}`);

        // Log audit event
        getDb().collection('audit_logs').add({
            action: 'API Key Generated',
            userId: userId,
            email: keyData.userEmail || keyName.trim(),
            keyName: keyName.trim(),
            timestamp: new Date()
        }).catch(console.error);

        res.json({
            success: true,
            id: docRef.id,
            key: newKeyString,
            name: keyName,
            plan: keyData.plan,
            requestLimit: keyData.requestLimit,
            createdAt: keyData.createdAt,
        });
    } catch (err) {
        console.error('[API KEYS] Error generating key:', err);
        if (err.code === 8 || err.message?.includes('Quota exceeded')) {
            return res.status(503).json({
                success: false,
                error: 'SERVICE_UNAVAILABLE',
                message: 'Unable to create your API key due to temporary service limits. Please try again later.'
            });
        }
        res.status(500).json({
            success: false,
            error: 'API_KEY_GENERATION_FAILED',
            message: 'Unable to create your API key. Please try again later.'
        });
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
        const snapshot = await getDb().collection('api_keys')
            .where('userId', '==', userId)
            .where('status', '==', 'active')
            .get();

        const keys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.json({ success: true, keys });
    } catch (err) {
        console.error('[API KEYS] Error fetching keys:', err);
        
        // FAIL CLOSED: Handle Firestore quota/connectivity issues same as POST route
        if (err.code === 8 || err.message?.includes('Quota exceeded')) {
            console.log(`[API KEYS] Firestore quota exceeded for user ${userId} - failing closed`);
            return res.status(503).json({ 
                error: 'Unable to fetch API keys due to temporary service limits. Please try again later.' 
            });
        } else {
            console.log(`[API KEYS] Firestore error for user ${userId}:`, err.message, ' - failing closed');
            return res.status(500).json({ 
                error: 'Failed to fetch API keys: ' + err.message 
            });
        }
    }
});

/**
 * PATCH /api/v1/api-keys/:id/products
 *
 * Updates the product authorization list for an existing API key.
 * - Newly added products receive availableSince: Timestamp.now().
 * - Products already linked keep their original availableSince timestamp.
 * - Removed products are removed from both linkedProductIds and productAvailability.
 * - All other api_keys fields (plan, requestLimit, requestsUsed, etc.) are untouched.
 *
 * Body: {
 *   userId: string,                                   // must match key owner
 *   linkedProductIds: string[],                       // full new list of fully-linked product IDs
 *   linkedVariantSelections: Record<string,string[]>  // full new map of partial-variant selections
 * }
 */
router.patch('/:id/products', async (req, res) => {
    const { id } = req.params;
    const { userId, linkedProductIds: newProductIds, linkedVariantSelections: newVariantSelections } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
    }

    try {
        const docRef = getDb().collection('api_keys').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'API key not found.' });
        }

        const existing = doc.data();

        if (existing.userId !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not own this API key.' });
        }

        // --- Build the new productAvailability map ---
        // Start from the existing map so we never lose historical timestamps.
        const existingAvailability = existing.productAvailability || {};
        const now = Timestamp.now();

        // Collect all product IDs that will be linked after this update
        const incomingProductIds = new Set([
            ...(newProductIds || []),
            ...Object.keys(newVariantSelections || {})
        ]);

        // We also need to know which products were ALREADY linked before this update,
        // so we don't fabricate new timestamps for legacy products that didn't have one.
        const previouslyLinkedIds = new Set([
            ...(existing.linkedProductIds || []),
            ...Object.keys(existing.linkedVariantSelections || {})
        ]);

        const updatedAvailability = {};
        incomingProductIds.forEach(productId => {
            if (existingAvailability[productId]) {
                // Product was already linked and HAS a timestamp — PRESERVE the original timestamp
                updatedAvailability[productId] = existingAvailability[productId];
            } else if (previouslyLinkedIds.has(productId)) {
                // Product was already linked but HAS NO timestamp (legacy).
                // Do NOT fabricate a new timestamp. Leave it missing/null.
                // We do not add it to updatedAvailability (so it remains missing),
                // or we can add it as { availableSince: null } if we want to be explicit.
                // In our model, undefined/missing means legacy, so we just skip it.
            } else {
                // Truly newly linked product — record the exact moment it became available
                updatedAvailability[productId] = { availableSince: now };
            }
        });
        // Products that are no longer in the new list are simply not copied forward,
        // effectively removing them from productAvailability (soft removal).

        // Build the final linked products array (full list from variants + full-product ids)
        const finalLinkedProductIds = newProductIds || [];
        const finalLinkedVariantSelections = newVariantSelections || {};

        await docRef.update({
            linkedProductIds: finalLinkedProductIds,
            linkedVariantSelections: finalLinkedVariantSelections,
            productAvailability: updatedAvailability,
            // All other fields (plan, requestLimit, requestsUsed, createdAt, lastUsed,
            // status, key, userId, userEmail) are NOT included here — Firestore update()
            // only modifies the specified fields, leaving everything else unchanged.
        });

        console.log(`[API KEYS] Updated product links for key "${existing.name}" (${id}): ${incomingProductIds.size} products total`);

        getDb().collection('audit_logs').add({
            action: 'API Key Products Updated',
            userId,
            email: existing.userEmail || existing.name || 'Unknown',
            keyName: existing.name,
            keyId: id,
            productsLinked: incomingProductIds.size,
            timestamp: now
        }).catch(console.error);

        res.json({
            success: true,
            message: 'Product links updated successfully.',
            linkedProductIds: finalLinkedProductIds,
            linkedVariantSelections: finalLinkedVariantSelections,
            productAvailabilityCount: Object.keys(updatedAvailability).length
        });
    } catch (err) {
        console.error('[API KEYS] Error updating product links:', err);
        res.status(500).json({ error: 'Failed to update product links: ' + err.message });
    }
});

/**
 * DELETE /api/v1/api-keys/:id
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    try {
        const docRef = getDb().collection('api_keys').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'API key not found.' });
        }

        if (doc.data().userId !== userId) {
            return res.status(403).json({ error: 'Forbidden: You do not own this API key.' });
        }

        await docRef.update({ status: 'revoked' });

        getDb().collection('audit_logs').add({
            action: 'API Key Revoked',
            userId: userId,
            email: doc.data().userEmail || doc.data().name || 'Unknown',
            keyName: doc.data().name,
            timestamp: new Date()
        }).catch(console.error);

        res.json({ success: true, message: 'API key revoked.' });
    } catch (err) {
        console.error('[API KEYS] Error revoking key:', err);
        res.status(500).json({ error: 'Failed to revoke API key: ' + err.message });
    }
});

export default router;
