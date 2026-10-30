import express from 'express';
import { getDataStore } from '../database/data-store.js';
import { requirePaidSubscription, enforceRequestLimit } from '../middleware/planGate.js';
import { authorizedProductIds, formatDaaSProduct, resolveCurrentCatalogProducts } from '../services/daas-catalog.js';
import { createDaaSSecurity } from '../services/daas-security.js';
import { createDaaSIntelligenceHandlers } from '../services/customer-intelligence-handlers.js';
import { createRepeatGuard } from '../services/daas-repeat-guard.js';
import { normalizeSegment } from '../services/product-contract.js';
import { chargeMonthlyProducts } from '../services/paid-monthly-quota.js';
import { identifyConsumer, recordConsumer, consumerBlockedError } from '../services/api-consumers.js';
import { sendSecurityError } from '../services/api-key-security.js';

// Data lives in the Supabase database (database/data-store.js).
let adminDb = null;
function getDb() {
  if (!adminDb) {
    adminDb = getDataStore();
  }
  return adminDb;
}
const router = express.Router();

const { authenticateApiKey } = createDaaSSecurity({ getDb });
const intelligence = createDaaSIntelligenceHandlers({ getDb });
// The same request repeated within 2 seconds reuses the first answer (not counted twice).
const repeatGuard = createRepeatGuard({ windowMs: 2000 });

// DaaS Health Check
router.get('/health', (req, res) => {
    res.json({
        status: "operational",
        service: "Mobile Computing Sales & Inventory DaaS Engine",
        database: "Supabase Postgres",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
    });
});

// DaaS Product Catalog Endpoint (Guarded by API Key + Rate Limiting)
// Returns ONLY products linked to the authenticated API key
// Detects which website or app is calling (domain, else IP range) and records it
// against the key; a blocked app is refused before any product is read.
async function detectConsumer(req, res, next) {
    try {
        const consumer = identifyConsumer(req);
        const recorded = await recordConsumer(getDb(), { userId: req.apiKeyData.userId, keyId: req.apiKeyData.id, consumer });
        req.consumer = { ...consumer, id: recorded.id, isNew: recorded.isNew };
        if (recorded.blocked) {
            getDb().collection('api_telemetry').add({ apiKeyId: req.apiKeyData.id, userId: req.apiKeyData.userId, keyName: req.apiKeyData.name,
                endpoint: '/catalog', method: 'GET', statusCode: 403, success: false, latencyMs: 0, timestamp: new Date(), ...consumerTelemetry(req) }).catch(console.error);
            return sendSecurityError(res, consumerBlockedError());
        }
        return next();
    } catch (error) {
        console.error('[DaaS] App detection failed:', error.message);
        return res.status(503).json({ success: false, error: 'SERVICE_UNAVAILABLE', message: 'Unable to verify the calling app. Please retry.' });
    }
}
// Where the call came from, for the owner's request history.
const consumerTelemetry = req => req.consumer ? {
    consumerLabel: req.consumer.label, consumerKind: req.consumer.kind,
    consumerDomain: req.consumer.domain, consumerIp: req.consumer.ip, newConsumer: req.consumer.isNew === true,
} : {};

router.get('/catalog', repeatGuard, authenticateApiKey, enforceRequestLimit, detectConsumer, async (req, res) => {
    try {
        const linkedVariantSelections = req.apiKeyData.linkedVariantSelections || {};
        // A repeated ?search= arrives as an array; use the first value so .trim() never throws.
        const rawSearch = req.query.search || req.query.q || '';
        const searchQuery = String(Array.isArray(rawSearch) ? rawSearch[0] ?? '' : rawSearch);

        // Combine current, partial-variant, and stable legacy product IDs.
        // Legacy embedded product fields never become catalog data.
        const allProductIdsToFetch = authorizedProductIds(req.apiKeyData);

        if (allProductIdsToFetch.length === 0) {
            const latencyMs = Date.now() - req.startTime;
            const ts = new Date();
            
            // Log telemetry — timestamp must be a Date (not a string)
            // so that orderBy('timestamp') works correctly.
            getDb().collection('api_telemetry').add({
                apiKeyId: req.apiKeyData.id,
                userId: req.apiKeyData.userId,
                keyName: req.apiKeyData.name,
                endpoint: '/catalog',
                method: 'GET',
                ...consumerTelemetry(req),
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
                    plan: req.userPlan
                },
                products: [],
                action_required: {
                    can_request_product: true,
                    request_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/requests/new`
                }
            });
        }

        // Resolve current documents on every request. API keys authorize product IDs;
        // they never make embedded product snapshots authoritative.
        const userData = req.userPlanData;
        const resolvedCatalog = await resolveCurrentCatalogProducts({
            apiKeyData: req.apiKeyData,
            userData,
            searchQuery,
            loadProductById: async productId => {
                const doc = await getDb().collection('products').doc(productId).get();
                return doc.exists ? doc.data() : null;
            }
        });
        let products = resolvedCatalog.products;
        // Optional ?segment=Grocery|Pharmacy|Hardware: only that segment's products
        // (a Pro Max key holds all three). Unknown values match nothing.
        const rawSegment = Array.isArray(req.query.segment) ? req.query.segment[0] : req.query.segment;
        if (rawSegment !== undefined && String(rawSegment).trim()) {
            const wanted = normalizeSegment(String(rawSegment));
            products = products.filter(product => wanted && normalizeSegment(product.segment) === wanted);
        }

        if (searchQuery.trim()) {
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
                    ...consumerTelemetry(req),
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
                        plan: req.userPlan,
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
        const isFreePlan = ['free', 'starter'].includes(String(req.userPlan).toLowerCase());

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
            perPage = (!isNaN(requestedPerPage) && requestedPerPage >= 1)
                ? Math.min(requestedPerPage, 250)
                : Math.max(totalBeforePage, 1);
        }

        const totalPages = Math.max(1, Math.ceil(totalBeforePage / perPage));
        const page = (!isNaN(requestedPage) && requestedPage >= 1) ? Math.min(requestedPage, totalPages) : 1;
        const startIndex = (page - 1) * perPage;
        const pageSlice = products.slice(startIndex, startIndex + perPage);
        // productAvailability is the consumer-specific authorization timestamp map.
        // availableToConsumerSince = when THIS consumer gained access to THIS product.
        // This is authoritative for "new product" detection on the consumer side.
        // It is NOT the same as the product's catalog createdAt.
        const productAvailability = req.apiKeyData.productAvailability || {};

        const pageFormatted = pageSlice.map(product => formatDaaSProduct(product, {
            selectedVariants: linkedVariantSelections[product.id],
            availability: productAvailability[product.id]
        }));

        // Pro / Pro Max: every variant sent uses one of the month's allowance (a
        // product without variants uses one) — but only once per app per month: a
        // variant this app already received is sent free. Send no more new
        // variants than what is left; a product may carry only those that fit.
        const variantCount = product => Math.max(1, Array.isArray(product.variants) ? product.variants.length : 0);
        const variantKey = (product, variant, index) => `${product.id}#${variant?.sku || (variant ? `${variant.flavor || ''}|${variant.size || ''}|${index}` : 'base')}`;
        const keysOf = product => Array.isArray(product.variants) && product.variants.length
            ? product.variants.map((variant, index) => variantKey(product, variant, index)) : [variantKey(product, null, 0)];
        const pageVariants = pageFormatted.reduce((sum, product) => sum + variantCount(product), 0);
        let formattedProducts = pageFormatted;
        let quota = req.requestUsage;
        let sentVariants = pageVariants;
        let segmentUsage = null;
        let countedVariants = 0;
        if (req.productCharge && pageFormatted.length > 0) {
            const charged = await chargeMonthlyProducts(getDb(), { ...req.productCharge, consumerId: req.consumer?.id || null,
                items: pageFormatted.map(product => ({ segment: normalizeSegment(product.segment) || 'general', variantKeys: keysOf(product) })) });
            quota = charged.usage;
            segmentUsage = charged.segments;
            countedVariants = charged.granted;
            if (charged.granted === 0 && charged.repeated === 0) {
                return res.status(429).json({
                    success: false, error: 'Rate Limit Exceeded',
                    message: `Monthly allowance of ${quota.limit.toLocaleString('en-US')} products (each variant counts as one) is used up. It resets on the 1st of next month (UTC).`,
                    quota,
                });
            }
            formattedProducts = pageFormatted.flatMap((product, i) => {
                const keys = charged.allowedKeys[i];
                if (!keys || keys.length === 0) return [];
                if (keys.length >= variantCount(product) || !Array.isArray(product.variants) || !product.variants.length) return [product];
                const wanted = new Set(keys);
                return [{ ...product, variants: product.variants.filter((variant, index) => wanted.has(variantKey(product, variant, index))) }];
            });
            sentVariants = charged.granted + charged.repeated;
        }
        const limitedByQuota = sentVariants < pageVariants;
        const hasNextPage = startIndex + pageSlice.length < totalBeforePage;

        const latencyMs = Date.now() - req.startTime;
        const ts = new Date();
        
        getDb().collection('api_telemetry').add({
            apiKeyId: req.apiKeyData.id,
            userId: req.apiKeyData.userId,
            keyName: req.apiKeyData.name,
            endpoint: '/catalog',
            method: 'GET',
            ...consumerTelemetry(req),
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
                plan: req.userPlan,
                plan_cap: maxPerPage,
                requestsUsed: quota?.used ?? null,
                quota,
                ...(segmentUsage ? { segmentUsage } : {}),
                variantsSent: sentVariants,
                ...(req.productCharge ? { variantsCounted: countedVariants } : {}),
                ...(req.consumer ? { app: { source: req.consumer.label, kind: req.consumer.kind, new: req.consumer.isNew === true } } : {}),
                ...(limitedByQuota ? { quotaLimited: true, quotaMessage: `Only ${sentVariants} of ${pageVariants} product variants were sent: the monthly allowance is used up.` } : {}),
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
            ...consumerTelemetry(req),
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
            message: 'Failed to fetch catalog.'
        });
    }
});

// Authenticated integrations submit completed sales; the same account quota,
// IP limiter, key ownership, and segment rules apply as to catalog requests.
// Sales Analytics is switched off for now. Set this to true to turn both endpoints back on.
const SALES_ANALYTICS_ENABLED = false;
const salesSwitch = (_req, res, next) => SALES_ANALYTICS_ENABLED ? next()
  : res.status(404).json({ status: 'error', code: 'SALES_ANALYTICS_UNAVAILABLE', message: 'Sales Analytics is not available.' });
router.post('/sales', salesSwitch, authenticateApiKey, enforceRequestLimit, intelligence.sale);
router.get('/sales-feed', salesSwitch, authenticateApiKey, requirePaidSubscription, enforceRequestLimit, intelligence.feed);

export default router;
