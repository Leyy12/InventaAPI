import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { requirePlan, enforceRequestLimit } from '../middleware/planGate.js';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// server.js imports database/firebase.js first, so getDb() is always ready here.
let adminDb = null;
function getDb() {
  if (!adminDb) {
    adminDb = getFirestore();
  }
  return adminDb;
}
const router = express.Router();

// Middleware: Authenticate API Key from Firebase
const authenticateApiKey = async (req, res, next) => {
    req.startTime = Date.now(); // Start timing for telemetry
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
        const ts = new Date();
        getDb().collection('audit_logs').add({
            action: 'Authentication Failure',
            userId: 'Unknown',
            email: 'Unknown Client',
            endpoint: req.path,
            status: 401,
            timestamp: ts
        }).catch(console.error);
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'API key is required. Include it in the x-api-key header or apiKey query parameter.'
        });
    }

    try {
        // Query Firebase for the API key
        const snapshot = await getDb().collection('api_keys')
            .where('key', '==', apiKey)
            .where('status', '==', 'active')
            .limit(1)
            .get();

        if (snapshot.empty) {
            const ts = new Date();
            getDb().collection('audit_logs').add({
                action: 'Invalid API Key Attempt',
                userId: 'Unknown',
                email: 'Unknown Client',
                endpoint: req.path,
                status: 401,
                timestamp: ts
            }).catch(console.error);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or revoked API key.'
            });
        }

        const keyDoc = snapshot.docs[0];
        const keyData = keyDoc.data();

        // Update last used timestamp (do NOT increment requestsUsed here - that's handled by enforceRequestLimit)
        await getDb().collection('api_keys').doc(keyDoc.id).update({
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
            const latencyMs = Date.now() - req.startTime;
            const ts = new Date();
            
            // Log telemetry — timestamp must be a Date/Firestore Timestamp (not a string)
            // so that Firestore orderBy('timestamp') works correctly.
            getDb().collection('api_telemetry').add({
                apiKeyId: req.apiKeyData.id,
                userId: req.apiKeyData.userId,
                keyName: req.apiKeyData.name,
                endpoint: '/catalog',
                method: 'GET',
                statusCode: 200,
                success: true,
                latencyMs,
                timestamp: ts
            }).catch(console.error);
            
            getDb().collection('audit_logs').add({
                action: 'API Request',
                userId: req.apiKeyData.userId,
                email: req.apiKeyData.userEmail || req.apiKeyData.name,
                endpoint: '/catalog',
                status: 200,
                timestamp: ts
            }).catch(console.error);

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
            const doc = await getDb().collection('products').doc(productId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        });

        const productsData = await Promise.all(productPromises);
        let products = productsData.filter(p => p !== null);

        // SECURITY: Enforce segment restriction for Free plan users
        const userDoc = await getDb().collection('users').doc(req.apiKeyData.userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            const userPlan = userData.plan;
            const isFreePlan = ['free', 'Free', 'Starter'].includes(userPlan);
            
            if (isFreePlan && userData.selectedSegment) {
                products = products.filter(p => p.segment === userData.selectedSegment);
            }
        }

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
                const latencyMs = Date.now() - req.startTime;
                const ts = new Date();
                
                getDb().collection('api_telemetry').add({
                    apiKeyId: req.apiKeyData.id,
                    userId: req.apiKeyData.userId,
                    keyName: req.apiKeyData.name,
                    endpoint: '/catalog',
                    method: 'GET',
                    statusCode: 200,
                    success: true,
                    latencyMs,
                    timestamp: ts
                }).catch(console.error);
                
                getDb().collection('audit_logs').add({
                    action: 'API Request',
                    userId: req.apiKeyData.userId,
                    email: req.apiKeyData.userEmail || req.apiKeyData.name,
                    endpoint: '/catalog',
                    status: 200,
                    timestamp: ts
                }).catch(console.error);

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

        // ═══════════════════════════════════════════════════════════════════════════
        // PAGINATION / FREE 50-PRODUCT CAP
        // Free-plan consumers may receive at most 50 products per request. To access a
        // larger catalog they page through it across multiple requests via `?page=N`
        // (continuation). `?perPage` is accepted but capped at 50 for Free plans.
        // Pro/Enterprise plans are not capped and receive the full set by default.
        // ═══════════════════════════════════════════════════════════════════════════
        let isFreePlan = false;
        if (userDoc.exists) {
            isFreePlan = ['free', 'Free', 'Starter'].includes(userDoc.data().plan);
        }

        const totalBeforePage = products.length;
        const maxPerPage = isFreePlan ? 50 : null; // null = no cap for paid plans
        const requestedPage = parseInt(req.query.page, 10);
        const requestedPerPage = parseInt(req.query.perPage, 10);

        let perPage;
        if (isFreePlan) {
            // Free: never more than 50 products in a single response
            perPage = (!isNaN(requestedPerPage) && requestedPerPage >= 1) ? Math.min(requestedPerPage, maxPerPage) : maxPerPage;
        } else {
            // Paid: allow an explicit page size (capped at 250 for safety), else all
            perPage = (!isNaN(requestedPerPage) && requestedPerPage >= 1) ? Math.min(requestedPerPage, 250) : totalBeforePage;
        }

        const totalPages = Math.max(1, Math.ceil(totalBeforePage / perPage));
        const page = (!isNaN(requestedPage) && requestedPage >= 1) ? Math.min(requestedPage, totalPages) : 1;
        const startIndex = (page - 1) * perPage;
        const pageSlice = products.slice(startIndex, startIndex + perPage);
        const hasNextPage = startIndex + pageSlice.length < totalBeforePage;

        products = pageSlice;

        // productAvailability is the consumer-specific authorization timestamp map.
        // availableToConsumerSince = when THIS consumer gained access to THIS product.
        // This is authoritative for "new product" detection on the consumer side.
        // It is NOT the same as the product's catalog createdAt.
        const productAvailability = req.apiKeyData.productAvailability || {};

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

            // Resolve availableToConsumerSince from productAvailability map.
            // Convert Firestore Timestamp to ISO string for JSON transport.
            const availability = productAvailability[p.id];
            let availableToConsumerSince = null;
            if (availability?.availableSince) {
                const ts = availability.availableSince;
                availableToConsumerSince = ts.toDate ? ts.toDate().toISOString() : new Date(ts).toISOString();
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
                expirationDate: baseVariant.expirationDate || null,
                // availableToConsumerSince: when this product was authorized for this
                // specific API key. Use this for consumer-side "new product" detection.
                // null means this product was linked before availability tracking was introduced.
                availableToConsumerSince
            };
        });

        const latencyMs = Date.now() - req.startTime;
        const ts = new Date();
        
        getDb().collection('api_telemetry').add({
            apiKeyId: req.apiKeyData.id,
            userId: req.apiKeyData.userId,
            keyName: req.apiKeyData.name,
            endpoint: '/catalog',
            method: 'GET',
            statusCode: 200,
            success: true,
            latencyMs,
            timestamp: ts
        }).catch(console.error);
        
        getDb().collection('audit_logs').add({
            action: 'API Request',
            userId: req.apiKeyData.userId,
            email: req.apiKeyData.userEmail || req.apiKeyData.name,
            endpoint: '/catalog',
            status: 200,
            timestamp: ts
        }).catch(console.error);

        res.json({
            status: "success",
            meta: {
                count: formattedProducts.length,
                total: totalBeforePage,
                keyName: req.apiKeyData.name,
                plan: req.apiKeyData.plan,
                plan_cap: maxPerPage,
                requestsUsed: req.apiKeyData.requestsUsed + 1,
                searchQuery: searchQuery || null,
                compliance: "DPA 2012 Secure Access",
                timestamp: ts.toISOString(),
                pagination: {
                    page,
                    perPage,
                    total: totalBeforePage,
                    totalPages,
                    hasNextPage,
                    nextPage: hasNextPage ? page + 1 : null
                }
            },
            products: formattedProducts
        });
    } catch (err) {
        console.error('[DaaS Catalog] Error:', err);
        
        const latencyMs = Date.now() - (req.startTime || Date.now());
        const ts = new Date();
        getDb().collection('api_telemetry').add({
            apiKeyId: req.apiKeyData?.id || 'unknown',
            userId: req.apiKeyData?.userId || 'unknown',
            keyName: req.apiKeyData?.name || 'unknown',
            endpoint: '/catalog',
            method: 'GET',
            statusCode: 500,
            success: false,
            latencyMs,
            timestamp: ts
        }).catch(console.error);
        
        getDb().collection('audit_logs').add({
            action: 'API Request Failed',
            userId: req.apiKeyData?.userId || 'unknown',
            email: req.apiKeyData?.userEmail || req.apiKeyData?.name || 'Unknown',
            endpoint: '/catalog',
            status: 500,
            timestamp: ts
        }).catch(console.error);

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch catalog: ' + err.message
        });
    }
});

// DaaS Sales Analytics Feed Endpoint (Pro+ Only, Rate Limited)
// Returns aggregated transaction data for Professional and Enterprise tiers
router.get('/sales-feed', authenticateApiKey, requirePlan(['pro', 'enterprise']), enforceRequestLimit, (req, res) => {
    const latencyMs = Date.now() - req.startTime;
    const ts = new Date();
    
    getDb().collection('api_telemetry').add({
        apiKeyId: req.apiKeyData.id,
        userId: req.apiKeyData.userId,
        keyName: req.apiKeyData.name,
        endpoint: '/sales-feed',
        method: 'GET',
        statusCode: 200,
        success: true,
        latencyMs,
        timestamp: ts
    }).catch(console.error);
    
    getDb().collection('audit_logs').add({
        action: 'API Request',
        userId: req.apiKeyData.userId,
        email: req.apiKeyData.userEmail || req.apiKeyData.name,
        endpoint: '/sales-feed',
        status: 200,
        timestamp: ts
    }).catch(console.error);

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
