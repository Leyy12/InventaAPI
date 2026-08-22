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
        console.warn('[WEBHOOK] ⚠️ Signature verification failed — rejecting request.');
        return res.status(401).json({ error: 'Invalid signature.' });
    }


    // --- 2. Parse event ---
    let event;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return res.status(400).json({ error: 'Invalid JSON payload.' });
    }

    const eventType = event?.data?.attributes?.type;
    console.log(`[WEBHOOK] Received event: ${eventType} | ID: ${event?.data?.id}`);

    // --- 3. Handle payment.paid only ---
    if (eventType !== 'payment.paid') {
        // Acknowledge other events without processing
        return res.status(200).json({ received: true, processed: false });
    }

    const payment = event?.data?.attributes?.data;
    const attributes = payment?.attributes;

    if (!attributes) {
        console.error('[WEBHOOK] ❌ Missing payment attributes in event payload.');
        return res.status(422).json({ error: 'Malformed payment payload.' });
    }

    // userId is embedded in payment metadata during checkout creation
    const userId = attributes?.metadata?.userId;
    const userEmail = attributes?.metadata?.userEmail || '';
    const paymongoReferenceId = attributes?.id || payment?.id || '';
    const webhookEventId = event?.data?.id || '';

    if (!userId) {
        console.error('[WEBHOOK] ❌ No userId in payment metadata. Cannot activate subscription.');
        return res.status(422).json({ error: 'Missing userId in metadata.' });
    }

    // --- 4. Idempotency check — prevent double-processing same event ---
    try {
        const existingTx = await getFirestore()
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

    // --- 5. Compute subscription period ---
    const now = new Date().toISOString();
    const expiresAt = daysFromNow(PRO_PLAN_CONFIG.subscriptionDurationDays);

    // --- 6. Update user document via Admin SDK (bypasses Firestore rules) ---
    try {
        const userRef = getDb().collection('users').doc(userId);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            console.error(`[WEBHOOK] ❌ User document not found for uid: ${userId}`);
            return res.status(404).json({ error: 'User not found.' });
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

    // --- 7. Create transaction record ---
    try {
        const amountCentavos = attributes?.amount || 0;
        const transactionData = {
            // Identity
            userId,
            userEmail,

            // Payment details
            amount: amountCentavos,          // In centavos (149900 = ₱1,499.00)
            currency: attributes?.currency || 'PHP',
            paymentMethod: 'gcash',
            paymongoReferenceId,
            paymongoPaymentIntentId: attributes?.payment_intent_id || '',

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

    // --- 8. Acknowledge to PayMongo (must respond 2xx within 30s) ---
    return res.status(200).json({ received: true, processed: true });
});

export default router;
