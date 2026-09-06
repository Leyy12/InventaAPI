import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';

let adminDb = null;
function getDb() {
  if (!adminDb) {
    adminDb = getFirestore();
  }
  return adminDb;
}
const router = express.Router();

// ---------------------------------------------------------------------------
// PAYMONGO CONFIG
// ---------------------------------------------------------------------------
const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';
const PRO_PLAN_AMOUNT_CENTAVOS = 149900; // ₱1,499.00 in centavos

/**
 * Build the Base64-encoded Authorization header for PayMongo.
 * PayMongo uses HTTP Basic Auth where the password is the secret key.
 */
function getPayMongoAuthHeader() {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) {
        throw new Error('PAYMONGO_SECRET_KEY is not set in environment variables.');
    }
    return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// POST /api/v1/checkout/create-gcash
// ---------------------------------------------------------------------------
/**
 * Creates a PayMongo Checkout Session for GCash.
 * The dashboard calls this endpoint, then redirects the user to the returned URL.
 *
 * Body: { userId: string, userEmail: string }
 * Response: { checkoutUrl: string, sessionId: string }
 *
 * Flow:
 *   1. Dashboard calls this → gets checkoutUrl (checkout_sessions API)
 *   2. User is redirected to checkoutUrl (PayMongo hosted GCash page)
 *   3. User pays via GCash
 *   4. PayMongo fires "payment.paid" / "checkout_session.payment.paid"
 *      webhook → /api/webhooks/paymongo
 *   5. Webhook verifies HMAC signature, dedupes, and updates Firestore
 */
router.post('/create-gcash', async (req, res) => {
    const { userId, userEmail } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required.' });
    }

    // --- Verify user exists before creating a payment ---
    try {
        const userSnap = await getDb().collection('users').doc(userId).get();
        if (!userSnap.exists) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const userData = userSnap.data();
        if (userData.plan === 'Pro' && userData.subscriptionExpiresAt) {
            const expiresAt = new Date(userData.subscriptionExpiresAt);
            if (expiresAt > new Date()) {
                // Already on Pro and not expired yet — prevent duplicate payment
                return res.status(409).json({
                    error: 'User already has an active Pro subscription.',
                    expiresAt: userData.subscriptionExpiresAt,
                });
            }
        }
    } catch (err) {
        console.error('[CHECKOUT] ❌ User lookup failed:', err.message);
        return res.status(500).json({ error: 'Failed to verify user.' });
    }

    // --- Create PayMongo Checkout Session (hosted GCash page) ---
    try {
        const authHeader = getPayMongoAuthHeader();

        // Determine redirect URLs
        const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
        const successUrl = `${dashboardUrl}/dashboard?payment=success`;
        const failedUrl = `${dashboardUrl}/?payment=cancelled`;

        // PayMongo Checkout Sessions API — works for one-time subscription payments.
        // Response contains `data.attributes.checkout_url` to redirect the user to.
        const paymongoPayload = {
            data: {
                attributes: {
                    line_items: [
                        {
                            currency: 'PHP',
                            amount: PRO_PLAN_AMOUNT_CENTAVOS,
                            name: 'InventaAPI Pro Plan',
                            description: '1 Month Subscription — 5,000 API requests/day',
                            quantity: 1,
                        },
                    ],
                    payment_method_types: ['gcash'],
                    success_url: successUrl,
                    cancel_url: failedUrl,
                    metadata: {
                        userId,
                        userEmail: userEmail || '',
                        plan: 'Pro',
                    },
                    statement_descriptor: 'InventaAPI Pro Plan',
                    send_email_receipt: false,
                    show_description: true,
                    show_line_items: true,
                },
            },
        };

        const pmResponse = await fetch(`${PAYMONGO_BASE_URL}/checkout_sessions`, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(paymongoPayload),
        });

        const pmData = await pmResponse.json();

        if (!pmResponse.ok) {
            console.error('[CHECKOUT] ❌ PayMongo API error:', JSON.stringify(pmData));

            // Give the frontend a clear, actionable message for common failures.
            let detail = pmData?.errors?.[0]?.detail || 'Unknown error';
            if (pmResponse.status === 401) {
                detail = 'PayMongo authentication failed. The PAYMONGO_SECRET_KEY in .env is invalid or still a placeholder.';
            }

            return res.status(502).json({
                error: 'PayMongo returned an error.',
                code: pmResponse.status === 401 ? 'paymongo_auth_failed' : 'paymongo_api_error',
                details: detail,
            });
        }

        const sessionData = pmData?.data;
        const checkoutUrl = sessionData?.attributes?.checkout_url;
        const sessionId = sessionData?.id;

        if (!checkoutUrl) {
            console.error('[CHECKOUT] ❌ No checkout_url in PayMongo response:', JSON.stringify(pmData));
            return res.status(502).json({ error: 'Failed to get checkout URL from PayMongo.' });
        }

        console.log(`[CHECKOUT] ✅ Created checkout session for user ${userId}. Session ID: ${sessionId}`);

        return res.status(200).json({
            success: true,
            checkoutUrl,
            sessionId: sessionId || '',
            amount: PRO_PLAN_AMOUNT_CENTAVOS,
            currency: 'PHP',
        });

    } catch (err) {
        console.error('[CHECKOUT] ❌ Unexpected error:', err.message);
        return res.status(500).json({ error: 'Failed to create checkout session: ' + err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /api/v1/checkout/subscription-status?userId=xxx
// ---------------------------------------------------------------------------
/**
 * Called by the dashboard on load to check subscription status.
 * Also handles auto-downgrade if subscription has expired.
 * (Spark-plan alternative to Firebase Scheduled Functions)
 */
router.get('/subscription-status', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId query param is required.' });
    }

    try {
        const userRef = getDb().collection('users').doc(userId);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const data = userSnap.data();
        const plan = data.plan;
        const expiresAt = data.subscriptionExpiresAt;

        // --- Auto-downgrade if Pro subscription has expired ---
        if (plan === 'Pro' && expiresAt) {
            const expiryDate = new Date(expiresAt);
            const now = new Date();

            if (expiryDate <= now) {
                console.log(`[CHECKOUT] ⏰ User ${userId} Pro subscription expired. Downgrading to Free.`);

                await userRef.update({
                    plan: 'Free',
                    apiRequestLimit: 50,
                    subscription_status: 'inactive',
                    // Keep subscriptionExpiresAt for audit trail (do not delete)
                });

                return res.status(200).json({
                    plan: 'Free',
                    subscription_status: 'inactive',
                    expired: true,
                    expiredAt: expiresAt,
                });
            }

            // Still active — return days remaining
            const msLeft = expiryDate - now;
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

            return res.status(200).json({
                plan,
                subscription_status: data.subscription_status,
                subscriptionExpiresAt: expiresAt,
                daysLeft,
                expired: false,
            });
        }

        return res.status(200).json({
            plan: plan || 'Free',
            subscription_status: data.subscription_status || 'inactive',
            subscriptionExpiresAt: expiresAt || null,
            expired: false,
        });

    } catch (err) {
        console.error('[CHECKOUT] ❌ Error checking subscription status:', err.message);
        return res.status(500).json({ error: 'Failed to check subscription status.' });
    }
});

export default router;
