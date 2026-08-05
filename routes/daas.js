import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { requirePlan, enforceRequestLimit } from '../middleware/planGate.js';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// server.js imports database/firebase.js first, so getFirestore() is always ready here.
const adminDb = getFirestore();
const router = express.Router();

// Middleware: Authenticate API Key from Firebase
const authenticateApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key is required. Include it in the x-api-key header or apiKey query parameter.'
        });
    }

    try {
        // Query Firebase for the API key
        const snapshot = await adminDb.collection('api_keys')
            .where('key', '==', apiKey)
            .where('status', '==', 'active')
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or revoked API key.'
            });
        }

        const keyDoc = snapshot.docs[0];
        const keyData = keyDoc.data();

        // Update last used timestamp (do NOT increment requestsUsed here - that's handled by enforceRequestLimit)
        await adminDb.collection('api_keys').doc(keyDoc.id).update({
            lastUsed: new Date().toISOString()
        });

        // Attach key data to request for downstream use
        req.apiKeyData = {
            id: keyDoc.id,
            ...keyData
        };

        next();
    } catch (err) {
        console.error('[DaaS Auth] Error validating API key:', err);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to authenticate API key.'
        });
    }
};

// DaaS Health Check
router.get('/health', (req, res) => {
    res.json({
        status: "operational",
        service: "Mobile Computing Sales & Inventory DaaS Engine",
        database: "Firebase Firestore",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    });
});

// DaaS Product Catalog Endpoint (Guarded by API Key + Rate Limiting)
// Returns ONLY products linked to the authenticated API key
router.get('/catalog', authenticateApiKey, enforceRequestLimit, async (req, res) => {
    try {
        const linkedProductIds = req.apiKeyData.linkedProductIds || [];
        const linkedVariantSelections = req.apiKeyData.linkedVariantSelections || {};
        const searchQuery = req.query.search || req.query.q || '';

        // Combine full products and partial products to fetch them all
        const allProductIdsToFetch = Array.from(new Set([...linkedProductIds, ...Object.keys(linkedVariantSelections)]));

        if (allProductIdsToFetch.length === 0) {
            return res.json({
                status: "success",
                message: "No products are linked to this API key. Please select products from the Product Catalog.",
                meta: {
                    count: 0,
                    keyName: req.apiKeyData.name,
                    plan: req.apiKeyData.plan
                },
                products: [],
                action_required: {
                    can_request_product: true,
                    request_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/requests/new`
                }
            });
        }

        // Fetch products from Firebase by IDs
        const productPromises = allProductIdsToFetch.map(async (productId) => {
            const doc = await adminDb.collection('products').doc(productId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        });

        const productsData = await Promise.all(productPromises);
        let products = productsData.filter(p => p !== null);

        // Apply search filter if query provided
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            products = products.filter(p =>
                p.name?.toLowerCase().includes(query) ||
                p.description?.toLowerCase().includes(query) ||
                p.sku?.toLowerCase().includes(query) ||
                p.category?.toLowerCase().includes(query)
            );

            // If no products found after search, return actionable metadata
            if (products.length === 0) {
                return res.json({
                    status: "error",
                    message: `No products found matching query: "${searchQuery}"`,
                    meta: {
                        count: 0,
                        keyName: req.apiKeyData.name,
                        plan: req.apiKeyData.plan,
                        searchQuery: searchQuery
                    },
                    products: [],
                    action_required: {
                        can_request_product: true,
                        request_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/requests/new?query=${encodeURIComponent(searchQuery)}`
                    }
                });
            }
        }

        // Format products for DaaS response.
        // variants array is the SINGLE SOURCE OF TRUTH for price/size/sku/expirationDate.
        // Stale root-level fields (from old flat schema) are intentionally ignored.
        const formattedProducts = products.map(p => {
            // Check if this product has a partial variant selection
            const partialSelections = linkedVariantSelections[p.id];
            
            // If partial selections exist for this product, filter its variants
            let finalVariants = p.variants || [];
            if (partialSelections && Array.isArray(partialSelections) && partialSelections.length > 0) {
                finalVariants = finalVariants.filter(v => {
                    const identifier = `${v.flavor || ''}|${v.size || ''}`;
                    return partialSelections.includes(identifier);
                });
            }

            let baseVariant = {};
            if (finalVariants.length > 0) {
                // Always use the lowest-priced variant as base — ignore old root-level fields
                baseVariant = finalVariants.reduce((prev, curr) => {
                    const prevPrice = typeof prev.price === 'number' ? prev.price : parseFloat(prev.price) || Infinity;
                    const currPrice = typeof curr.price === 'number' ? curr.price : parseFloat(curr.price) || Infinity;
                    return (currPrice < prevPrice) ? curr : prev;
                }, finalVariants[0]);
            }
            return {
                id: p.id,
                sku: baseVariant.sku || null,
                name: p.name,
                description: p.description || '',
                category: p.category,
                segment: p.segment,
                // Always derive price/size from lowest-price variant (not stale root fields)
                price: typeof baseVariant.price === 'number' ? baseVariant.price : (parseFloat(baseVariant.price) || null),
                size: baseVariant.size || null,
                image_url: p.image_url || '',
                metadata: p.metadata || {},
                tags: p.tags || [],
                variants: finalVariants,
                expirationDate: baseVariant.expirationDate || null
            };
        });

        res.json({
            status: "success",
            meta: {
                count: formattedProducts.length,
                keyName: req.apiKeyData.name,
                plan: req.apiKeyData.plan,
                requestsUsed: req.apiKeyData.requestsUsed + 1,
                searchQuery: searchQuery || null,
                compliance: "DPA 2012 Secure Access",
                timestamp: new Date().toISOString()
            },
            products: formattedProducts
        });
    } catch (err) {
        console.error('[DaaS Catalog] Error:', err);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch catalog: ' + err.message
        });
    }
});

// DaaS Sales Analytics Feed Endpoint (Pro+ Only, Rate Limited)
// Returns aggregated transaction data for Professional and Enterprise tiers
router.get('/sales-feed', authenticateApiKey, requirePlan(['pro', 'enterprise']), enforceRequestLimit, (req, res) => {
    // Generate or fetch some clean, mock aggregated sales data for B2B analytics
    res.json({
        summary: {
            totalRevenue: 48250.00,
            totalTransactions: 142,
            averageOrderValue: 339.79,
            currency: "PHP"
        },
        salesFeed: [
            { id: "TXN-001", amount: 490.00, segment: "hardware", timestamp: new Date().toISOString() },
            { id: "TXN-002", amount: 1200.00, segment: "hardware", timestamp: new Date().toISOString() },
            { id: "TXN-003", amount: 45.00, segment: "grocery", timestamp: new Date().toISOString() }
        ]
    });
});

export default router;
