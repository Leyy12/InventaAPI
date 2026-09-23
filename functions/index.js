const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const resendApiKey = defineSecret('RESEND_API_KEY');
const trialWarningFrom = defineString('TRIAL_WARNING_FROM_EMAIL');
initializeApp();

// Existing optional schedule retained. API enforcement never depends on it.
exports.downgradeExpiredSubscriptions = onSchedule({
    schedule: '0 16 * * *', timeZone: 'UTC', region: 'asia-southeast1',
    memory: '256MiB', timeoutSeconds: 300,
}, async () => {
    const { normalizeExpiredAccount } = await import('./subscription-lifecycle.mjs');
    const db = getFirestore();
    let downgraded = 0;
    for (const plan of ['Pro', 'pro', 'Professional', 'professional']) {
        const users = await db.collection('users').where('plan', '==', plan).get();
        for (const user of users.docs) {
            // Re-read in a transaction: a concurrent renewal cannot be lost.
            try { if (await normalizeExpiredAccount(db, user.id)) downgraded++; }
            catch (error) { console.error('[SUBSCRIPTION REVIEW]', { uid: user.id, code: error.code || 'UNAVAILABLE' }); }
        }
    }
    console.log('[SUBSCRIPTION NORMALIZATION]', { downgraded });
});

// Delivery is advisory: API entitlement/expiration and the 500-request cap remain
// authoritative even if this scheduler or the email provider is unavailable.
exports.monitorFreeTrials = onSchedule({
    schedule: '0 */6 * * *', timeZone: 'UTC', region: 'asia-southeast1',
    memory: '256MiB', timeoutSeconds: 300, secrets: [resendApiKey],
}, async () => {
    const { processTrialWarning } = await import('./trial-warning.mjs');
    const { sendResendTrialEmail } = await import('./trial-warning-email.mjs');
    const from = trialWarningFrom.value(), apiKey = resendApiKey.value();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from || '') || !apiKey) throw new Error('Trial warning email configuration is missing or invalid.');
    const db = getFirestore(), now = new Date();
    // ISO UTC Trial expirations are written by activation. One indexed field,
    // bounded pages; no full users scan and no new composite index.
    let query = db.collection('users').where('trialExpiresAt', '>', now.toISOString())
        .where('trialExpiresAt', '<=', new Date(now.getTime() + 3 * 86400000).toISOString())
        .orderBy('trialExpiresAt').limit(200);
    let inspected = 0, accepted = 0, failed = 0;
    for (;;) {
        const page = await query.get();
        if (page.empty) break;
        for (const user of page.docs) {
            inspected++;
            try {
                if (await processTrialWarning(db, user.id, {
                    from, sendEmail: (payload, key) => sendResendTrialEmail(payload, key, apiKey),
                })) accepted++;
            } catch (error) {
                failed++;
                console.error('[TRIAL WARNING]', { uid: user.id, code: 'DELIVERY_UNCONFIRMED' });
            }
        }
        if (page.size < 200) break;
        query = query.startAfter(page.docs.at(-1));
    }
    console.log('[TRIAL MONITOR]', { inspected, accepted, failed });
    if (failed) throw new Error('Some Trial warnings were not confirmed; retry on the next scheduled run.');
});
