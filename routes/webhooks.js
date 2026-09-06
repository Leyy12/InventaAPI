import express from 'express';
import crypto from 'crypto';
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
// STARTUP GUARD — Hard fail if webhook secret is not configured.
// This prevents the server from accepting ANY webhook requests when the
// secret is missing or still set to the placeholder value.
// ---------------------------------------------------------------------------
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
const PLACEHOLDER = 'whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET';

// Replay-attack protection: reject signatures whose timestamp is older/newer
// than this many milliseconds (PayMongo recommends a 5-minute tolerance).
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

if (!WEBHOOK_SECRET || WEBHOOK_SECRET === PLACEHOLDER) {
    // In production, this is a fatal misconfiguration — crash immediately.
    // In development, emit a loud warning but allow server to start for
    // non-webhook testing (all webhook requests will still be rejected 401).
    if (process.env.NODE_ENV === 'production') {
        console.error('═══════════════════════════════════════════════════════');
        console.error('[WEBHOOK] ❌ FATAL: PAYMONGO_WEBHOOK_SECRET is not set.');
        console.error('   Set it in .env and restart the server.');
        console.error('   Get it from: PayMongo Dashboard → Developers → Webhooks');
        console.error('═══════════════════════════════════════════════════════');
        process.exit(1); // Hard crash — do NOT accept payments without a secret
    } else {
        console.warn('═══════════════════════════════════════════════════════');
        console.warn('[WEBHOOK] ⚠️  WARNING: PAYMONGO_WEBHOOK_SECRET is not set.');
        console.warn('   All webhook requests will be rejected with 401.');
        console.warn('   Set it in .env before testing with real PayMongo events.');
        console.warn('═══════════════════════════════════════════════════════');
    }
}

// ---------------------------------------------------------------------------
// PRO PLAN CONFIGURATION
// ---------------------------------------------------------------------------
const PRO_PLAN_CONFIG = {
    plan: 'Pro',
    apiRequestLimit: 5000,
    subscription_status: 'active',
    subscriptionDurationDays: 30,
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Verify PayMongo webhook signature.
 *
 * PayMongo sends: `Paymongo-Signature: t=<timestamp>,li=<live_sig>,te=<test_sig>`
 *
 * The signed payload format is: "<timestamp>.<raw_body_string>"
 * We recompute HMAC-SHA256 with our secret and compare using constant-time
 * comparison to prevent timing-based attacks.
 *
 * Which signature part to use:
 *   - `te` (test) — used when the PayMongo webhook was created in TEST mode
 *   - `li` (live) — used when the PayMongo webhook was created in LIVE mode
 *
 * This is determined by NODE_ENV. In production, only live-mode signatures
 * are accepted.
 *
 * @see https://developers.paymongo.com/docs/webhook-signature
 *
 * @param {string} rawBody   - Raw UTF-8 request body string (not parsed JSON)
 * @param {string} signatureHeader - Value of the `Paymongo-Signature` header
 * @param {string} secret    - PAYMONGO_WEBHOOK_SECRET from environment
 * @returns {boolean}        - true only if signature is valid
 */
function verifyPayMongoSignature(rawBody, signatureHeader, secret) {
    // Reject immediately if any required value is absent
    if (!rawBody || !signatureHeader || !secret) return false;

    // Parse header: "t=1234567890,li=abc123...,te=def456..."
    const parts = {};
    signatureHeader.split(',').forEach((part) => {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
            parts[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
        }
    });

    const timestamp = parts['t'];
    // Select the correct signature token based on environment
    const signature = process.env.NODE_ENV === 'production' ? parts['li'] : parts['te'];

    if (!timestamp || !signature) {
        console.warn('[WEBHOOK] Missing timestamp or signature token in header.');
        return false;
    }

    // Replay-attack protection — reject stale/future-dated signatures.
    // PayMongo sends the timestamp in SECONDS; Date.now() is in milliseconds,
    // so convert to ms before comparing (#timestampMs = seconds * 1000).
    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > TIMESTAMP_TOLERANCE_MS) {
        console.warn('[WEBHOOK] Signature timestamp outside tolerance — rejecting.');
        return false;
    }

    // Reconstruct the signed payload exactly as PayMongo does
    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload, 'utf8')
        .digest('hex');

    // Constant-time comparison to prevent timing-based signature forgery
    try {
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');

        // Buffers must be same length for timingSafeEqual
        if (sigBuffer.length !== expectedBuffer.length) return false;

        return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
        return false;
    }
}

/**
 * Compute ISO string N days from now.
 */
function daysFromNow(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
}

/**
 * Build the Base64-encoded Authorization header for PayMongo (same as checkout.js).
 */
function getPayMongoAuthHeader() {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) return null;
    return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

/**
 * Fallback: fetch a checkout session's metadata from the PayMongo API.
 * Used when a webhook payload does not carry the userId in its direct metadata,
 * so the subscription can still be attributed to the correct user.
 */
async function fetchCheckoutSessionMetadata(checkoutSessionId) {
    const authHeader = getPayMongoAuthHeader();
    if (!checkoutSessionId || !authHeader) return null;
    try {
        const res = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}`, {
            headers: { Authorization: authHeader, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.data?.attributes?.metadata || null;
    } catch {
        return null;
    }
}

/**
 * Normalize a PayMongo webhook event into the fields we care about.
 * Handles both `payment.*` and `checkout_session.*` payload shapes.
 */
function extractPaymentInfo(event) {
    const root = event?.data;
    const eventType = root?.attributes?.type;
    const inner = root?.attributes?.data; // payment OR checkout_session object
    const attrs = inner?.attributes ?? {};

    if (eventType === 'payment.failed' || eventType === 'checkout_session.payment.failed') {
        return { eventType, failed: true, amount: attrs.amount, currency: attrs.currency };
    }

    const isPaidEvent = eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid';
    if (!isPaidEvent) return { eventType, ignored: true };

    // The paid payment may be the inner object itself (payment.paid) or nested
    // inside checkout_session.payment.paid under `payments[]`.
    const paymentsArr = Array.isArray(attrs.payments) ? attrs.payments : [];
    const paidPayment =
        inner?.type === 'payment'
            ? inner
            : paymentsArr.find((p) => p?.attributes?.status === 'paid') || paymentsArr[0] || null;
    const paymentAttrs = paidPayment?.attributes || attrs;

    const checkoutSessionId =
        inner?.type === 'checkout_session'
            ? inner.id
            : paymentAttrs.checkout_session_id || attrs.checkout_session_id || '';

    return {
        eventType,
        paid: true,
        webhookEventId: root?.id || '',
        checkoutSessionId,
        paymentId: paidPayment?.id || inner?.id || '',
        metadata: paymentAttrs.metadata || attrs.metadata || {},
        amount: paymentAttrs.amount,
        currency: paymentAttrs.currency,
        paymentIntentId: paymentAttrs.payment_intent_id || '',
    };
}

/**
 * Write a webhook anomaly to the `subscription_reviews` collection for manual
 * review (e.g. user not found, or no userId could be determined).
 */
async function writeReviewEntry({ userId, userEmail, webhookEventId, checkoutSessionId, paymentId, reason }) {
    try {
        await getDb().collection('subscription_reviews').add({
            userId: userId || '',
            userEmail: userEmail || '',
            webhookEventId: webhookEventId || '',
            checkoutSessionId: checkoutSessionId || '',
            paymongoPaymentId: paymentId || '',
            reason,
            createdAt: new Date().toISOString(),
            status: 'needs_review',
        });
    } catch (err) {
        console.error('[WEBHOOK] ⚠️ Failed to write review entry:', err.message);
    }
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/paymongo
// ---------------------------------------------------------------------------
router.post('/paymongo', async (req, res) => {
    const signatureHeader = req.headers['paymongo-signature'];

    // --- 1. Reject early if secret is not configured ---
    // (Already warned at startup, but double-check here for safety)
    if (!WEBHOOK_SECRET || WEBHOOK_SECRET === PLACEHOLDER) {
        console.error('[WEBHOOK] ❌ Rejecting request: PAYMONGO_WEBHOOK_SECRET is not configured.');
        return res.status(500).json({ error: 'Webhook secret not configured on server.' });
    }

    // --- 2. Ensure raw body is present ---
    const rawBody = req.rawBody; // Attached by server.js verify callback
    if (!rawBody) {
        console.error('[WEBHOOK] ❌ rawBody is missing — check server.js middleware setup.');
        return res.status(400).json({ error: 'Missing raw body.' });
    }

    // --- 3. Verify HMAC signature ---
    if (!verifyPayMongoSignature(rawBody, signatureHeader, WEBHOOK_SECRET)) {
        const attempt = {
            ip: req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            signature: signatureHeader || '(none)',
            at: new Date().toISOString(),
        };
        console.error('[WEBHOOK] ❌ HMAC signature verification FAILED — rejecting (403).', JSON.stringify(attempt));

        // Best-effort security audit trail for manual review
        try {
            await getDb().collection('audit_logs').add({
                action: 'Webhook Signature Verification Failed',
                timestamp: new Date().toISOString(),
                details: 'Rejected with 403: invalid or unverifiable PayMongo signature.',
                ipAddress: attempt.ip,
                userAgent: attempt.userAgent,
                paymongoSignature: attempt.signature,
            });
        } catch { /* non-fatal — logging must not block the rejection */ }

        return res.status(403).json({ error: 'Invalid signature.' });
    }

    // --- 4. Parse event ---
    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return res.status(400).json({ error: 'Invalid JSON payload.' });
    }

    const info = extractPaymentInfo(event);
    console.log(`[WEBHOOK] Received event: ${info.eventType} | ID: ${event?.data?.id}`);

    // Acknowledge unrelated events without processing
    if (info.ignored) {
        return res.status(200).json({ received: true, processed: false });
    }

    // Failed/cancelled payment — log only, NEVER upgrade the plan.
    if (info.failed) {
        console.warn(`[WEBHOOK] Payment failed/cancelled (${info.eventType}). No plan change applied.`);
        return res.status(200).json({ received: true, processed: false, reason: 'failed' });
    }

    // --- 5. Determine userId (with API fallback) ---
    let userId = info.metadata?.userId || '';
    let userEmail = info.metadata?.userEmail || '';
    const paymongoReferenceId = info.paymentId || '';
    const webhookEventId = info.webhookEventId || '';

    if (!userId && info.checkoutSessionId) {
        const sessionMeta = await fetchCheckoutSessionMetadata(info.checkoutSessionId);
        if (sessionMeta?.userId) {
            userId = sessionMeta.userId;
            userEmail = sessionMeta.userEmail || userEmail;
            console.log(`[WEBHOOK] ✅ Resolved userId from checkout session ${info.checkoutSessionId}.`);
        }
    }

    if (!userId) {
        console.error('[WEBHOOK] ❌ Could not determine userId for subscription activation.');
        await writeReviewEntry({
            webhookEventId,
            checkoutSessionId: info.checkoutSessionId,
            paymentId: paymongoReferenceId,
            reason: 'Missing userId in payment metadata',
        });
        return res.status(422).json({ error: 'Missing userId in metadata.' });
    }

    // --- 6. Idempotency check — prevent double-processing same event ---
    try {
        const existingTx = await getDb()
            .collection('transactions')
            .where('webhookEventId', '==', webhookEventId)
            .limit(1)
            .get();

        if (!existingTx.empty) {
            console.log(`[WEBHOOK] ⏭️ Event ${webhookEventId} already processed. Skipping.`);
            return res.status(200).json({ received: true, processed: false, reason: 'duplicate' });
        }
    } catch (err) {
        console.error('[WEBHOOK] ❌ Idempotency check failed:', err.message);
        // Continue anyway — better to risk duplicate than to miss a payment
    }

    // --- 7. Compute subscription period ---
    const now = new Date().toISOString();
    const expiresAt = daysFromNow(PRO_PLAN_CONFIG.subscriptionDurationDays);

    // --- 8. Update user document via Admin SDK (bypasses Firestore rules) ---
    try {
        const userRef = getDb().collection('users').doc(userId);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            // Log loudly + create a manual-review record. Ack 200 so PayMongo
            // stops retrying — the human review step handles the account.
            console.error(`[WEBHOOK] ❌ User document NOT FOUND for uid: ${userId}. Event: ${webhookEventId}. Payment: ${paymongoReferenceId}. Needs MANUAL REVIEW.`);
            await writeReviewEntry({
                userId,
                userEmail,
                webhookEventId,
                checkoutSessionId: info.checkoutSessionId,
                paymentId: paymongoReferenceId,
                reason: 'User not found',
            });
            return res.status(200).json({ received: true, processed: false, reason: 'user_not_found' });
        }

        await userRef.update({
            plan: PRO_PLAN_CONFIG.plan,
            apiRequestLimit: PRO_PLAN_CONFIG.apiRequestLimit,
            subscription_status: PRO_PLAN_CONFIG.subscription_status,
            subscriptionExpiresAt: expiresAt,
            lastSubscribedAt: now,
        });

        console.log(`[WEBHOOK] ✅ User ${userId} upgraded to Pro. Expires: ${expiresAt}`);
    } catch (err) {
        console.error('[WEBHOOK] ❌ Failed to update user document:', err.message);
        return res.status(500).json({ error: 'Failed to update user subscription.' });
    }

    // --- 9. Create transaction record ---
    try {
        const amountCentavos = info.amount || 0;
        const transactionData = {
            // Identity
            userId,
            userEmail,

            // Payment details
            amount: amountCentavos,          // In centavos (149900 = ₱1,499.00)
            currency: info.currency || 'PHP',
            paymentMethod: 'gcash',
            paymongoReferenceId,
            paymongoPaymentIntentId: info.paymentIntentId || '',
            paymongoCheckoutSessionId: info.checkoutSessionId || '',

            // Plan info
            plan: PRO_PLAN_CONFIG.plan,
            subscriptionPeriodStart: now,
            subscriptionPeriodEnd: expiresAt,

            // Status & audit
            status: 'paid',
            createdAt: now,
            webhookEventId,
        };

        await getDb().collection('transactions').add(transactionData);
        console.log(`[WEBHOOK] ✅ Transaction recorded for user ${userId}.`);
    } catch (err) {
        // Non-fatal — subscription is already activated; log but don't fail the response
        console.error('[WEBHOOK] ⚠️ Failed to record transaction (non-fatal):', err.message);
    }

    // --- 10. Acknowledge to PayMongo (must respond 2xx within 30s) ---
    return res.status(200).json({ received: true, processed: true });
});

export default router;
